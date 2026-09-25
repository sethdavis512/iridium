import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Bucket = { key: string; hits: Date[]; expiresAt: Date };

// An in-memory stand-in for the RateLimitBucket table, so rateLimit() runs its
// real read-decide-write sequence. Postgres-level atomicity (the advisory
// lock) is verified against a real database, not here.
const { buckets, mockPrisma, mockTx, mockLog } = vi.hoisted(() => {
    const buckets = new Map<string, Bucket>();

    const rateLimitBucket = {
        findUnique: vi.fn(
            async ({ where }: { where: { key: string } }) =>
                buckets.get(where.key) ?? null,
        ),
        upsert: vi.fn(
            async ({
                where,
                create,
                update,
            }: {
                where: { key: string };
                create: Bucket;
                update: Omit<Bucket, 'key'>;
            }) => {
                const existing = buckets.get(where.key);
                const row = existing ? { ...existing, ...update } : create;
                buckets.set(where.key, row);
                return row;
            },
        ),
        deleteMany: vi.fn(
            async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
                let count = 0;
                for (const [key, bucket] of buckets) {
                    if (bucket.expiresAt < where.expiresAt.lt) {
                        buckets.delete(key);
                        count++;
                    }
                }
                return { count };
            },
        ),
    };

    const mockTx = {
        $executeRaw: vi.fn(async () => 1),
        rateLimitBucket,
    };

    return {
        buckets,
        mockTx,
        mockPrisma: {
            rateLimitBucket,
            $transaction: vi.fn(
                async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
                    fn(mockTx),
            ),
        },
        mockLog: { exception: vi.fn() },
    };
});

vi.mock('~/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('~/lib/logger.server', () => ({ log: mockLog }));

import { rateLimit, slideWindow } from './rate-limit.server';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Each test starts a day after the previous one, so the once-a-minute cleanup
// throttle (module state) never carries over between tests.
let clock = Date.UTC(2026, 0, 1);

beforeEach(() => {
    vi.clearAllMocks();
    buckets.clear();
    clock += 24 * HOUR;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clock);
});

afterAll(() => {
    vi.useRealTimers();
});

function advance(ms: number) {
    clock += ms;
    vi.setSystemTime(clock);
}

describe('slideWindow', () => {
    it('records the first hit and reports what is left', () => {
        const step = slideWindow({
            hits: [],
            now: 1_000,
            maxRequests: 3,
            windowMs: MINUTE,
        });

        expect(step).toEqual({ success: true, remaining: 2, hits: [1_000] });
    });

    it('drops hits that are a full window old', () => {
        const now = 10 * MINUTE;
        const step = slideWindow({
            hits: [now - MINUTE, now - MINUTE + 1],
            now,
            maxRequests: 2,
            windowMs: MINUTE,
        });

        expect(step).toEqual({
            success: true,
            remaining: 0,
            hits: [now - MINUTE + 1, now],
        });
    });

    it('rejects at the cap without recording the hit', () => {
        const step = slideWindow({
            hits: [100, 200],
            now: 300,
            maxRequests: 2,
            windowMs: MINUTE,
        });

        expect(step).toEqual({
            success: false,
            remaining: 0,
            hits: [100, 200],
        });
    });

    it('does not mutate the hits it was given', () => {
        const hits = [100];
        slideWindow({ hits, now: 200, maxRequests: 5, windowMs: MINUTE });

        expect(hits).toEqual([100]);
    });
});

describe('rateLimit', () => {
    it('allows requests up to the limit, then rejects', async () => {
        const opts = { key: 'chat:u1', maxRequests: 3, windowMs: MINUTE };

        expect(await rateLimit(opts)).toEqual({ success: true, remaining: 2 });
        expect(await rateLimit(opts)).toEqual({ success: true, remaining: 1 });
        expect(await rateLimit(opts)).toEqual({ success: true, remaining: 0 });
        expect(await rateLimit(opts)).toEqual({ success: false, remaining: 0 });
    });

    it('enforces the chat limit of 20 per minute as a sliding window', async () => {
        const opts = { key: 'chat:u1', maxRequests: 20, windowMs: MINUTE };

        for (let i = 0; i < 20; i++) {
            expect((await rateLimit(opts)).success).toBe(true);
            advance(1_000);
        }
        expect((await rateLimit(opts)).success).toBe(false);

        // A minute after the first hit only that hit has aged out, so exactly
        // one more request fits.
        advance(MINUTE - 20_000);
        expect(await rateLimit(opts)).toEqual({ success: true, remaining: 0 });
        expect((await rateLimit(opts)).success).toBe(false);
    });

    it('takes the per-key advisory lock before reading the bucket', async () => {
        await rateLimit({ key: 'chat:u1', maxRequests: 5, windowMs: MINUTE });

        const [sql, ...params] = mockTx.$executeRaw.mock
            .calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
        expect(sql.join('?')).toContain('pg_advisory_xact_lock');
        expect(params).toEqual(['chat:u1']);
        expect(mockTx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
            mockTx.rateLimitBucket.findUnique.mock.invocationCallOrder[0],
        );
    });

    it('writes nothing when a request is rejected', async () => {
        const opts = { key: 'chat:u1', maxRequests: 1, windowMs: MINUTE };
        await rateLimit(opts);
        mockTx.rateLimitBucket.upsert.mockClear();

        await rateLimit(opts);

        expect(mockTx.rateLimitBucket.upsert).not.toHaveBeenCalled();
    });

    it('isolates different keys', async () => {
        await rateLimit({ key: 'chat:a', maxRequests: 1, windowMs: MINUTE });

        const result = await rateLimit({
            key: 'chat:b',
            maxRequests: 1,
            windowMs: MINUTE,
        });

        expect(result.success).toBe(true);
    });

    it('prunes aged-out hits from the stored bucket', async () => {
        const opts = { key: 'chat:u1', maxRequests: 1, windowMs: MINUTE };
        await rateLimit(opts);
        advance(MINUTE);

        expect((await rateLimit(opts)).success).toBe(true);
        expect(buckets.get('chat:u1')?.hits).toEqual([new Date(clock)]);
    });

    it('keeps the note-creation window of an hour', async () => {
        const opts = { key: 'note-create:u1', maxRequests: 10, windowMs: HOUR };
        for (let i = 0; i < 10; i++) await rateLimit(opts);

        advance(HOUR - 1);
        expect((await rateLimit(opts)).success).toBe(false);

        advance(1);
        expect((await rateLimit(opts)).success).toBe(true);
    });

    it('expires a bucket one window after its newest hit, never earlier', async () => {
        const start = clock;
        await rateLimit({ key: 'k', maxRequests: 5, windowMs: HOUR });
        expect(buckets.get('k')?.expiresAt).toEqual(new Date(start + HOUR));

        advance(MINUTE);
        await rateLimit({ key: 'k', maxRequests: 5, windowMs: MINUTE });
        expect(buckets.get('k')?.expiresAt).toEqual(new Date(start + HOUR));
    });
});

describe('expired bucket cleanup', () => {
    it('sweeps expired buckets at most once a minute per process', async () => {
        buckets.set('stale', {
            key: 'stale',
            hits: [new Date(clock - HOUR)],
            expiresAt: new Date(clock - 1),
        });
        const opts = { key: 'chat:u1', maxRequests: 5, windowMs: MINUTE };

        await rateLimit(opts);
        await rateLimit(opts);

        expect(mockPrisma.rateLimitBucket.deleteMany).toHaveBeenCalledTimes(1);
        expect(mockPrisma.rateLimitBucket.deleteMany).toHaveBeenCalledWith({
            where: { expiresAt: { lt: new Date(clock) } },
        });
        expect(buckets.has('stale')).toBe(false);
        expect(buckets.has('chat:u1')).toBe(true);

        advance(MINUTE);
        await rateLimit(opts);
        expect(mockPrisma.rateLimitBucket.deleteMany).toHaveBeenCalledTimes(2);
    });

    it('logs a failed sweep without failing the request', async () => {
        mockPrisma.rateLimitBucket.deleteMany.mockRejectedValueOnce(
            new Error('db down'),
        );

        const result = await rateLimit({
            key: 'chat:u1',
            maxRequests: 5,
            windowMs: MINUTE,
        });

        expect(result.success).toBe(true);
        await vi.waitFor(() =>
            expect(mockLog.exception).toHaveBeenCalledWith(
                'rate_limit_cleanup_failed',
                expect.any(Error),
            ),
        );
    });
});
