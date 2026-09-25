import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
    getUserFromSession,
    getThreadMeta,
    saveChat,
    enqueueThreadTitle,
    streamText,
    generateText,
    clearMessages,
} = vi.hoisted(() => ({
    getUserFromSession: vi.fn(),
    getThreadMeta: vi.fn(),
    saveChat: vi.fn(),
    enqueueThreadTitle: vi.fn(),
    streamText: vi.fn(),
    generateText: vi.fn(),
    clearMessages: vi.fn(),
}));

vi.mock('~/models/session.server', () => ({
    getUserFromSession: (...args: unknown[]) => getUserFromSession(...args),
}));

vi.mock('~/models/thread.server', () => ({
    getThreadMeta: (...args: unknown[]) => getThreadMeta(...args),
    saveChat: (...args: unknown[]) => saveChat(...args),
    deleteTrailingAssistantMessages: vi.fn(),
}));

vi.mock('~/lib/jobs.server', () => ({
    enqueueThreadTitle: (...args: unknown[]) => enqueueThreadTitle(...args),
}));

// The real module pulls in VoltAgent + Prisma (and env validation with them).
vi.mock('~/lib/thread-title.server', () => ({
    buildTitleContext: () => 'mock conversation context',
    buildFallbackTitle: () => 'mock fallback title',
}));

vi.mock('~/voltagent', () => ({
    agent: {
        streamText: (...args: unknown[]) => streamText(...args),
        generateText: (...args: unknown[]) => generateText(...args),
    },
    memory: {
        clearMessages: (...args: unknown[]) => clearMessages(...args),
    },
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

import { action } from './api-chat';

beforeEach(() => {
    vi.clearAllMocks();
    rateLimitHits.clear();
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

function actionCall(request: Request) {
    // The Route.ActionArgs type isn't exposed easily in tests; cast pragmatically.
    return action({ request } as unknown as Parameters<typeof action>[0]);
}

type OnFinish = (args: { messages: unknown[] }) => Promise<void>;

/** Stub a successful stream and capture the onFinish it was given. */
function captureOnFinish() {
    const captured: { current: OnFinish | null } = { current: null };
    streamText.mockResolvedValue({
        toUIMessageStreamResponse: (opts: { onFinish: OnFinish }) => {
            captured.current = opts.onFinish;
            return new Response('ok', { status: 200 });
        },
    });
    return captured;
}

const validBody = {
    id: 'thread-1',
    messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    ],
};

describe('/api/chat action', () => {
    it('returns 405 for non-POST methods', async () => {
        const res = await actionCall(makeRequest(validBody, 'GET'));
        expect(res.status).toBe(405);
    });

    it('returns 400 for invalid request body', async () => {
        const res = await actionCall(makeRequest({ bogus: true }));
        expect(res.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
        getUserFromSession.mockResolvedValue(null);

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(401);
    });

    it('returns 404 when the thread does not exist', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue(null);

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(404);
        expect(streamText).not.toHaveBeenCalled();
    });

    it('returns 403 when the thread belongs to another user', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'other',
            title: 'Untitled',
        });

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(403);
        expect(streamText).not.toHaveBeenCalled();
    });

    it('returns 429 when the rate limit is exceeded', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Untitled',
        });
        streamText.mockResolvedValue({
            toUIMessageStreamResponse: () =>
                new Response('ok', { status: 200 }),
        });

        // Burn through the 20-req/min limit.
        for (let i = 0; i < 20; i++) {
            const res = await actionCall(makeRequest(validBody));
            expect(res.status).toBe(200);
        }

        const blocked = await actionCall(makeRequest(validBody));
        expect(blocked.status).toBe(429);
    });

    it('streams successfully on the happy path and wires onFinish to saveChat', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Untitled',
        });

        let capturedOnFinish:
            ((args: { messages: unknown[] }) => Promise<void>) | null = null;
        streamText.mockResolvedValue({
            toUIMessageStreamResponse: (opts: {
                onFinish: (args: { messages: unknown[] }) => Promise<void>;
            }) => {
                capturedOnFinish = opts.onFinish;
                return new Response('ok', { status: 200 });
            },
        });

        const res = await actionCall(makeRequest(validBody));
        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                userId: 'u1',
                conversationId: 'thread-1',
            }),
        );

        // Simulate the stream finishing and verify saveChat is invoked.
        expect(capturedOnFinish).not.toBeNull();
        await capturedOnFinish!({
            messages: [{ id: 'm1', role: 'user', parts: [] }],
        });

        expect(saveChat).toHaveBeenCalledWith({
            messages: [{ id: 'm1', role: 'user', parts: [] }],
            threadId: 'thread-1',
            userId: 'u1',
        });
    });

    it('does not throw when saveChat fails (errors are logged, not propagated)', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Untitled',
        });
        saveChat.mockRejectedValue(new Error('db down'));

        let capturedOnFinish:
            ((args: { messages: unknown[] }) => Promise<void>) | null = null;
        streamText.mockResolvedValue({
            toUIMessageStreamResponse: (opts: {
                onFinish: (args: { messages: unknown[] }) => Promise<void>;
            }) => {
                capturedOnFinish = opts.onFinish;
                return new Response('ok', { status: 200 });
            },
        });

        await actionCall(makeRequest(validBody));

        // Should not throw — the error is caught and logged.
        await expect(
            capturedOnFinish!({ messages: [] }),
        ).resolves.toBeUndefined();
    });

    it('self-heals memory on a duplicate-item error and retries the stream', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Untitled',
        });

        streamText
            .mockRejectedValueOnce(
                new Error('Duplicate item found with id xyz'),
            )
            .mockResolvedValueOnce({
                toUIMessageStreamResponse: () =>
                    new Response('ok', { status: 200 }),
            });

        const res = await actionCall(makeRequest(validBody));

        expect(res.status).toBe(200);
        expect(clearMessages).toHaveBeenCalledWith('u1', 'thread-1');
        expect(streamText).toHaveBeenCalledTimes(2);
    });

    it('does not auto-generate a title when the title is already set', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Existing Title',
        });
        const onFinish = captureOnFinish();

        await actionCall(makeRequest(validBody));
        await onFinish.current!({ messages: [] });

        expect(generateText).not.toHaveBeenCalled();
        expect(enqueueThreadTitle).not.toHaveBeenCalled();
    });

    it('titles an untitled thread once the reply finishes, not before streaming', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Untitled',
        });
        const onFinish = captureOnFinish();

        await actionCall(makeRequest(validBody));

        // Nothing on the request path: the response is returned first.
        expect(enqueueThreadTitle).not.toHaveBeenCalled();

        await onFinish.current!({ messages: [] });

        expect(enqueueThreadTitle).toHaveBeenCalledWith({
            threadId: 'thread-1',
            context: 'mock conversation context',
            fallbackTitle: 'mock fallback title',
        });
    });

    it('does not wait for title generation to finish the stream', async () => {
        getUserFromSession.mockResolvedValue({ id: 'u1' });
        getThreadMeta.mockResolvedValue({
            id: 'thread-1',
            createdById: 'u1',
            title: 'Untitled',
        });
        // A title call that never settles must not hold up onFinish.
        enqueueThreadTitle.mockReturnValue(new Promise(() => {}));
        const onFinish = captureOnFinish();

        await actionCall(makeRequest(validBody));

        await expect(
            onFinish.current!({ messages: [] }),
        ).resolves.toBeUndefined();
        expect(enqueueThreadTitle).toHaveBeenCalledTimes(1);
    });
});
