import type { EventEmitter } from 'node:events';

import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { log } from '~/lib/logger.server';

import { logMemoryPoolErrors } from './pool-errors';

const adapters: PostgreSQLMemoryAdapter[] = [];

/** A real adapter whose pool never connects (port 1 refuses at once). */
function unreachableAdapter() {
    const adapter = new PostgreSQLMemoryAdapter({
        connection: 'postgresql://postgres:postgres@127.0.0.1:1/voltagent',
    });
    // The constructor starts schema setup right away; these tests only need
    // the pool, so swallow that connection failure.
    void (Reflect.get(adapter, 'initPromise') as Promise<void>).catch(() => {});
    adapters.push(adapter);
    return adapter;
}

function poolOf(adapter: PostgreSQLMemoryAdapter) {
    return Reflect.get(adapter, 'pool') as EventEmitter;
}

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(adapters.splice(0).map((adapter) => adapter.close()));
});

describe('logMemoryPoolErrors', () => {
    it('reaches the pool the installed @voltagent/postgres builds', () => {
        const adapter = unreachableAdapter();
        expect(poolOf(adapter).listenerCount('error')).toBe(0);

        expect(logMemoryPoolErrors(adapter)).toBe(true);
        expect(poolOf(adapter).listenerCount('error')).toBe(1);
    });

    it('logs an idle-client error instead of throwing it', () => {
        const exception = vi
            .spyOn(log, 'exception')
            .mockImplementation(() => {});
        const adapter = unreachableAdapter();
        const error = new Error('terminating connection');

        // Without a listener, EventEmitter throws an unhandled 'error' event.
        expect(() => poolOf(adapter).emit('error', error)).toThrow(error);

        logMemoryPoolErrors(adapter);
        expect(() => poolOf(adapter).emit('error', error)).not.toThrow();
        expect(exception).toHaveBeenCalledWith('voltagent_pool_error', error);
    });

    it('warns instead of failing boot when the pool has moved', () => {
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});

        expect(logMemoryPoolErrors({} as PostgreSQLMemoryAdapter)).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            'voltagent_pool_unguarded',
            expect.objectContaining({ message: expect.any(String) }),
        );
    });
});
