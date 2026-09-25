import { Pool } from 'pg';

import { pgPoolConfig, POOL_MAX } from '~/lib/db-pool.server';
import { env } from '~/lib/env.server';
import { log } from '~/lib/logger.server';
import prisma from '~/lib/prisma';
import { onShutdown } from '~/lib/shutdown.server';

/**
 * Budget for each database check. A database that stops responding fails the
 * probe quickly instead of holding it open for Railway's 100s
 * healthcheckTimeout (and it stays under the Dockerfile HEALTHCHECK's 5s).
 */
export const CHECK_TIMEOUT_MS = 2_500;

// The app DB check reuses Prisma's pool. VoltAgent's adapter keeps its pg
// pool private, so the VoltAgent DB gets one small dedicated probe pool.
let voltagentPool: Pool | null = null;

function getVoltagentPool(): Pool {
    if (!voltagentPool) {
        const pool = new Pool(
            pgPoolConfig(env.VOLTAGENT_DATABASE_URL, POOL_MAX.healthcheck),
        );
        // An idle client error with no listener crashes the process.
        pool.on('error', (error) =>
            log.exception('healthcheck_pool_error', error),
        );
        onShutdown(() => pool.end());
        voltagentPool = pool;
    }

    return voltagentPool;
}

function withTimeout<T>(check: () => Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`timed out after ${ms}ms`)),
            ms,
        );
    });
    // Promise.resolve().then(check) turns a synchronous throw into a rejection.
    return Promise.race([Promise.resolve().then(check), timeout]).finally(() =>
        clearTimeout(timer),
    );
}

export async function loader() {
    const checks = {
        iridium: () => prisma.$queryRaw`SELECT 1`,
        voltagent: () => getVoltagentPool().query('SELECT 1'),
    };

    const names = Object.keys(checks) as (keyof typeof checks)[];
    const results = await Promise.allSettled(
        names.map((name) => withTimeout(checks[name], CHECK_TIMEOUT_MS)),
    );

    const failures: Record<string, string> = {};
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            failures[names[i]] =
                result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason);
        }
    });

    if (Object.keys(failures).length > 0) {
        // Details (hostnames, auth errors) stay in server logs; the public
        // body only says unhealthy.
        log.error('healthcheck_failed', { failures });
        return Response.json({ status: 'unhealthy' }, { status: 503 });
    }

    return Response.json({ status: 'ok' }, { status: 200 });
}
