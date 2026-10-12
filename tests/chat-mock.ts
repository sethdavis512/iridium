import type { Page, Route as PwRoute } from '@playwright/test';

/**
 * Helpers for faking the `/api/chat` Server-Sent Events stream so E2E tests
 * never call a real AI provider. The chunk shapes mirror the Vercel AI SDK
 * v6 UI message stream (see `node_modules/ai/dist/index.d.ts`): text parts use
 * `text-*` chunks; tool parts use `tool-input-*` / `tool-output-available`,
 * which `useChat` assembles into a `tool-<name>` message part.
 */

export const SSE_HEADERS = {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-vercel-ai-ui-message-stream': 'v1',
};

/** Serialize an array of UI message stream chunks into an SSE body. */
export function sseBody(chunks: Record<string, unknown>[]): string {
    return (
        chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') +
        'data: [DONE]\n\n'
    );
}

/** Chunks that stream a single plain-text assistant reply. */
export function textReplyChunks(text: string, messageId = 'mock-msg-1') {
    return [
        { type: 'start', messageId },
        { type: 'start-step' },
        { type: 'text-start', id: 'txt-1' },
        { type: 'text-delta', id: 'txt-1', delta: text },
        { type: 'text-end', id: 'txt-1' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
    ];
}

/**
 * Chunks that stream a tool call which resolves to `output`. The `dynamic: true`
 * flag makes the SDK assemble a `dynamic-tool` part that carries `toolName`;
 * the thread view reads the name from it, or from a static `tool-<name>` part
 * (what the Mastra backend emits), to pick the right tool renderer.
 */
export function toolCallChunks({
    toolName,
    input = {},
    output,
    messageId = 'mock-tool-msg',
    toolCallId = 'tool-call-1',
}: {
    toolName: string;
    input?: unknown;
    output: unknown;
    messageId?: string;
    toolCallId?: string;
}) {
    return [
        { type: 'start', messageId },
        { type: 'start-step' },
        { type: 'tool-input-start', toolCallId, toolName, dynamic: true },
        {
            type: 'tool-input-available',
            toolCallId,
            toolName,
            input,
            dynamic: true,
        },
        { type: 'tool-output-available', toolCallId, output, dynamic: true },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
    ];
}

/** Intercept POST /api/chat and reply with a canned SSE stream of `chunks`. */
export async function mockChatStream(
    page: Page,
    chunks: Record<string, unknown>[],
) {
    await page.route('**/api/chat', async (route: PwRoute) => {
        await route.fulfill({
            status: 200,
            headers: SSE_HEADERS,
            body: sseBody(chunks),
        });
    });
}

/** Intercept POST /api/chat and reply with a plain-text assistant message. */
export async function mockChatReply(
    page: Page,
    text: string,
    messageId?: string,
) {
    await mockChatStream(page, textReplyChunks(text, messageId));
}

/** Intercept POST /api/chat and fail it, to exercise the error UI. */
export async function mockChatError(page: Page, status = 500) {
    await page.route('**/api/chat', async (route: PwRoute) => {
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Something went wrong.' }),
        });
    });
}
