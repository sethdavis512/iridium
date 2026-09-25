import { Agent, createServer, get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { log } from './logger.server';
import {
    onShutdown,
    runShutdownCleanups,
    waitForDrain,
} from './shutdown.server';

function listen(server: Server) {
    return new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () =>
            resolve((server.address() as AddressInfo).port),
        );
    });
}

function fetchBody(port: number, agent: Agent) {
    return new Promise<string>((resolve, reject) => {
        get({ host: '127.0.0.1', port, agent }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => (body += chunk));
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('waitForDrain', () => {
    it('lets an in-flight streamed response finish, then resolves promptly', async () => {
        let finish: (() => void) | undefined;
        const server = createServer((_req, res) => {
            res.write('partial ');
            finish = () => res.end('done');
        });
        const port = await listen(server);
        // Keep-alive, like the proxy in front of the app. Without closing idle
        // sockets, the drain would wait out the 5s keepAliveTimeout.
        const agent = new Agent({ keepAlive: true });

        const body = fetchBody(port, agent);
        await vi.waitFor(() => expect(finish).toBeDefined());

        let drained = false;
        const drain = waitForDrain(server).then(() => {
            drained = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(server.listening).toBe(false);
        expect(drained).toBe(false);

        const finishedAt = Date.now();
        finish?.();
        await expect(body).resolves.toBe('partial done');
        await drain;
        expect(Date.now() - finishedAt).toBeLessThan(1000);

        agent.destroy();
    });

    it('resolves at once when no server has handled a request', async () => {
        await expect(waitForDrain(undefined)).resolves.toBeUndefined();
    });
});

describe('runShutdownCleanups', () => {
    it('runs every cleanup once, even when one fails', async () => {
        const exception = vi
            .spyOn(log, 'exception')
            .mockImplementation(() => {});
        const closed: string[] = [];
        onShutdown(async () => {
            closed.push('prisma');
        });
        onShutdown(() => {
            throw new Error('pool already ended');
        });
        onShutdown(async () => {
            closed.push('voltagent');
        });

        await runShutdownCleanups();
        await runShutdownCleanups();

        expect(closed).toEqual(['prisma', 'voltagent']);
        expect(exception).toHaveBeenCalledTimes(1);
        expect(exception).toHaveBeenCalledWith(
            'shutdown_cleanup_failed',
            expect.any(Error),
        );
    });
});
