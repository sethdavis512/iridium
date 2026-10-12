import { toAISdkStream } from '@mastra/ai-sdk';
import type { MastraDBMessage } from '@mastra/core/agent';
import {
    consumeStream,
    createUIMessageStream,
    createUIMessageStreamResponse,
    type UIMessage,
} from 'ai';
import z from 'zod';

import { DEFAULT_MODEL_ID } from '~/lib/ai-models';
import { enqueueThreadTitle } from '~/lib/jobs.server';
import { log } from '~/lib/logger.server';
import { rateLimit } from '~/lib/rate-limit.server';
import {
    buildFallbackTitle,
    buildTitleContext,
} from '~/lib/thread-title.server';
import { getChat, ResourceUnavailableError } from '~/mastra';
import { CHAT_LIMITS } from '~/mastra/agents';
import { userRequestContext } from '~/mastra/context';
import { getUserFromSession } from '~/models/session.server';
import {
    deleteTrailingAssistantMessages,
    getThreadById,
    getThreadMeta,
    saveChat,
} from '~/models/thread.server';
import type { Route } from './+types/api-chat';

/** Request bodies over this size are rejected (413) before being parsed. */
const MAX_BODY_BYTES = 1_000_000;

/** Per text part: room for a long pasted document, far below the body cap. */
const MAX_TEXT_PART_LENGTH = 32_000;

const uiMessagePartSchema = z.object({
    type: z.string().max(50),
    text: z.string().max(MAX_TEXT_PART_LENGTH).optional(),
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

/**
 * Bound for one chat turn. The request's abort signal stops generation when
 * the client disconnects or presses Stop; this stops a stalled or runaway
 * turn (worst case is maxSteps 10 x maxOutputTokens 2048).
 */
export const CHAT_TIMEOUT_MS = 180_000;

type Memory = Awaited<ReturnType<typeof getChat>>['memory'];

/** False for a reply aborted before it produced anything to show. */
export function hasContent(message: UIMessage): boolean {
    return message.parts.some((part) =>
        part.type === 'text'
            ? part.text.trim() !== ''
            : part.type !== 'step-start',
    );
}

/**
 * Read the body as text, giving up (null) once it passes `maxBytes`. The
 * Content-Length check only catches honest clients; this also bounds a body
 * sent without the header or with an understated one.
 */
async function readBodyWithLimit(
    request: Request,
    maxBytes: number,
): Promise<string | null> {
    if (!request.body) return '';

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }

    return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Mastra memory holds the conversation context, and a thread it has never
 * seen (one that predates it, or whose memory was cleared) is seeded from the
 * Prisma copy, stripped to text parts, so the model keeps the history.
 */
async function seedMemoryFromThread(
    memory: Memory,
    userId: string,
    threadId: string,
) {
    if (await memory.getThreadById({ threadId })) return;

    const thread = await getThreadById(threadId);
    if (!thread || thread.messages.length === 0) return;

    const seeded: MastraDBMessage[] = [];
    for (const message of thread.messages) {
        if (message.role === 'SYSTEM') continue;
        try {
            const parts = (JSON.parse(message.content) as UIMessage['parts'])
                .filter((part) => part.type === 'text')
                .map((part) => ({ type: 'text' as const, text: part.text }));
            if (parts.length === 0) continue;
            seeded.push({
                id: message.id,
                role: message.role === 'USER' ? 'user' : 'assistant',
                createdAt: message.createdAt,
                threadId,
                resourceId: userId,
                content: { format: 2, parts },
            });
        } catch {
            // Skip a malformed row rather than failing the request.
        }
    }
    if (seeded.length === 0) return;

    await memory.createThread({ threadId, resourceId: userId });
    await memory.saveMessages({ messages: seeded });
}

/** Forget a thread's conversation memory; working memory is per user. */
async function clearThreadMemory(memory: Memory, threadId: string) {
    if (await memory.getThreadById({ threadId })) {
        await memory.deleteThread(threadId);
    }
}

export async function action({ request }: Route.ActionArgs) {
    if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Everything before the body is read is cheap: an unauthenticated,
    // rate-limited, or oversized request is rejected without buffering or
    // parsing its payload.
    const declaredLength = Number(request.headers.get('content-length'));
    if (declaredLength > MAX_BODY_BYTES) {
        return Response.json(
            { error: 'Request body too large' },
            { status: 413 },
        );
    }

    const user = await getUserFromSession(request);

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
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

    const body = await readBodyWithLimit(request, MAX_BODY_BYTES);

    if (body === null) {
        return Response.json(
            { error: 'Request body too large' },
            { status: 413 },
        );
    }

    let parsed: z.infer<typeof chatRequestSchema>;
    try {
        parsed = chatRequestSchema.parse(JSON.parse(body));
    } catch {
        return Response.json(
            { error: 'Invalid request body' },
            { status: 400 },
        );
    }

    const { messages: validatedMessages, id: threadId } = parsed;
    const messages = validatedMessages as UIMessage[];

    // Ownership boundary: thread must exist AND belong to the user BEFORE any
    // tokens are spent or memory is written. Threads are created via the
    // /chat route action, not implicitly here.
    const thread = await getThreadMeta(threadId);

    if (!thread) {
        return Response.json({ error: 'Thread not found' }, { status: 404 });
    }

    if (thread.createdById !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only send the latest user message: Mastra memory provides conversation
    // context and regenerate may end with an assistant message.
    const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === 'user');

    if (!latestUserMessage) {
        return Response.json(
            { error: 'No user message found in request' },
            { status: 400 },
        );
    }

    // Mastra memory opens on first use and can be down (it is retried with
    // backoff). Answer 503 before touching the thread or its memory, so a
    // retry finds both as they were.
    let chat: Awaited<ReturnType<typeof getChat>>;
    try {
        chat = await getChat();
    } catch (error) {
        if (!(error instanceof ResourceUnavailableError)) throw error;
        return Response.json(
            {
                error: 'Chat is temporarily unavailable. Please try again in a moment.',
            },
            {
                status: 503,
                headers: {
                    'Retry-After': String(
                        Math.max(1, Math.ceil(error.retryAfterMs / 1000)),
                    ),
                },
            },
        );
    }
    const { agent, memory } = chat;

    const isRegenerate = parsed.trigger === 'regenerate-message';
    let inputMessages: UIMessage[] = [latestUserMessage];

    if (isRegenerate) {
        // Drop the response being regenerated, then forget the thread's
        // conversation memory and resend the trimmed history, which rebuilds
        // it from what the client shows.
        await deleteTrailingAssistantMessages(threadId);
        await clearThreadMemory(memory, threadId);

        let lastUserIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }
        inputMessages = messages.slice(0, lastUserIndex + 1);
    } else {
        await seedMemoryFromThread(memory, user.id, threadId);
    }

    const result = await agent.stream(inputMessages, {
        memory: { thread: threadId, resource: user.id },
        // The per-thread model is read by the agent's dynamic model callback;
        // tools read the user id.
        requestContext: userRequestContext({
            userId: user.id,
            threadId,
            model: thread.model ?? DEFAULT_MODEL_ID,
        }),
        // Stop generating (and billing) when the client disconnects or
        // presses Stop, and when a turn runs past its budget.
        abortSignal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(CHAT_TIMEOUT_MS),
        ]),
        maxSteps: CHAT_LIMITS.maxSteps,
        modelSettings: { maxOutputTokens: CHAT_LIMITS.maxOutputTokens },
    });

    const stream = createUIMessageStream({
        execute: ({ writer }) => {
            writer.merge(
                toAISdkStream(result, { from: 'agent', version: 'v6' }),
            );
        },
        onError: (error) => {
            log.exception('chat_stream_error', error, {
                threadId,
                userId: user.id,
            });
            return 'The assistant hit an error mid-response. Please try again.';
        },
        originalMessages: messages,
        onFinish: async ({ messages, isAborted }) => {
            if (isAborted) {
                log.info('chat_aborted', { threadId, userId: user.id });
            }

            try {
                await saveChat({
                    // An abort can land before the reply has any content;
                    // keep the user's message but not an empty bubble.
                    messages: messages.filter(
                        (message) =>
                            message.role !== 'assistant' || hasContent(message),
                    ),
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

    return createUIMessageStreamResponse({
        stream,
        // Drain a copy of the stream server-side so onFinish runs even when
        // the client goes away mid-reply; the partial reply is then saved and
        // Postgres stays in step with Mastra memory.
        consumeSseStream: consumeStream,
    });
}
