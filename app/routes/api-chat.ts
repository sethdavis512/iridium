import type { UIMessage } from 'ai';
import z from 'zod';

import { DEFAULT_MODEL_ID } from '~/lib/ai-models';
import { enqueueThreadTitle } from '~/lib/jobs.server';
import { log } from '~/lib/logger.server';
import { rateLimit } from '~/lib/rate-limit.server';
import {
    buildFallbackTitle,
    buildTitleContext,
} from '~/lib/thread-title.server';
import { getUserFromSession } from '~/models/session.server';
import {
    deleteTrailingAssistantMessages,
    getThreadById,
    saveChat,
} from '~/models/thread.server';
import { agent, memory } from '~/voltagent';
import type { Route } from './+types/api-chat';

const uiMessagePartSchema = z.object({
    type: z.string().max(50),
});

const uiMessageSchema = z.object({
    id: z.string().max(128),
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(uiMessagePartSchema.passthrough()).max(100),
});

const chatRequestSchema = z.object({
    id: z.string().min(1).max(128),
    messages: z.array(uiMessageSchema.passthrough()).max(500),
    // Sent by useChat's regenerate(): regenerate the last assistant response.
    trigger: z.string().max(50).optional(),
    messageId: z.string().max(128).optional(),
});

function isDuplicateItemError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /Duplicate item found with id/i.test(error.message);
}

export async function action({ request }: Route.ActionArgs) {
    if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let parsed: z.infer<typeof chatRequestSchema>;
    try {
        parsed = chatRequestSchema.parse(await request.json());
    } catch {
        return Response.json(
            { error: 'Invalid request body' },
            { status: 400 },
        );
    }

    const { messages: validatedMessages, id: threadId } = parsed;
    const messages = validatedMessages as UIMessage[];
    const user = await getUserFromSession(request);

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ownership boundary: thread must exist AND belong to the user BEFORE any
    // tokens are spent or memory is written. Threads are created via the
    // /chat route action, not implicitly here.
    const thread = await getThreadById(threadId);

    if (!thread) {
        return Response.json({ error: 'Thread not found' }, { status: 404 });
    }

    if (thread.createdById !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { success: withinLimit } = await rateLimit({
        key: `chat:${user.id}`,
        maxRequests: 20,
        windowMs: 60_000,
    });

    if (!withinLimit) {
        return Response.json(
            { error: 'Too many requests. Please wait a moment.' },
            { status: 429 },
        );
    }

    // Only send the latest user message — VoltAgent memory provides
    // conversation context and regenerate may end with an assistant message.
    const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === 'user');

    if (!latestUserMessage) {
        return Response.json(
            { error: 'No user message found in request' },
            { status: 400 },
        );
    }

    const isRegenerate = parsed.trigger === 'regenerate-message';
    let inputMessages: UIMessage[] = [latestUserMessage];

    if (isRegenerate) {
        // Drop the response being regenerated, then clear conversation memory
        // and resend the trimmed history. Clearing first sidesteps duplicate
        // provider-item references in memory (the self-heal below remains as
        // a backstop); resending history restores the model's context.
        await deleteTrailingAssistantMessages(threadId);
        await memory.clearMessages(user.id, threadId);

        let lastUserIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }
        inputMessages = messages.slice(0, lastUserIndex + 1);
    }

    // VoltAgent always supplies its system prompt as a system-role message in
    // the messages array (it never uses the AI SDK `system` option). The system
    // content is our own instructions, so opt out of the AI SDK's
    // prompt-injection warning. The flag is forwarded to the underlying AI SDK
    // call but isn't part of VoltAgent's public option type, hence the cast.
    const streamOptions = {
        userId: user.id,
        conversationId: threadId,
        // The per-thread model is read by the agent's dynamic model callback.
        context: new Map([['model', thread.model ?? DEFAULT_MODEL_ID]]),
        allowSystemInMessages: true,
    } as Parameters<typeof agent.streamText>[1] & {
        allowSystemInMessages: boolean;
    };

    let result;
    try {
        result = await agent.streamText(inputMessages, streamOptions);
    } catch (error) {
        if (!isDuplicateItemError(error)) throw error;

        // Self-heal corrupted/stale provider item references in conversation memory.
        log.warn('chat_memory_self_heal', { threadId, userId: user.id });
        await memory.clearMessages(user.id, threadId);

        result = await agent.streamText(inputMessages, streamOptions);
    }

    return result.toUIMessageStreamResponse({
        originalMessages: messages,
        onFinish: async ({ messages }) => {
            try {
                await saveChat({
                    messages,
                    threadId,
                    userId: user.id,
                });
            } catch (error) {
                log.exception('save_chat_failed', error, {
                    threadId,
                    userId: user.id,
                    messageCount: messages.length,
                });
            }

            // Title the thread after its first reply, off the response path:
            // not awaited, so it never delays the stream. A title (or its
            // fallback) is always stored, so this runs once per thread. With
            // Trigger.dev configured it is a background job; otherwise it runs
            // inline (best-effort, never throws).
            if (thread.title === 'Untitled') {
                void enqueueThreadTitle({
                    threadId,
                    context: buildTitleContext(messages),
                    fallbackTitle: buildFallbackTitle(messages),
                });
            }
        },
    });
}
