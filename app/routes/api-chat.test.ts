import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UIMessageChunk } from 'ai';

import type { TurnInput, TurnResult } from '~/lib/thread-chat.server';

// Running a Turn is the Thread chat module's job (tested in
// app/lib/thread-chat.server.test.ts); this route only guards the request and
// maps the module's result to a response.
const { getUserFromSession, runTurn } = vi.hoisted(() => ({
    getUserFromSession: vi.fn(),
    runTurn: vi.fn<(input: TurnInput) => Promise<TurnResult>>(),
}));

vi.mock('~/models/session.server', () => ({
    getUserFromSession: (...args: unknown[]) => getUserFromSession(...args),
}));

vi.mock('~/lib/thread-chat.server', () => ({
    threadChat: { runTurn: (input: TurnInput) => runTurn(input) },
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

/** A reply stream holding one text part. */
function replyStream(text: string): ReadableStream<UIMessageChunk> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue({ type: 'start' });
            controller.enqueue({ type: 'text-start', id: 't1' });
            controller.enqueue({ type: 'text-delta', id: 't1', delta: text });
            controller.enqueue({ type: 'text-end', id: 't1' });
            controller.enqueue({ type: 'finish' });
            controller.close();
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimitHits.clear();
    getUserFromSession.mockResolvedValue({ id: 'u1' });
    runTurn.mockImplementation(async () => ({
        status: 'streaming',
        stream: replyStream('Hello'),
    }));
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

const userMessage = {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'hi' }],
};

const validBody = { id: 'thread-1', messages: [userMessage] };

describe('/api/chat request guards', () => {
    it('returns 405 for non-POST methods', async () => {
        const res = await actionCall(makeRequest(validBody, 'GET'));
        expect(res.status).toBe(405);
    });

    it('returns 400 for invalid request body', async () => {
        const res = await actionCall(makeRequest({ bogus: true }));
        expect(res.status).toBe(400);
    });

    it('returns 400 for malformed JSON', async () => {
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
        expect(runTurn).not.toHaveBeenCalled();
    });

    it('rejects a text part over the length cap', async () => {
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
        expect(runTurn).not.toHaveBeenCalled();
    });

    it('returns 400 when the request has no user message', async () => {
        const res = await actionCall(
            makeRequest({
                id: 'thread-1',
                messages: [{ id: 'a1', role: 'assistant', parts: [] }],
            }),
        );

        expect(res.status).toBe(400);
        expect(runTurn).not.toHaveBeenCalled();
    });

    it('returns 429 once the rate limit is exceeded, before reading the body', async () => {
        // Burn through the 20-req/min limit.
        for (let i = 0; i < 20; i++) {
            const res = await actionCall(makeRequest(validBody));
            expect(res.status).toBe(200);
        }

        const blockedRequest = makeRequest(validBody);
        const blocked = await actionCall(blockedRequest);
        expect(blocked.status).toBe(429);
        expect(blockedRequest.bodyUsed).toBe(false);
    });
});

describe('/api/chat Turn results', () => {
    it('runs the Turn for the newest user message with the request signal', async () => {
        const request = makeRequest({
            id: 'thread-1',
            messages: [
                userMessage,
                {
                    id: 'a1',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'hello' }],
                },
                { ...userMessage, id: 'm2' },
            ],
        });

        const res = await actionCall(request);

        expect(res.status).toBe(200);
        expect(runTurn).toHaveBeenCalledWith({
            userId: 'u1',
            threadId: 'thread-1',
            message: expect.objectContaining({ id: 'm2' }),
            regenerate: false,
            signal: request.signal,
        });
        expect(await res.text()).toContain('Hello');
    });

    it('asks for a regenerate when useChat sends that trigger', async () => {
        await actionCall(
            makeRequest({ ...validBody, trigger: 'regenerate-message' }),
        );

        expect(runTurn).toHaveBeenCalledWith(
            expect.objectContaining({ regenerate: true }),
        );
    });

    it('maps a missing thread to 404 and another user’s thread to 403', async () => {
        runTurn.mockResolvedValueOnce({ status: 'not-found' });
        expect((await actionCall(makeRequest(validBody))).status).toBe(404);

        runTurn.mockResolvedValueOnce({ status: 'forbidden' });
        expect((await actionCall(makeRequest(validBody))).status).toBe(403);
    });

    it('answers 503 with Retry-After while chat memory is unavailable', async () => {
        runTurn.mockResolvedValue({
            status: 'unavailable',
            retryAfterMs: 2500,
        });

        const res = await actionCall(makeRequest(validBody));

        expect(res.status).toBe(503);
        expect(res.headers.get('Retry-After')).toBe('3');
    });

    it('rethrows an unexpected error from running the Turn', async () => {
        runTurn.mockRejectedValue(new Error('boom'));

        await expect(actionCall(makeRequest(validBody))).rejects.toThrow(
            'boom',
        );
    });
});
