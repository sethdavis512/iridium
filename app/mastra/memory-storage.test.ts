import type { EventEmitter } from 'node:events';

import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openMemoryStorage } from './memory-storage';

/** Port 1 refuses at once, like a stopped database. */
const UNREACHABLE = 'postgresql://postgres:postgres@127.0.0.1:1/mastra';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('openMemoryStorage', () => {
    it('rejects with the connection error when the database is down', async () => {
        await expect(openMemoryStorage(UNREACHABLE)).rejects.toThrow(
            /ECONNREFUSED/,
        );
    });

    it('closes the store and ends its guarded pool, so nothing leaks', async () => {
        const close = vi.spyOn(PostgresStore.prototype, 'close');
        const end = vi.spyOn(Pool.prototype, 'end');

        await openMemoryStorage(UNREACHABLE).catch(() => {});

        expect(close).toHaveBeenCalledTimes(1);
        expect(end).toHaveBeenCalledTimes(1);
        const pool = end.mock.contexts[0] as Pool & EventEmitter;
        expect(pool.ended).toBe(true);
        // An idle client's error with no listener would exit the process.
        expect(pool.listenerCount('error')).toBe(1);
    });
});
