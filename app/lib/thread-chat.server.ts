import { toAISdkStream } from '@mastra/ai-sdk';
import type { Agent, MastraDBMessage } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import {
    consumeStream,
    createUIMessageStream,
    type UIMessage,
    type UIMessageChunk,
} from 'ai';

import { DEFAULT_MODEL_ID } from '~/lib/ai-models';
import { enqueueThreadTitle } from '~/lib/jobs.server';
import { log } from '~/lib/logger.server';
import { toUIMessage } from '~/lib/stored-message';
import {
    buildFallbackTitle,
    buildTitleContext,
} from '~/lib/thread-title.server';
import { userRequestContext } from '~/mastra/context';
import { ResourceUnavailableError } from '~/mastra/lazy-resource';
import {
    deleteTrailingAssistantMessages,
    getThreadById,
    getThreadMeta,
    listLiveThreadIds,
    saveChat,
    UNTITLED_TITLE,
} from '~/models/thread.server';

/** Cap tool-call iterations and per-call output to bound cost and abuse. */
export const CHAT_LIMITS = { maxSteps: 10, maxOutputTokens: 2048 } as const;

/**
 * Bound for one Turn. The caller's abort signal stops generation when the
 * client disconnects or presses Stop; this stops a stalled or runaway Turn
 * (worst case is maxSteps x maxOutputTokens).
 */
export const CHAT_TIMEOUT_MS = 180_000;

type Chat = { agent: Agent; memory: MastraMemory };

export type TurnInput = {
    userId: string;
    threadId: string;
    /** The user message this Turn answers. */
    message: UIMessage;
    /** Replace the Thread's last reply instead of answering `message`. */
    regenerate?: boolean;
    /** Stops generation; the partial reply is still saved. */
    signal: AbortSignal;
};

export type TurnResult =
    | { status: 'streaming'; stream: ReadableStream<UIMessageChunk> }
    | { status: 'not-found' }
    | { status: 'forbidden' }
    | { status: 'unavailable'; retryAfterMs: number };

/** False for a reply aborted before it produced anything to show. */
export function hasContent(message: UIMessage): boolean {
    return message.parts.some((part) =>
        part.type === 'text'
            ? part.text.trim() !== ''
            : part.type !== 'step-start',
    );
}

type HistoryMessage = UIMessage & { createdAt: Date };

/** The Thread's messages as model context: SYSTEM rows are not part of it. */
async function loadHistory(threadId: string): Promise<HistoryMessage[]> {
    const thread = await getThreadById(threadId);
    return (thread?.messages ?? [])
        .filter((message) => message.role !== 'SYSTEM')
        .map(toUIMessage);
}

/**
 * Rebuild Thread memory from the Thread, stripped to text parts. Only call it
 * when memory has no copy of the Thread.
 */
async function rebuildMemory(
    memory: MastraMemory,
    userId: string,
    threadId: string,
    history: HistoryMessage[],
) {
    const seeded: MastraDBMessage[] = [];
    for (const message of history) {
        const parts = message.parts
            .filter((part) => part.type === 'text')
            .map((part) => ({ type: 'text' as const, text: part.text }));
        if (parts.length === 0) continue;
        seeded.push({
            id: message.id,
            role: message.role === 'user' ? 'user' : 'assistant',
            createdAt: message.createdAt,
            threadId,
            resourceId: userId,
            content: { format: 2, parts },
        });
    }
    if (seeded.length === 0) return;

    await memory.createThread({ threadId, resourceId: userId });
    await memory.saveMessages({ messages: seeded });
}

/** Working memory is per user, so this leaves it alone. */
async function forgetIn(memory: MastraMemory, threadId: string) {
    if (await memory.getThreadById({ threadId })) {
        await memory.deleteThread(threadId);
    }
}

/**
 * The Thread chat module: runs Turns against a Thread and forgets Thread
 * memory. The Thread is the source of truth and Thread memory a cache
 * rebuilt from it (docs/adr/0001-thread-is-source-of-truth.md).
 */
export function createThreadChat({
    getChat,
}: {
    getChat: () => Promise<Chat>;
}) {
    /**
     * Run one Turn and return its reply as a UI message stream. Ownership is
     * checked and chat memory opened before anything is written, so a
     * not-found, forbidden, or unavailable result leaves the Thread and its
     * memory as they were. The reply is saved when the stream finishes or is
     * aborted, whether or not the caller reads it to the end.
     */
    async function runTurn({
        userId,
        threadId,
        message,
        regenerate = false,
        signal,
    }: TurnInput): Promise<TurnResult> {
        const thread = await getThreadMeta(threadId);
        if (!thread) return { status: 'not-found' };
        if (thread.createdById !== userId) return { status: 'forbidden' };

        let chat: Chat;
        try {
            chat = await getChat();
        } catch (error) {
            if (!(error instanceof ResourceUnavailableError)) throw error;
            return { status: 'unavailable', retryAfterMs: error.retryAfterMs };
        }
        const { agent, memory } = chat;

        let userMessage = message;
        if (regenerate) {
            // Drop the reply being replaced, then rebuild memory from the
            // Thread up to its last user message and answer that message.
            await deleteTrailingAssistantMessages(threadId);
            await forgetIn(memory, threadId);

            const history = await loadHistory(threadId);
            const lastUser = history
                .map((stored) => stored.role)
                .lastIndexOf('user');
            if (lastUser >= 0) userMessage = history[lastUser];
            await rebuildMemory(
                memory,
                userId,
                threadId,
                lastUser >= 0 ? history.slice(0, lastUser) : history,
            );
        } else if (!(await memory.getThreadById({ threadId }))) {
            await rebuildMemory(
                memory,
                userId,
                threadId,
                await loadHistory(threadId),
            );
        }

        // A copy: Mastra stamps the parts it is given, and the original is
        // what gets saved.
        const result = await agent.stream([structuredClone(userMessage)], {
            memory: { thread: threadId, resource: userId },
            // The agent's dynamic model callback reads the Thread's model;
            // tools read the user id.
            requestContext: userRequestContext({
                userId,
                threadId,
                model: thread.model ?? DEFAULT_MODEL_ID,
            }),
            abortSignal: AbortSignal.any([
                signal,
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
                log.exception('chat_stream_error', error, { threadId, userId });
                return 'The assistant hit an error mid-response. Please try again.';
            },
            originalMessages: [userMessage],
            onFinish: async ({ messages, isAborted }) => {
                if (isAborted) log.info('chat_aborted', { threadId, userId });

                try {
                    await saveChat({
                        // An abort can land before the reply has any content;
                        // keep the user's message but not an empty bubble.
                        messages: messages.filter(
                            (saved) =>
                                saved.role !== 'assistant' || hasContent(saved),
                        ),
                        threadId,
                        userId,
                    });
                } catch (error) {
                    log.exception('save_chat_failed', error, {
                        threadId,
                        userId,
                        messageCount: messages.length,
                    });
                    // Memory now holds a Turn the Thread doesn't; drop it so
                    // the next Turn rebuilds memory from the Thread.
                    await forgetThread(threadId);
                }

                // Title the Thread after its first reply, off the response
                // path: not awaited, and it never throws.
                if (thread.title === UNTITLED_TITLE) {
                    void enqueueThreadTitle({
                        threadId,
                        context: buildTitleContext(messages),
                        fallbackTitle: buildFallbackTitle(messages),
                    });
                }
            },
        });

        // Drain a copy so onFinish runs, and the reply is saved, even when
        // the caller stops reading mid-reply.
        const [forCaller, forDrain] = stream.tee();
        void consumeStream({
            stream: forDrain,
            onError: (error) =>
                log.exception('chat_drain_failed', error, { threadId, userId }),
        });

        return { status: 'streaming', stream: forCaller };
    }

    /**
     * Forget a Thread's memory. Best-effort: a failure is logged, never
     * thrown, and the purge sweep picks up whatever it leaves behind.
     */
    async function forgetThread(threadId: string) {
        try {
            const { memory } = await getChat();
            await forgetIn(memory, threadId);
        } catch (error) {
            log.exception('thread_memory_forget_failed', error, { threadId });
        }
    }

    /** Forget every Thread memory a user has. Best-effort, like forgetThread. */
    async function forgetUser(userId: string) {
        try {
            const { memory } = await getChat();
            const { threads } = await memory.listThreads({
                filter: { resourceId: userId },
                perPage: false,
            });
            for (const thread of threads) {
                await memory.deleteThread(thread.id);
            }
        } catch (error) {
            log.exception('thread_memory_forget_failed', error, { userId });
        }
    }

    /**
     * Forget Thread memory whose Thread is deleted or gone: whatever a failed
     * forget or an account deletion left behind. Resolves to how many were
     * forgotten, or null when chat memory couldn't be swept.
     */
    async function forgetOrphans(): Promise<number | null> {
        try {
            const { memory } = await getChat();
            const { threads } = await memory.listThreads({ perPage: false });
            if (threads.length === 0) return 0;

            const live = await listLiveThreadIds(
                threads.map((thread) => thread.id),
            );
            let forgotten = 0;
            for (const thread of threads) {
                if (live.has(thread.id)) continue;
                await memory.deleteThread(thread.id);
                forgotten++;
            }
            return forgotten;
        } catch (error) {
            log.exception('thread_memory_sweep_failed', error);
            return null;
        }
    }

    return { runTurn, forgetThread, forgetUser, forgetOrphans };
}

export type ThreadChat = ReturnType<typeof createThreadChat>;

/** Opens the agent and its memory on first use (see app/mastra/agents.ts). */
export const threadChat = createThreadChat({
    getChat: async () => (await import('~/mastra')).getChat(),
});
