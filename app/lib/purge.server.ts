import { log } from '~/lib/logger.server';
import { rateLimit } from '~/lib/rate-limit.server';
import { onShutdown } from '~/lib/shutdown.server';
import { threadChat } from '~/lib/thread-chat.server';
import { purgeSoftDeletedNotes } from '~/models/note.server';
import { purgeSoftDeletedThreads } from '~/models/thread.server';

/** Soft-deleted rows older than this are gone for good. */
export const RETENTION_DAYS = 30;

/**
 * Hard-delete Threads and Notes whose soft-delete window has lapsed, then
 * forget Thread memory whose Thread is deleted or gone. Shared by the
 * Trigger.dev schedule and the inline fallback, so they never diverge.
 */
export async function purgeSoftDeleted() {
    const [threads, notes] = await Promise.all([
        purgeSoftDeletedThreads(RETENTION_DAYS),
        purgeSoftDeletedNotes(RETENTION_DAYS),
    ]);
    const threadMemoriesForgotten = await threadChat.forgetOrphans();

    return {
        threadsDeleted: threads.count,
        notesDeleted: notes.count,
        threadMemoriesForgotten,
    };
}

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Run the purge if no replica has run it in the last day. Never throws. */
async function purgeIfDue() {
    try {
        // The shared limiter is the once-a-day gate: its per-key advisory
        // lock lets one replica through, and its window survives restarts.
        const { success } = await rateLimit({
            key: 'job:purge-soft-deleted',
            maxRequests: 1,
            windowMs: PURGE_INTERVAL_MS,
        });
        if (!success) return;

        log.info('purged_soft_deleted', await purgeSoftDeleted());
    } catch (error) {
        log.exception('purge_soft_deleted_failed', error);
    }
}

/**
 * The inline fallback for the purge-soft-deleted schedule, for deployments
 * without Trigger.dev: check at boot and hourly, purging at most once a day.
 */
export function scheduleInlinePurge() {
    void purgeIfDue();
    const timer = setInterval(() => void purgeIfDue(), CHECK_INTERVAL_MS);
    timer.unref();
    onShutdown(() => clearInterval(timer));
}
