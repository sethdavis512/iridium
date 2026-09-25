import { test, expect, createThreadViaApi, waitForHydration } from './fixtures';
import { mockChatReply } from './chat-mock';

test.describe('Per-thread model selection', () => {
    test('changing the model persists across reload', async ({
        authedPage: page,
    }) => {
        const threadId = await createThreadViaApi(page.context());
        await page.goto(`/chat/${threadId}`);
        // The select submits via a React fetcher; wait for hydration.
        await waitForHydration(page);

        const select = page.getByLabel('Model');
        await expect(select).toHaveValue('anthropic/claude-haiku-4-5-20251001');

        // Wait for the set-model fetcher POST to complete before reloading;
        // a reload mid-flight cancels it and the change is never saved.
        const saved = page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname.startsWith('/chat'),
        );
        await select.selectOption('anthropic/claude-sonnet-4-6');
        await expect(select).toHaveValue('anthropic/claude-sonnet-4-6');
        await saved;

        await page.reload();
        await expect(page.getByLabel('Model')).toHaveValue(
            'anthropic/claude-sonnet-4-6',
        );
    });

    test('rejects a model outside the allowlist', async ({
        authedPage: page,
    }) => {
        const threadId = await createThreadViaApi(page.context());

        const res = await page.context().request.post('/chat', {
            form: {
                intent: 'set-model',
                threadId,
                model: 'anthropic/claude-evil-9000',
            },
        });

        expect(res.status()).toBe(400);
    });
});

test.describe('Chat request payload', () => {
    test('a normal turn sends only the newest message; regenerate sends the history', async ({
        authedPage: page,
    }) => {
        const bodies: { messages: unknown[]; trigger?: string }[] = [];
        const { SSE_HEADERS, sseBody, textReplyChunks } =
            await import('./chat-mock');
        await page.route('/api/chat', async (route) => {
            bodies.push(route.request().postDataJSON());
            await route.fulfill({
                status: 200,
                headers: SSE_HEADERS,
                body: sseBody(
                    textReplyChunks(
                        `Answer ${bodies.length}`,
                        `mock-msg-${bodies.length}`,
                    ),
                ),
            });
        });

        await page.goto('/chat');
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);
        await waitForHydration(page);

        await page.getByLabel('Message').fill('First question');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('Answer 1')).toBeVisible();

        await page.getByLabel('Message').fill('Second question');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('Answer 2')).toBeVisible();

        expect(bodies[1].messages).toEqual([
            expect.objectContaining({
                role: 'user',
                parts: [{ type: 'text', text: 'Second question' }],
            }),
        ]);

        await page.getByRole('button', { name: 'Regenerate' }).click();
        await expect(page.getByText('Answer 3')).toBeVisible();

        // First question, first answer, second question.
        expect(bodies[2].trigger).toBe('regenerate-message');
        expect(bodies[2].messages).toHaveLength(3);
    });
});

test.describe('Message regeneration', () => {
    test('regenerate replaces the last assistant response', async ({
        authedPage: page,
    }) => {
        await mockChatReply(page, 'First answer');

        // Navigate via the UI (not a direct goto) so the page is hydrated
        // before we interact - a direct load can swallow the Send click.
        await page.goto('/chat');
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);
        await waitForHydration(page);

        await page.getByLabel('Message').fill('Tell me something');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('First answer')).toBeVisible();

        // Swap the mock so the regenerated response is distinguishable, and
        // capture the request body to assert the regenerate trigger.
        let regenerateBody: Record<string, unknown> | null = null;
        await page.unroute('/api/chat');
        await page.route('/api/chat', async (route) => {
            regenerateBody = route.request().postDataJSON();
            const { SSE_HEADERS, sseBody, textReplyChunks } =
                await import('./chat-mock');
            await route.fulfill({
                status: 200,
                headers: SSE_HEADERS,
                body: sseBody(textReplyChunks('Second answer', 'mock-msg-2')),
            });
        });

        await page.getByRole('button', { name: 'Regenerate' }).click();

        await expect(page.getByText('Second answer')).toBeVisible();
        await expect(page.getByText('First answer')).toHaveCount(0);
        expect((regenerateBody as { trigger?: string } | null)?.trigger).toBe(
            'regenerate-message',
        );
    });
});
