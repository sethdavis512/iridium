import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import z from 'zod';

import { rateLimit } from '~/lib/rate-limit.server';
import { threadChat } from '~/lib/thread-chat.server';
import { getUserFromSession } from '~/models/session.server';
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

    const messages = parsed.messages as UIMessage[];

    // Only the newest user message is used: the Thread holds the history.
    const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === 'user');

    if (!latestUserMessage) {
        return Response.json(
            { error: 'No user message found in request' },
            { status: 400 },
        );
    }

    const turn = await threadChat.runTurn({
        userId: user.id,
        threadId: parsed.id,
        message: latestUserMessage,
        regenerate: parsed.trigger === 'regenerate-message',
        signal: request.signal,
    });

    switch (turn.status) {
        case 'not-found':
            return Response.json(
                { error: 'Thread not found' },
                { status: 404 },
            );
        case 'forbidden':
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        case 'unavailable':
            return Response.json(
                {
                    error: 'Chat is temporarily unavailable. Please try again in a moment.',
                },
                {
                    status: 503,
                    headers: {
                        'Retry-After': String(
                            Math.max(1, Math.ceil(turn.retryAfterMs / 1000)),
                        ),
                    },
                },
            );
        case 'streaming':
            return createUIMessageStreamResponse({ stream: turn.stream });
    }
}
