import { task, logger } from '@trigger.dev/sdk';
import { generateAndSaveThreadTitle } from '~/lib/thread-title.server';

/**
 * Generates a thread title from the opening messages and saves it. Keeps the
 * model round-trip off the chat request path. Triggered by
 * `enqueueThreadTitle` in app/lib/jobs.server.ts.
 */
export const generateThreadTitleTask = task({
    id: 'generate-thread-title',
    run: async (payload: {
        threadId: string;
        context: string;
        fallbackTitle: string;
    }) => {
        const title = await generateAndSaveThreadTitle(payload);

        logger.info('Thread title generated', {
            threadId: payload.threadId,
            title,
        });

        return { title };
    },
});
