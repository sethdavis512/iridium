import { env } from '~/lib/env.server';
import { log } from '~/lib/logger.server';
import {
    deliverAuthEmail,
    type AuthEmailPayload,
} from '~/lib/email-jobs.server';
import { generateAndSaveThreadTitle } from '~/lib/thread-title.server';
import type { sendAuthEmailTask } from '../../trigger/send-auth-email';
import type { generateThreadTitleTask } from '../../trigger/generate-thread-title';

/**
 * Background job facade. With TRIGGER_SECRET_KEY set, work is handed to
 * Trigger.dev; without it, the same shared functions run inline so local
 * dev, CI, and small deployments need no extra service. This mirrors the
 * console fallback in email.server.ts.
 */
export const isTriggerEnabled = Boolean(env.TRIGGER_SECRET_KEY);

async function getTasks() {
    // Dynamic import so the SDK never loads on the inline path.
    const { tasks } = await import('@trigger.dev/sdk');
    return tasks;
}

export async function enqueueAuthEmail(payload: AuthEmailPayload) {
    if (isTriggerEnabled) {
        const tasks = await getTasks();
        await tasks.trigger<typeof sendAuthEmailTask>(
            'send-auth-email',
            payload,
        );
        return;
    }

    await deliverAuthEmail(payload);
}

/**
 * Best-effort: a failed title (or a failed enqueue) never fails the chat, and
 * this never throws, so callers can fire it without awaiting.
 */
export async function enqueueThreadTitle(payload: {
    threadId: string;
    context: string;
    fallbackTitle: string;
}) {
    try {
        if (isTriggerEnabled) {
            const tasks = await getTasks();
            await tasks.trigger<typeof generateThreadTitleTask>(
                'generate-thread-title',
                payload,
            );
            return;
        }

        await generateAndSaveThreadTitle(payload);
    } catch (error) {
        log.exception('title_generation_failed', error, {
            threadId: payload.threadId,
        });
    }
}
