import { EventEmitter } from 'node:events';

import type { PostgreSQLMemoryAdapter } from '@voltagent/postgres';

import { log } from '~/lib/logger.server';

/**
 * node-postgres emits an idle client's error (the database restarting or
 * dropping the connection) on its pool, and a pool with no 'error' listener
 * turns it into an uncaught exception that exits the process.
 * PostgreSQLMemoryAdapter (@voltagent/postgres 2.1.3) builds its pg.Pool in
 * the constructor, never listens on it, and takes no pool of ours. The pool
 * is TypeScript-private but a plain `pool` property at runtime, so this
 * reaches it there; pool-errors.test.ts fails if an upgrade moves it.
 *
 * Returns false, with a warning, when the pool isn't there, so an upgrade
 * can't stop the app from booting.
 */
export function logMemoryPoolErrors(adapter: PostgreSQLMemoryAdapter) {
    const pool: unknown = Reflect.get(adapter, 'pool');
    if (!(pool instanceof EventEmitter)) {
        log.warn('voltagent_pool_unguarded', {
            message:
                'PostgreSQLMemoryAdapter no longer exposes its pg pool, so an ' +
                'idle-client error can crash the process. Recheck ' +
                'app/voltagent/pool-errors.ts.',
        });
        return false;
    }

    pool.on('error', (error: Error) =>
        log.exception('voltagent_pool_error', error),
    );
    return true;
}
