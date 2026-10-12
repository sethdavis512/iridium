import { describe, expect, it, vi, beforeEach } from 'vitest';
import { streamText as aiStreamText, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const {
    getUserFromSession,
    getThreadMeta,
    getThreadById,
    saveChat,
    enqueueThreadTitle,
    stream,
    memoryGetThreadById,
    deleteThread,
    createThread,
    saveMessages,
    getChat,
    deleteTrailingAssistantMessages,
} = vi.hoisted(() => ({
    getUserFromSession: vi.fn(),
    getThreadMeta: vi.fn(),
    getThreadById: vi.fn(),
    saveChat: vi.fn(),
    enqueueThreadTitle: vi.fn(),
    stream: vi.fn(),
    memoryGetThreadById: vi.fn(),
    deleteThread: vi.fn(),
    createThread: vi.fn(),
    saveMessages: vi.fn(),
    getChat: vi.fn(),
    deleteTrailingAssistantMessages: vi.fn(),
}));

vi.mock('~/models/session.server', () => ({
    getUserFromSession: (...args: unknown[]) => getUserFromSession(...args),
}));

vi.mock('~/models/thread.server', () => ({
    getThreadMeta: (...args: unknown[]) => getThreadMeta(...args),
    getThreadById: (...args: unknown[]) => getThreadById(...args),
    saveChat: (...args: unknown[]) => saveChat(...args),
    deleteTrailingAssistantMessages: (...args: unknown[]) =>
        deleteTrailingAssistantMessages(...args),
}));

vi.mock('~/lib/jobs.server', () => ({
    enqueueThreadTitle: (...args: unknown[]) => enqueueThreadTitle(...args),
}));

// The real module pulls in Mastra + Prisma (and env validation with them).
vi.mock('~/lib/thread-title.server', () => ({
    buildTitleContext: () => 'mock conversation context',
    buildFallbackTitle: () => 'mock fallback title',
}));

const chat = {
    agent: {
        stream: (...args: unknown[]) => stream(...args),
    },
    memory: {
        getThreadById: (...args: unknown[]) => memoryGetThreadById(...args),
        deleteThread: (...args: unknown[]) => deleteThread(...args),
        createThread: (...args: unknown[]) => createThread(...args),
        saveMessages: (...args: unknown[]) => saveMessages(...args),
    },
};

vi.mock('~/mastra', async () => ({
    getChat: () => getChat(),
    ResourceUnavailableError: (await import('~/mastra/lazy-resource'))
        .ResourceUnavailableError,
}));

// The agent module opens memory and validates env at import.
vi.mock('~/mastra/agents', () => ({
    CHAT_LIMITS: { maxSteps: 10, maxOutputTokens: 2048 },
}));

// The mocked agent streams with the AI SDK directly, whose result already
// speaks the UI message stream protocol Mastra's converter produces.
vi.mock('@mastra/ai-sdk', () => ({
    toAISdkStream: (result: ReturnType<typeof aiStreamText>) =>
        result.toUIMessageStream(),
}));

vi.mock('~/lib/logger.server', () => ({
    log: { exception: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// The real limiter is Postgres-backed; count hits per key in memory instead.
const { rateLimitHits } = vi.hoisted(() => ({
    rateLimitHits: new Map<string, number>(),
}));

vi.mock('~/lib/rate-limit.server', () => ({
    rateLimit: async ({
        key,
        maxRequests,
    }: {
        key: string;
        maxRequests: number;
    }) => {
        const used = (rateLimitHits.get(key) ?? 0) + 1;
        if (used > maxRequests) return { success: false, remaining: 0 };
        rateLimitHits.set(key, used);
        return { success: true, remaining: maxRequests - used };
    },
}));

import { ResourceUnavailableError } from '~/mastra/lazy-resource';

import { action, hasContent } from './api-chat';

beforeEach(() => {
    vi.clearAllMocks();
    rateLimitHits.clear();
    getChat.mockResolvedValue(chat);
    // Memory already knows the thread, so no seeding runs.
    memoryGetThreadById.mockResolvedValue({ id: 'thread-1' });
});

function makeRequest(body: unknown, method = 'POST'): Request {
    const init: RequestInit = {
        method,
        headers: { 'content-type': 'application/json' },
    };
    if (method !== 'GET' && method !== 'HEAD') {
        init.body = JSON.stringify(body);
    }
    return new Request('http://localhost/api/chat', init);
}

/** A POST with a raw string body and optional extra headers. */
function rawRequest(body: string, headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
    });
}

function actionCall(request: Request) {
    // The Route.ActionArgs type isn't exposed easily in tests; cast pragmatically.
    return action({ request } as unknown as Parameters<typeof action>[0]);
}

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

/** Make the agent stream a short reply through the real AI SDK. */
function mockReply(text = 'Hello') {
    stream.mockImplementation(
        async (_input: unknown, options: { abortSignal: AbortSignal }) =>
            aiStreamText({
                model: replyModel(text),
                prompt: 'hi',
                abortSignal: options.abortSignal,
            }),
    );
}

/** Drain a reply and wait for its onFinish, so no save leaks into the next test. */
async function settle(res: Response, saves = 1) {
    const body = await readToEnd(res);
    await vi.waitFor(() => expect(saveChat).toHaveBeenCalledTimes(saves));
    return body;
}

async function readToEnd(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) return received;
        received += decoder.decode(value, { stream: true });
    }
}

const validBody = {
    id: 'thread-1',
    messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    ],
};

const ownedThread = {
    id: 'thread-1',
    createdById: 'u1',
    title: 'Untitled',
    model: 'anthropic/claude-sonnet-4-6',
};

describe('/api/chat action', () => {
    it('returns 405 for non-POST methods', async () => {
        const res = await actionCall(makeRequest(validBody, 'GET'));
        expect(res.status).toBe(405);
    });

    it('returns 400 for invalid request body', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });

        const res = await actionCall(makeRequest({ bogus: true }));
        expect(res.status).toBe(400);
    });

    it('returns 400 for malformed JSON', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });

        const res = await actionCall(rawRequest('{"id":'));
        expect(res.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
        getUserFromSession.mockResolvedValue(null);

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(401);
    });

    it('authenticates before reading the body', async () => {
        getUserFromSession.mockResolvedValue(null);
        const request = rawRequest('not even json');

        const res = await actionCall(request);

        expect(res.status).toBe(401);
        expect(request.bodyUsed).toBe(false);
    });

    it('rejects a declared Content-Length over 1 MB before authenticating', async () => {
        const request = rawRequest('{}', { 'content-length': '1000001' });

        const res = await actionCall(request);

        expect(res.status).toBe(413);
        expect(getUserFromSession).not.toHaveBeenCalled();
        expect(request.bodyUsed).toBe(false);
    });

    it('rejects a body over 1 MB sent without a Content-Length', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
        let sent = 0;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                // Would stream forever; the server must stop reading.
                sent += chunk.byteLength;
                controller.enqueue(chunk);
            },
        });
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            duplex: 'half',
        } as RequestInit);
        expect(request.headers.get('content-length')).toBeNull();

        const res = await actionCall(request);

        expect(res.status).toBe(413);
        expect(sent).toBeLessThan(2_000_000);
        expect(getThreadMeta).not.toHaveBeenCalled();
    });

    it('rejects a text part over the length cap', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });

        const res = await actionCall(
            makeRequest({
                id: 'thread-1',
                messages: [
                    {
                        id: 'm1',
                        role: 'user',
                        parts: [{ type: 'text', text: 'x'.repeat(32_001) }],
                    },
                ],
            }),
        );

        expect(res.status).toBe(400);
        expect(getThreadMeta).not.toHaveBeenCalled();
    });

    it('returns 404 when the thread does not exist', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(null);

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(404);
        expect(stream).not.toHaveBeenCalled();
    });

    it('returns 403 when the thread belongs to another user', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            ...ownedThread,
            createdById: 'other',
        });

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(403);
        expect(stream).not.toHaveBeenCalled();
    });

    it('returns 429 when the rate limit is exceeded', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        mockReply();

        // Burn through the 20-req/min limit.
        for (let i = 0; i < 20; i++) {
            const res = await actionCall(makeRequest(validBody));
            expect(res.status).toBe(200);
            await settle(res, i + 1);
        }

        const blockedRequest = makeRequest(validBody);
        const blocked = await actionCall(blockedRequest);
        expect(blocked.status).toBe(429);
        // Rate limiting happens before the body is read.
        expect(blockedRequest.bodyUsed).toBe(false);
    });

    it('streams the reply with the thread scoped to the user and model, then saves it', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        mockReply('Hello');

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(200);
        expect(await settle(res)).toContain('Hello');

        const [input, options] = stream.mock.calls[0];
        expect(input).toEqual(validBody.messages);
        expect(options).toEqual(
            expect.objectContaining({
                memory: { thread: 'thread-1', resource: 'u1' },
                maxSteps: 10,
                modelSettings: { maxOutputTokens: 2048 },
            }),
        );
        expect(options.requestContext.get('userId')).toBe('u1');
        expect(options.requestContext.get('threadId')).toBe('thread-1');
        expect(options.requestContext.get('model')).toBe(
            'anthropic/claude-sonnet-4-6',
        );

        const saved = saveChat.mock.calls[0][0];
        expect(saved).toEqual(
            expect.objectContaining({ threadId: 'thread-1', userId: 'u1' }),
        );
        expect(
            (saved.messages as UIMessage[]).map((message) => message.role),
        ).toEqual(['user', 'assistant']);
    });

    it('does not throw when saveChat fails (errors are logged, not propagated)', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        saveChat.mockRejectedValue(new Error('db down'));
        mockReply();

        const res = await actionCall(makeRequest(validBody));

        // The stream still completes cleanly.
        await expect(settle(res)).resolves.toContain('[DONE]');
    });

    it('seeds memory from the stored thread the first time memory sees it', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        memoryGetThreadById.mockResolvedValue(null);
        getThreadById.mockResolvedValue({
            ...ownedThread,
            messages: [
                {
                    id: 'old-user',
                    role: 'USER',
                    createdAt: new Date('2026-01-01'),
                    content: JSON.stringify([
                        { type: 'text', text: 'earlier question' },
                    ]),
                },
                {
                    id: 'old-assistant',
                    role: 'ASSISTANT',
                    createdAt: new Date('2026-01-02'),
                    content: JSON.stringify([
                        { type: 'step-start' },
                        { type: 'text', text: 'earlier answer' },
                    ]),
                },
                {
                    id: 'broken',
                    role: 'ASSISTANT',
                    createdAt: new Date('2026-01-03'),
                    content: 'not json',
                },
            ],
        });
        mockReply();

        await settle(await actionCall(makeRequest(validBody)));

        expect(createThread).toHaveBeenCalledWith({
            threadId: 'thread-1',
            resourceId: 'u1',
        });
        expect(saveMessages).toHaveBeenCalledWith({
            messages: [
                expect.objectContaining({
                    id: 'old-user',
                    role: 'user',
                    threadId: 'thread-1',
                    resourceId: 'u1',
                    content: {
                        format: 2,
                        parts: [{ type: 'text', text: 'earlier question' }],
                    },
                }),
                expect.objectContaining({
                    id: 'old-assistant',
                    role: 'assistant',
                    content: {
                        format: 2,
                        parts: [{ type: 'text', text: 'earlier answer' }],
                    },
                }),
            ],
        });
    });

    it('does not seed a thread memory already knows', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        mockReply();

        await settle(await actionCall(makeRequest(validBody)));

        expect(getThreadById).not.toHaveBeenCalled();
        expect(createThread).not.toHaveBeenCalled();
    });

    it('regenerates by dropping the reply, forgetting the thread, and resending history', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        mockReply();
        const history = [
            { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
            {
                id: 'a1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'first try' }],
            },
            {
                id: 'm2',
                role: 'user',
                parts: [{ type: 'text', text: 'again?' }],
            },
            {
                id: 'a2',
                role: 'assistant',
                parts: [{ type: 'text', text: 'the reply to redo' }],
            },
        ];

        const res = await actionCall(
            makeRequest({
                id: 'thread-1',
                messages: history,
                trigger: 'regenerate-message',
            }),
        );

        expect(res.status).toBe(200);
        await settle(res);
        expect(deleteTrailingAssistantMessages).toHaveBeenCalledWith(
            'thread-1',
        );
        expect(deleteThread).toHaveBeenCalledWith('thread-1');
        // Everything up to the last user message, never the stale reply.
        expect(stream.mock.calls[0][0]).toEqual(history.slice(0, 3));
        expect(getThreadById).not.toHaveBeenCalled();
    });

    it('answers 503 with Retry-After while chat memory is unavailable', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        getChat.mockRejectedValue(
            new ResourceUnavailableError(
                'mastra_memory',
                4_200,
                new Error('connect ECONNREFUSED'),
            ),
        );

        const res = await actionCall(
            makeRequest({ ...validBody, trigger: 'regenerate-message' }),
        );

        expect(res.status).toBe(503);
        expect(res.headers.get('Retry-After')).toBe('5');
        expect(await res.json()).toEqual({
            error: expect.stringMatching(/temporarily unavailable/),
        });
        // Nothing is changed before the 503, so a retry starts clean.
        expect(stream).not.toHaveBeenCalled();
        expect(deleteTrailingAssistantMessages).not.toHaveBeenCalled();
        expect(deleteThread).not.toHaveBeenCalled();
    });

    it('checks auth and thread ownership before opening chat memory', async () => {
        getUserFromSession.mockResolvedValue(null);
        expect((await actionCall(makeRequest(validBody))).status).toBe(401);

        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            ...ownedThread,
            createdById: 'other',
        });
        expect((await actionCall(makeRequest(validBody))).status).toBe(403);

        expect(getChat).not.toHaveBeenCalled();
    });

    it('rethrows an unexpected error from opening chat memory', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        const bug = new TypeError('not a connection problem');
        getChat.mockRejectedValue(bug);

        await expect(actionCall(makeRequest(validBody))).rejects.toBe(bug);
    });

    it('does not auto-generate a title when the title is already set', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            ...ownedThread,
            title: 'Existing Title',
        });
        mockReply();

        await settle(await actionCall(makeRequest(validBody)));

        expect(enqueueThreadTitle).not.toHaveBeenCalled();
    });

    it('titles an untitled thread once the reply finishes, not before streaming', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        mockReply();

        const res = await actionCall(makeRequest(validBody));

        // Nothing on the request path: the response is returned first.
        expect(enqueueThreadTitle).not.toHaveBeenCalled();

        await settle(res);

        await vi.waitFor(() =>
            expect(enqueueThreadTitle).toHaveBeenCalledWith({
                threadId: 'thread-1',
                context: 'mock conversation context',
                fallbackTitle: 'mock fallback title',
            }),
        );
    });

    it('does not wait for title generation to finish the stream', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(ownedThread);
        // A title call that never settles must not hold up the response.
        enqueueThreadTitle.mockReturnValue(new Promise(() => {}));
        mockReply();

        const res = await actionCall(makeRequest(validBody));

        await expect(settle(res)).resolves.toContain('[DONE]');
        await vi.waitFor(() =>
            expect(enqueueThreadTitle).toHaveBeenCalledTimes(1),
        );
    });
});

describe('hasContent', () => {
    it('is false for a reply with nothing to show', () => {
        expect(
            hasContent({
                id: 'a1',
                role: 'assistant',
                parts: [{ type: 'step-start' }, { type: 'text', text: ' ' }],
            }),
        ).toBe(false);
    });

    it('is true once the reply has text or a tool part', () => {
        expect(
            hasContent({
                id: 'a1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Partial' }],
            }),
        ).toBe(true);
        expect(
            hasContent({
                id: 'a2',
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-get_weather',
                        toolCallId: 'c1',
                        state: 'input-available',
                        input: {},
                    },
                ],
            }),
        ).toBe(true);
    });
});

describe('/api/chat abort handling', () => {
    beforeEach(() => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            ...ownedThread,
            title: 'Existing Title',
        });
    });

    it('ties generation to the request signal and a timeout', async () => {
        mockReply();
        const client = new AbortController();
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(validBody),
            signal: client.signal,
        });

        await actionCall(request);

        const signal = stream.mock.calls[0][1].abortSignal as AbortSignal;
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        client.abort();
        expect(signal.aborted).toBe(true);
        // The aborted turn still settles (and saves) before the next test.
        await vi.waitFor(() => expect(saveChat).toHaveBeenCalledTimes(1));
    });

    it('saves the partial reply when the client disconnects mid-stream', async () => {
        // A model that streams part of a reply, then hangs until aborted.
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
        stream.mockImplementation(
            async (_input: unknown, options: { abortSignal: AbortSignal }) =>
                aiStreamText({
                    model,
                    prompt: 'hi',
                    abortSignal: options.abortSignal,
                }),
        );

        const client = new AbortController();
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(validBody),
            signal: client.signal,
        });

        const res = await actionCall(request);
        expect(res.status).toBe(200);

        // The client reads until the partial reply arrives, then stops
        // reading and disconnects, as a closed tab or Stop would.
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let received = '';
        while (!received.includes('Partial reply')) {
            const { value, done } = await reader.read();
            if (done) break;
            received += decoder.decode(value, { stream: true });
        }
        client.abort();

        await vi.waitFor(() => expect(saveChat).toHaveBeenCalledTimes(1));
        const saved = saveChat.mock.calls[0][0].messages as UIMessage[];
        expect(saved.map((m) => m.role)).toEqual(['user', 'assistant']);
        expect(saved[1].parts).toContainEqual(
            expect.objectContaining({ type: 'text', text: 'Partial reply' }),
        );
        // The disconnect reached the model call, so generation stopped.
        expect(modelSignal?.aborted).toBe(true);
    });

    it('still saves the reply when the client stops reading the stream', async () => {
        // A long reply: enough chunks to back up an unread response stream.
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
        stream.mockImplementation(async () =>
            aiStreamText({ model, prompt: 'hi' }),
        );

        const res = await actionCall(makeRequest(validBody));

        // Read only the first chunk, then leave the body unread.
        await res.body!.getReader().read();

        await vi.waitFor(() => expect(saveChat).toHaveBeenCalledTimes(1));
        const saved = saveChat.mock.calls[0][0].messages as UIMessage[];
        expect(saved[1].parts).toContainEqual(
            expect.objectContaining({
                type: 'text',
                text: `Start${'.'.repeat(499)}`,
            }),
        );
    });
});
