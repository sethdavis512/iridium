import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';

import { pgPoolConfig, POOL_MAX } from '~/lib/db-pool.server';
import { log } from '~/lib/logger.server';

export type MemoryStorage = {
    store: PostgresStore;
    /** Releases the store and the pg pool behind it. */
    close(): Promise<void>;
};

/**
 * Builds Mastra's Postgres store on a pool of our own and resolves once its
 * schema setup (`mastra_*` tables) has finished and a query has run; rejects,
 * with the pool closed, when either fails.
 *
 * The pool is ours so the shared pg options (timeouts, size) apply and so an
 * idle client's error is heard: node-postgres emits it on the pool, and a
 * pool with no 'error' listener turns it into an uncaught exception that
 * exits the process. PostgresStore never closes a caller-provided pool, so
 * close() ends it here.
 */
export async function openMemoryStorage(
    connectionString: string,
): Promise<MemoryStorage> {
    const pool = new Pool(pgPoolConfig(connectionString, POOL_MAX.mastra));
    pool.on('error', (error) => log.exception('mastra_pool_error', error));

    const store = new PostgresStore({ id: 'iridium-memory', pool });
    const close = async () => {
        await store.close().catch(() => {});
        await pool.end().catch(() => {});
    };

    try {
        await store.init();
        await pool.query('SELECT 1');
    } catch (error) {
        await close();
        throw error;
    }

    return { store, close };
}
