import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import type { UIMessage, UIMessageChunk } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

// An in-memory stand-in for the thread model module (the app database), so
// the Thread chat module runs against real Mastra memory and a real agent.
type Row = {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    createdAt: Date;
};
type StoredThread = {
    id: string;
    createdById: string;
    title: string;
    model: string | null;
    rows: Row[];
};

const { threads, saveChatFailure, enqueueThreadTitle } = vi.hoisted(() => ({
    threads: new Map<string, StoredThread>(),
    saveChatFailure: { current: null as Error | null },
    enqueueThreadTitle: vi.fn(),
}));

vi.mock('~/models/thread.server', async () => {
    const { serializeParts, toStoredRole } =
        await import('~/lib/stored-message');
    return {
        UNTITLED_TITLE: 'Untitled',
        getThreadMeta: async (id: string) => {
            const thread = threads.get(id);
            return thread && { ...thread, rows: undefined };
        },
        getThreadById: async (id: string) => {
            const thread = threads.get(id);
            return thread && { ...thread, messages: thread.rows };
        },
        saveChat: async ({
            messages,
            threadId,
        }: {
            messages: UIMessage[];
            threadId: string;
        }) => {
            if (saveChatFailure.current) throw saveChatFailure.current;
            const thread = threads.get(threadId)!;
            for (const message of messages) {
                const row = {
                    id: message.id,
                    role: toStoredRole(message.role),
                    content: serializeParts(message.parts),
                    createdAt: new Date(),
                };
                const index = thread.rows.findIndex((r) => r.id === row.id);
                if (index >= 0) thread.rows[index].content = row.content;
                else thread.rows.push(row);
            }
        },
        listLiveThreadIds: async (ids: string[]) =>
            new Set(ids.filter((id) => threads.has(id))),
        deleteTrailingAssistantMessages: async (threadId: string) => {
            const thread = threads.get(threadId)!;
            const lastUser = thread.rows.map((r) => r.role).lastIndexOf('USER');
            thread.rows = thread.rows.filter(
                (row, i) => row.role !== 'ASSISTANT' || i < lastUser,
            );
        },
    };
});

vi.mock('~/lib/jobs.server', () => ({
    enqueueThreadTitle: (...args: unknown[]) => enqueueThreadTitle(...args),
}));

vi.mock('~/lib/logger.server', () => ({
    log: { exception: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { ResourceUnavailableError } from '~/mastra/lazy-resource';

import {
    createThreadChat,
    hasContent,
    type TurnResult,
} from './thread-chat.server';

const finishChunk = {
    type: 'finish' as const,
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
};

/** A model whose reply is `text`, streamed in one piece. */
function replyModel(text: string) {
    return new MockLanguageModelV3({
        doStream: async () => ({
            stream: new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'stream-start', warnings: [] });
                    controller.enqueue({ type: 'text-start', id: 't1' });
                    controller.enqueue({
                        type: 'text-delta',
                        id: 't1',
                        delta: text,
                    });
                    controller.enqueue({ type: 'text-end', id: 't1' });
                    controller.enqueue(finishChunk);
                    controller.close();
                },
            }),
        }),
    });
}

function setup(model: MockLanguageModelV3 = replyModel('Hello')) {
    const memory = new Memory({ storage: new InMemoryStore() });
    const agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        instructions: 'You are a test agent.',
        model,
        memory,
    });
    const getChat = vi.fn(async () => ({ agent, memory }));
    return { memory, model, getChat, chat: createThreadChat({ getChat }) };
}

/** The text of everything the model was sent on its `call`th call. */
function promptText(model: MockLanguageModelV3, call = 0) {
    return JSON.stringify(model.doStreamCalls[call].prompt);
}

function userMessage(text: string, id = 'm-new'): UIMessage {
    return { id, role: 'user', parts: [{ type: 'text', text }] };
}

function row(
    id: string,
    role: Row['role'],
    content: string,
    minute: number,
): Row {
    return {
        id,
        role,
        content,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
    };
}

function addThread(thread: Partial<StoredThread> = {}) {
    threads.set('thread-1', {
        id: 'thread-1',
        createdById: 'u1',
        title: 'Untitled',
        model: null,
        rows: [],
        ...thread,
    });
}

function streamOf(result: TurnResult): ReadableStream<UIMessageChunk> {
    if (result.status !== 'streaming') {
        throw new Error(`expected a stream, got ${result.status}`);
    }
    return result.stream;
}

async function readAll(stream: ReadableStream<UIMessageChunk>) {
    const chunks: UIMessageChunk[] = [];
    const reader = stream.getReader();
    for (;;) {
        const { value, done } = await reader.read();
        if (done) return chunks;
        chunks.push(value);
    }
}

function storedText(role: Row['role']) {
    return threads
        .get('thread-1')!
        .rows.filter((r) => r.role === role)
        .map((r) => r.content);
}

/** Wait for the reply to be saved (onFinish runs after the stream drains). */
async function saved(rowCount: number) {
    await vi.waitFor(() =>
        expect(threads.get('thread-1')!.rows).toHaveLength(rowCount),
    );
}

const signal = () => new AbortController().signal;

beforeEach(() => {
    vi.clearAllMocks();
    threads.clear();
    saveChatFailure.current = null;
});

describe('runTurn', () => {
    it('answers the user message and saves both to the Thread', async () => {
        addThread();
        const { chat } = setup(replyModel('Hello there'));

        const result = await chat.runTurn({
            userId: 'u1',
            threadId: 'thread-1',
            message: userMessage('hi'),
            signal: signal(),
        });

        const chunks = await readAll(streamOf(result));
        expect(chunks).toContainEqual(
            expect.objectContaining({
                type: 'text-delta',
                delta: 'Hello there',
            }),
        );
        await saved(2);
        expect(storedText('USER')).toEqual([
            JSON.stringify([{ type: 'text', text: 'hi' }]),
        ]);
        expect(storedText('ASSISTANT')[0]).toContain('Hello there');
    });

    it('titles an untitled Thread after its reply, and leaves a titled one alone', async () => {
        addThread();
        const { chat } = setup();

        await readAll(
            streamOf(
                await chat.runTurn({
                    userId: 'u1',
                    threadId: 'thread-1',
                    message: userMessage('plan a trip'),
                    signal: signal(),
                }),
            ),
        );
        await vi.waitFor(() =>
            expect(enqueueThreadTitle).toHaveBeenCalledWith(
                expect.objectContaining({ threadId: 'thread-1' }),
            ),
        );

        enqueueThreadTitle.mockClear();
        threads.get('thread-1')!.title = 'Trip Planning';
        await readAll(
            streamOf(
                await chat.runTurn({
                    userId: 'u1',
                    threadId: 'thread-1',
                    message: userMessage('and back', 'm-2'),
                    signal: signal(),
                }),
            ),
        );
        await saved(4);
        expect(enqueueThreadTitle).not.toHaveBeenCalled();
    });

    it('refuses a missing or foreign Thread before opening chat memory', async () => {
        const { chat, getChat } = setup();
        const input = {
            userId: 'u1',
            threadId: 'thread-1',
            message: userMessage('hi'),
            signal: signal(),
        };

        expect(await chat.runTurn(input)).toEqual({ status: 'not-found' });

        addThread({ createdById: 'someone-else' });
        expect(await chat.runTurn(input)).toEqual({ status: 'forbidden' });
        expect(getChat).not.toHaveBeenCalled();
    });

    it('reports unavailable chat memory without touching the Thread', async () => {
        addThread({
            rows: [row('m1', 'USER', '[]', 0), row('a1', 'ASSISTANT', '[]', 1)],
        });
        const { chat, getChat } = setup();
        getChat.mockRejectedValue(
            new ResourceUnavailableError('mastra_memory', 2500),
        );

        const result = await chat.runTurn({
            userId: 'u1',
            threadId: 'thread-1',
            message: userMessage('hi'),
            regenerate: true,
            signal: signal(),
        });

        expect(result).toEqual({ status: 'unavailable', retryAfterMs: 2500 });
        expect(threads.get('thread-1')!.rows).toHaveLength(2);
    });

    it('rebuilds Thread memory from the Thread when memory has no copy', async () => {
        addThread({
            rows: [
                row(
                    'm1',
                    'USER',
                    JSON.stringify([
                        { type: 'text', text: 'My favorite color is teal' },
                    ]),
                    0,
                ),
                row(
                    's1',
                    'SYSTEM',
                    JSON.stringify([{ type: 'text', text: 'system note' }]),
                    1,
                ),
                // An old plain-text row.
                row('a1', 'ASSISTANT', 'Noted, teal it is', 2),
            ],
        });
        const { chat, model } = setup();

        await readAll(
            streamOf(
                await chat.runTurn({
                    userId: 'u1',
                    threadId: 'thread-1',
                    message: userMessage('What is my favorite color?'),
                    signal: signal(),
                }),
            ),
        );

        const prompt = promptText(model);
        expect(prompt).toContain('My favorite color is teal');
        expect(prompt).toContain('Noted, teal it is');
        expect(prompt).not.toContain('system note');
        await saved(5);
    });

    it('regenerates from the Thread, not from the history the client sends', async () => {
        addThread({
            title: 'Colors',
            rows: [
                row(
                    'm1',
                    'USER',
                    JSON.stringify([
                        { type: 'text', text: 'Earlier question' },
                    ]),
                    0,
                ),
                row(
                    'a1',
                    'ASSISTANT',
                    JSON.stringify([{ type: 'text', text: 'Earlier answer' }]),
                    1,
                ),
                row(
                    'm2',
                    'USER',
                    JSON.stringify([{ type: 'text', text: 'Pick a color' }]),
                    2,
                ),
                row(
                    'a2',
                    'ASSISTANT',
                    JSON.stringify([{ type: 'text', text: 'Old reply' }]),
                    3,
                ),
            ],
        });
        const { chat, model, memory } = setup(replyModel('New reply'));
        // Memory holds the old reply too, as it would after the first Turn.
        await memory.createThread({ threadId: 'thread-1', resourceId: 'u1' });

        await readAll(
            streamOf(
                await chat.runTurn({
                    userId: 'u1',
                    threadId: 'thread-1',
                    // A client could send anything; only the Thread counts.
                    message: userMessage('tampered text', 'm2'),
                    regenerate: true,
                    signal: signal(),
                }),
            ),
        );

        const prompt = promptText(model);
        expect(prompt).toContain('Earlier answer');
        expect(prompt).toContain('Pick a color');
        expect(prompt).not.toContain('Old reply');
        expect(prompt).not.toContain('tampered text');

        await vi.waitFor(() =>
            expect(storedText('ASSISTANT').join()).toContain('New reply'),
        );
        expect(storedText('ASSISTANT').join()).not.toContain('Old reply');
    });

    it('forgets Thread memory when the reply cannot be saved', async () => {
        addThread({ title: 'Existing' });
        saveChatFailure.current = new Error('database down');
        const { chat, memory } = setup();

        await readAll(
            streamOf(
                await chat.runTurn({
                    userId: 'u1',
                    threadId: 'thread-1',
                    message: userMessage('hi'),
                    signal: signal(),
                }),
            ),
        );

        await vi.waitFor(async () =>
            expect(
                await memory.getThreadById({ threadId: 'thread-1' }),
            ).toBeNull(),
        );
    });

    it('saves the partial reply when the Turn is aborted mid-stream', async () => {
        addThread({ title: 'Existing' });
        let modelSignal: AbortSignal | undefined;
        const model = new MockLanguageModelV3({
            doStream: async ({ abortSignal }) => ({
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({
                            type: 'stream-start',
                            warnings: [],
                        });
                        controller.enqueue({ type: 'text-start', id: 't1' });
                        controller.enqueue({
                            type: 'text-delta',
                            id: 't1',
                            delta: 'Partial reply',
                        });
                        modelSignal = abortSignal;
                        abortSignal?.addEventListener('abort', () =>
                            controller.error(abortSignal.reason),
                        );
                    },
                }),
            }),
        });
        const { chat } = setup(model);
        const client = new AbortController();

        const stream = streamOf(
            await chat.runTurn({
                userId: 'u1',
                threadId: 'thread-1',
                message: userMessage('hi'),
                signal: client.signal,
            }),
        );

        // Read until the partial reply arrives, then stop and disconnect.
        const reader = stream.getReader();
        for (;;) {
            const { value, done } = await reader.read();
            if (
                done ||
                (value.type === 'text-delta' && value.delta === 'Partial reply')
            )
                break;
        }
        client.abort();

        await saved(2);
        expect(storedText('ASSISTANT')[0]).toContain('Partial reply');
        expect(modelSignal?.aborted).toBe(true);
    });

    it('still saves the reply when the caller stops reading the stream', async () => {
        addThread({ title: 'Existing' });
        const deltas = Array.from({ length: 500 }, (_, i) => ({
            type: 'text-delta' as const,
            id: 't1',
            delta: i === 0 ? 'Start' : '.',
        }));
        const model = new MockLanguageModelV3({
            doStream: async () => ({
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({
                            type: 'stream-start',
                            warnings: [],
                        });
                        controller.enqueue({ type: 'text-start', id: 't1' });
                        deltas.forEach((delta) => controller.enqueue(delta));
                        controller.enqueue({ type: 'text-end', id: 't1' });
                        controller.enqueue(finishChunk);
                        controller.close();
                    },
                }),
            }),
        });
        const { chat } = setup(model);

        const stream = streamOf(
            await chat.runTurn({
                userId: 'u1',
                threadId: 'thread-1',
                message: userMessage('hi'),
                signal: signal(),
            }),
        );
        // Read only the first chunk, then leave the stream unread.
        await stream.getReader().read();

        await saved(2);
        expect(storedText('ASSISTANT')[0]).toContain(`Start${'.'.repeat(499)}`);
    });
});

describe('forgetThread', () => {
    it('drops the Thread memory', async () => {
        const { chat, memory } = setup();
        await memory.createThread({ threadId: 'thread-1', resourceId: 'u1' });

        await chat.forgetThread('thread-1');

        expect(await memory.getThreadById({ threadId: 'thread-1' })).toBeNull();
    });

    it('never throws when chat memory is unavailable', async () => {
        const { chat, getChat } = setup();
        getChat.mockRejectedValue(
            new ResourceUnavailableError('mastra_memory', 1000),
        );

        await expect(chat.forgetThread('thread-1')).resolves.toBeUndefined();
    });
});

describe('forgetUser', () => {
    it('drops every Thread memory the user has, and no one else’s', async () => {
        const { chat, memory } = setup();
        await memory.createThread({ threadId: 't-a', resourceId: 'u1' });
        await memory.createThread({ threadId: 't-b', resourceId: 'u1' });
        await memory.createThread({ threadId: 't-c', resourceId: 'u2' });

        await chat.forgetUser('u1');

        const { threads: left } = await memory.listThreads({ perPage: false });
        expect(left.map((thread) => thread.id)).toEqual(['t-c']);
    });
});

describe('forgetOrphans', () => {
    it('drops Thread memory whose Thread is deleted or gone', async () => {
        addThread();
        const { chat, memory } = setup();
        await memory.createThread({ threadId: 'thread-1', resourceId: 'u1' });
        await memory.createThread({ threadId: 'purged', resourceId: 'u1' });

        expect(await chat.forgetOrphans()).toBe(1);

        const { threads: left } = await memory.listThreads({ perPage: false });
        expect(left.map((thread) => thread.id)).toEqual(['thread-1']);
    });

    it('reports null instead of throwing when chat memory is unavailable', async () => {
        const { chat, getChat } = setup();
        getChat.mockRejectedValue(
            new ResourceUnavailableError('mastra_memory', 1000),
        );

        expect(await chat.forgetOrphans()).toBeNull();
    });
});

describe('hasContent', () => {
    it('is false for a reply with nothing to show', () => {
        expect(
            hasContent({
                id: 'a1',
                role: 'assistant',
                parts: [{ type: 'step-start' }, { type: 'text', text: '  ' }],
            }),
        ).toBe(false);
    });

    it('is true once the reply has text or a tool part', () => {
        expect(
            hasContent({
                id: 'a1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'hi' }],
            }),
        ).toBe(true);
        expect(
            hasContent({
                id: 'a2',
                role: 'assistant',
                parts: [
                    {
                        type: 'dynamic-tool',
                        toolName: 'list_notes',
                        toolCallId: 'c1',
                        state: 'input-available',
                        input: {},
                    },
                ],
            }),
        ).toBe(true);
    });
});
