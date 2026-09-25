import {
    PostgreSQLMemoryAdapter,
    type PostgreSQLMemoryOptions,
} from '@voltagent/postgres';

import { pgPoolConfig, POOL_MAX } from '~/lib/db-pool.server';

import { logMemoryPoolErrors } from './pool-errors';

/** A conversation id no chat uses, looked up to prove the adapter works. */
const READY_PROBE_ID = '__iridium_ready_probe__';

/**
 * Builds VoltAgent's Postgres memory adapter and resolves once its schema
 * setup has finished and a query has run; rejects, with the adapter's pool
 * closed, when either fails.
 *
 * The adapter (@voltagent/postgres 2.1.3) starts schema setup in its
 * constructor, handles no failure, and never retries: a database that is down
 * at that moment leaves a rejected promise that crashes Node as an unhandled
 * rejection and that every later call awaits and rethrows. So a failed
 * adapter is discarded, never reused, and the caller builds a fresh one to
 * retry. Every public adapter method awaits that setup promise first, so the
 * probe lookup below both handles its rejection and surfaces it here.
 */
export async function openMemoryStorage(connectionString: string) {
    const storage = new PostgreSQLMemoryAdapter({
        // The adapter spreads an object `connection` into `new pg.Pool()`
        // (verified in @voltagent/postgres 2.1.3), so the shared pg pool
        // options pass through; its type only lists host/port/user fields,
        // hence the cast. maxConnections sets the pool's `max`.
        connection: pgPoolConfig(
            connectionString,
            POOL_MAX.voltagent,
        ) as PostgreSQLMemoryOptions['connection'],
        maxConnections: POOL_MAX.voltagent,
    });
    logMemoryPoolErrors(storage);

    try {
        await storage.getConversation(READY_PROBE_ID);
    } catch (error) {
        await storage.close().catch(() => {});
        throw error;
    }
    return storage;
}
