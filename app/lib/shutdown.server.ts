import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type { Server } from 'node:http';

import { log } from '~/lib/logger.server';

type Cleanup = () => unknown;

const cleanups = new Set<Cleanup>();

// Node's built-in HTTP diagnostics channels. react-router-serve creates the
// http.Server, so the app learns about it from these instead of a reference.
const REQUEST_START = 'http.server.request.start';
const RESPONSE_FINISH = 'http.server.response.finish';

/**
 * Registers a resource (a database pool, mostly) to release once the HTTP
 * server has drained. Registering does nothing by itself: only the production
 * server calls installGracefulShutdown(), so scripts, tests, and the
 * Trigger.dev worker that import a registering module are unaffected.
 */
export function onShutdown(cleanup: Cleanup) {
    cleanups.add(cleanup);
}

/** Runs each registered cleanup once, logging failures instead of throwing. */
export async function runShutdownCleanups() {
    const pending = [...cleanups];
    cleanups.clear();

    const results = await Promise.allSettled(
        pending.map(async (cleanup) => cleanup()),
    );
    for (const result of results) {
        if (result.status === 'rejected') {
            log.exception('shutdown_cleanup_failed', result.reason);
        }
    }
}

/**
 * Resolves once `server` has closed and every in-flight response (chat
 * streams included) has finished. react-router-serve's own SIGTERM/SIGINT
 * listener calls server.close(); this closes it only if nothing else did.
 */
export function waitForDrain(server: Server | undefined) {
    return new Promise<void>((resolve) => {
        if (!server?.listening) {
            resolve();
            return;
        }

        // A keep-alive socket (a proxy's, say) would otherwise hold the server
        // open for keepAliveTimeout after its last response, so close each
        // connection as soon as it goes idle.
        const closeIdle = () =>
            setImmediate(() => server.closeIdleConnections());
        subscribe(RESPONSE_FINISH, closeIdle);

        server.once('close', () => {
            unsubscribe(RESPONSE_FINISH, closeIdle);
            resolve();
        });
        setImmediate(() => {
            if (server.listening) server.close();
        });
    });
}

/**
 * On SIGTERM or SIGINT: stop accepting connections, let in-flight requests
 * finish, close the pools registered with onShutdown(), and exit 0. Without
 * this, react-router-serve closes its server but the open pools keep the
 * process alive until the platform's SIGKILL. The platform still bounds the
 * wait (RAILWAY_DEPLOYMENT_DRAINING_SECONDS, `docker stop -t`).
 */
export function installGracefulShutdown() {
    let server: Server | undefined;

    const capture = (message: unknown) => {
        server = (message as { server: Server }).server;
        unsubscribe(REQUEST_START, capture);
    };
    subscribe(REQUEST_START, capture);

    const shutdown = async (signal: NodeJS.Signals) => {
        log.info('shutdown_started', { signal });
        await waitForDrain(server);
        await runShutdownCleanups();
        log.info('shutdown_complete', { signal });
        process.exit(0);
    };

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, (received) => void shutdown(received));
    }
}
