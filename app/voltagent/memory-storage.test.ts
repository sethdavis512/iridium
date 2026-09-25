import type { EventEmitter } from 'node:events';

import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openMemoryStorage } from './memory-storage';

/** Port 1 refuses at once, like a stopped database. */
const UNREACHABLE = 'postgresql://postgres:postgres@127.0.0.1:1/voltagent';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('openMemoryStorage', () => {
    // Vitest fails the run on an unhandled rejection, so these also prove the
    // setup promise the adapter's constructor starts is handled.
    it('rejects with the connection error when the database is down', async () => {
        await expect(openMemoryStorage(UNREACHABLE)).rejects.toThrow(
            /ECONNREFUSED/,
        );
    });

    it('closes the failed adapter, whose pool was guarded, so nothing leaks', async () => {
        const close = vi.spyOn(PostgreSQLMemoryAdapter.prototype, 'close');

        await openMemoryStorage(UNREACHABLE).catch(() => {});

        expect(close).toHaveBeenCalledTimes(1);
        const adapter = close.mock.contexts[0] as PostgreSQLMemoryAdapter;
        const pool = Reflect.get(adapter, 'pool') as EventEmitter;
        expect(Reflect.get(pool, 'ended')).toBe(true);
        expect(pool.listenerCount('error')).toBe(1);
    });
});
