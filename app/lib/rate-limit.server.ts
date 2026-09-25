/**
 * Postgres-backed sliding-window rate limiter, shared by every app instance.
 *
 * Each bucket key is one `RateLimitBucket` row holding the timestamps of the
 * hits still inside the window. The check-and-record step runs in a
 * transaction that first takes a per-key advisory lock, so concurrent
 * requests for the same key (on any replica) are serialized and cannot both
 * slip under the limit. Limits survive deploys because nothing lives in
 * process memory.
 */
import prisma from '~/lib/prisma';
import { log } from '~/lib/logger.server';

export type RateLimitOptions = {
    /** Unique key for the rate limit bucket (e.g. `chat:${userId}`). */
    key: string;
    /** Maximum number of requests allowed in the window. */
    maxRequests: number;
    /** Window duration in milliseconds. */
    windowMs: number;
};

export type RateLimitResult = { success: boolean; remaining: number };

type WindowStep = RateLimitResult & {
    /** Hits (epoch ms) still inside the window, including this one if allowed. */
    hits: number[];
};

/** Minimum gap between expired-bucket sweeps, per process. */
const CLEANUP_INTERVAL_MS = 60_000;

let lastCleanupAt = 0;

/**
 * Pure sliding-window step: drop hits that have aged out of the window, then
 * record `now` if there is still room.
 */
export function slideWindow({
    hits,
    now,
    maxRequests,
    windowMs,
}: {
    hits: number[];
    now: number;
    maxRequests: number;
    windowMs: number;
}): WindowStep {
    const live = hits.filter((t) => now - t < windowMs);

    if (live.length >= maxRequests) {
        return { success: false, remaining: 0, hits: live };
    }

    live.push(now);
    return { success: true, remaining: maxRequests - live.length, hits: live };
}

export async function rateLimit({
    key,
    maxRequests,
    windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now();

    const result = await prisma.$transaction(async (tx) => {
        // Held until commit: every other caller on this key waits here, then
        // reads the bucket this transaction wrote.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

        const bucket = await tx.rateLimitBucket.findUnique({
            where: { key },
        });
        const step = slideWindow({
            hits: bucket?.hits.map((hit) => hit.getTime()) ?? [],
            now,
            maxRequests,
            windowMs,
        });

        // A rejected request records nothing, so there is nothing to write.
        if (step.success) {
            const hits = step.hits.map((hit) => new Date(hit));
            // The bucket is empty once its newest hit ages out. Never move
            // expiry earlier, in case a key is shared by different windows.
            const expiresAt = new Date(
                Math.max(bucket?.expiresAt.getTime() ?? 0, now + windowMs),
            );

            await tx.rateLimitBucket.upsert({
                where: { key },
                create: { key, hits, expiresAt },
                update: { hits, expiresAt },
            });
        }

        return { success: step.success, remaining: step.remaining };
    });

    sweepExpiredBuckets(now);

    return result;
}

/** Delete buckets whose hits have all aged out of their window. */
export function purgeExpiredRateLimitBuckets(now: Date) {
    return prisma.rateLimitBucket.deleteMany({
        where: { expiresAt: { lt: now } },
    });
}

/** Fire-and-forget sweep, throttled so it runs at most once per interval. */
function sweepExpiredBuckets(now: number) {
    if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    lastCleanupAt = now;

    purgeExpiredRateLimitBuckets(new Date(now)).catch((error: unknown) => {
        log.exception('rate_limit_cleanup_failed', error);
    });
}
