import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { purgeThreads, purgeNotes, forgetOrphans, rateLimit, cleanups } =
    vi.hoisted(() => ({
        purgeThreads: vi.fn(),
        purgeNotes: vi.fn(),
        forgetOrphans: vi.fn(),
        rateLimit: vi.fn(),
        cleanups: [] as Array<() => void>,
    }));

vi.mock('~/models/thread.server', () => ({
    purgeSoftDeletedThreads: (days: number) => purgeThreads(days),
}));
vi.mock('~/models/note.server', () => ({
    purgeSoftDeletedNotes: (days: number) => purgeNotes(days),
}));
vi.mock('~/lib/thread-chat.server', () => ({
    threadChat: { forgetOrphans: () => forgetOrphans() },
}));
vi.mock('~/lib/rate-limit.server', () => ({
    rateLimit: (...args: unknown[]) => rateLimit(...args),
}));
vi.mock('~/lib/shutdown.server', () => ({
    onShutdown: (cleanup: () => void) => cleanups.push(cleanup),
}));
vi.mock('~/lib/logger.server', () => ({
    log: { exception: vi.fn(), info: vi.fn() },
}));

import { purgeSoftDeleted, scheduleInlinePurge } from './purge.server';

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    purgeThreads.mockResolvedValue({ count: 2 });
    purgeNotes.mockResolvedValue({ count: 3 });
    forgetOrphans.mockResolvedValue(4);
});

afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.useRealTimers();
});

describe('purgeSoftDeleted', () => {
    it('purges past the retention window and sweeps orphaned Thread memory', async () => {
        await expect(purgeSoftDeleted()).resolves.toEqual({
            threadsDeleted: 2,
            notesDeleted: 3,
            threadMemoriesForgotten: 4,
        });
        expect(purgeThreads).toHaveBeenCalledWith(30);
        expect(purgeNotes).toHaveBeenCalledWith(30);
    });
});

describe('scheduleInlinePurge', () => {
    it('purges at boot and then only when the daily gate lets it through', async () => {
        rateLimit
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValue({ success: false });

        scheduleInlinePurge();
        await vi.waitFor(() => expect(purgeThreads).toHaveBeenCalledTimes(1));
        expect(rateLimit).toHaveBeenCalledWith({
            key: 'job:purge-soft-deleted',
            maxRequests: 1,
            windowMs: 24 * 60 * 60 * 1000,
        });

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(rateLimit).toHaveBeenCalledTimes(2);
        expect(purgeThreads).toHaveBeenCalledTimes(1);
    });

    it('stops checking on shutdown', async () => {
        rateLimit.mockResolvedValue({ success: false });

        scheduleInlinePurge();
        cleanups.splice(0).forEach((cleanup) => cleanup());
        await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

        expect(rateLimit).toHaveBeenCalledTimes(1);
    });
});
