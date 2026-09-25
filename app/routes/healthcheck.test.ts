import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw, poolQuery } = vi.hoisted(() => ({
    queryRaw: vi.fn(),
    poolQuery: vi.fn(),
}));

vi.mock('~/lib/prisma', () => ({ default: { $queryRaw: queryRaw } }));
vi.mock('pg', () => ({
    Pool: class {
        query = poolQuery;
    },
}));

import { CHECK_TIMEOUT_MS, loader } from './healthcheck';

describe('healthcheck loader', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
        poolQuery.mockReset().mockResolvedValue({ rows: [] });
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        consoleError.mockRestore();
    });

    it('returns ok when both databases answer', async () => {
        const res = await loader();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ status: 'ok' });
    });

    it('hides failure details from the response but logs them', async () => {
        queryRaw.mockRejectedValue(
            new Error('password authentication failed for user "postgres"'),
        );

        const res = await loader();
        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({ status: 'unhealthy' });

        const logged = consoleError.mock.calls.flat().join('\n');
        expect(logged).toContain('healthcheck_failed');
        expect(logged).toContain('password authentication failed');
    });

    it('fails a hanging check after the timeout instead of waiting', async () => {
        vi.useFakeTimers();
        poolQuery.mockReturnValue(new Promise(() => {}));

        const pending = loader();
        await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
        const res = await pending;

        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({ status: 'unhealthy' });
        expect(consoleError.mock.calls.flat().join('\n')).toContain(
            `timed out after ${CHECK_TIMEOUT_MS}ms`,
        );
    });
});
