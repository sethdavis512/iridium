import { schedules, logger } from '@trigger.dev/sdk';
import { purgeSoftDeleted, RETENTION_DAYS } from '~/lib/purge.server';

/**
 * Nightly cleanup: hard-deletes Threads and Notes whose soft-delete window
 * has lapsed and forgets orphaned Thread memory. Without this job (or the
 * inline fallback in app/lib/purge.server.ts) soft-deleted rows accumulate
 * forever.
 */
export const purgeSoftDeletedTask = schedules.task({
    id: 'purge-soft-deleted',
    // Daily at 04:17 UTC (off the hour to avoid thundering-herd crons).
    cron: '17 4 * * *',
    run: async () => {
        const result = await purgeSoftDeleted();

        logger.info('Purged soft-deleted rows', {
            retentionDays: RETENTION_DAYS,
            ...result,
        });

        return result;
    },
});
