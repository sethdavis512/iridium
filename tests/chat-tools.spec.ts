import { test, expect, waitForHydration } from './fixtures';
import { mockChatStream, toolCallChunks } from './chat-mock';

/**
 * Verifies the tool-driven generative UI: the agent returns structured tool
 * output and the thread view renders a rich component (note summary or card)
 * instead of plain text. The /api/chat stream is mocked with dynamic-tool
 * parts that mirror what the VoltAgent backend emits.
 */

async function openNewThread(page: import('@playwright/test').Page) {
    await page.goto('/chat');
    // Before hydration the composer accepts input but useChat isn't attached,
    // so Send silently does nothing. Wait on both sides of the navigation.
    await waitForHydration(page);
    await page.getByRole('button', { name: 'New Thread' }).click();
    await expect(page).toHaveURL(/\/chat\/.+/);
    await waitForHydration(page);
}

async function send(page: import('@playwright/test').Page, text: string) {
    await waitForHydration(page);
    await page.getByPlaceholder('Your message here...').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Agent tool rendering', () => {
    test('create_note renders a saved-note confirmation', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatStream(
            page,
            toolCallChunks({
                toolName: 'create_note',
                input: { title: 'Groceries', content: 'milk, eggs' },
                output: { id: 'n1', title: 'Groceries', content: 'milk, eggs' },
            }),
        );

        await send(page, 'Save a note');

        await expect(page.getByText('Creating note')).toBeVisible();
        await expect(page.getByText('Saved: Groceries')).toBeVisible();
    });

    test('list_notes renders the returned notes', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatStream(
            page,
            toolCallChunks({
                toolName: 'list_notes',
                output: {
                    notes: [
                        { id: '1', title: 'Alpha', content: 'first note body' },
                        { id: '2', title: 'Beta', content: 'second note body' },
                    ],
                },
            }),
        );

        await send(page, 'List my notes');

        await expect(page.getByText('Listing notes')).toBeVisible();
        await expect(page.getByText('Alpha')).toBeVisible();
        await expect(page.getByText('Beta')).toBeVisible();
    });

    test('render_card (info) renders an info card', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatStream(
            page,
            toolCallChunks({
                toolName: 'render_card',
                output: {
                    variant: 'info',
                    title: 'Did you know?',
                    description: 'Iridium is dense.',
                    items: ['point one', 'point two'],
                },
            }),
        );

        await send(page, 'Show me a fact');

        await expect(
            page.getByRole('heading', { name: 'Did you know?' }),
        ).toBeVisible();
        await expect(page.getByText('Iridium is dense.')).toBeVisible();
        await expect(page.getByText('point one')).toBeVisible();
    });

    test('render_card (steps) renders an ordered steps card', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatStream(
            page,
            toolCallChunks({
                toolName: 'render_card',
                output: {
                    variant: 'steps',
                    title: 'How to deploy',
                    steps: ['Build the app', 'Push to Railway'],
                },
            }),
        );

        await send(page, 'How do I deploy?');

        await expect(
            page.getByRole('heading', { name: 'How to deploy' }),
        ).toBeVisible();
        await expect(page.getByText('Build the app')).toBeVisible();
        await expect(page.getByText('Push to Railway')).toBeVisible();
    });

    test('render_card (pros_cons) renders both columns', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatStream(
            page,
            toolCallChunks({
                toolName: 'render_card',
                output: {
                    variant: 'pros_cons',
                    title: 'Bun vs Node',
                    pros: ['Fast installs'],
                    cons: ['Younger ecosystem'],
                },
            }),
        );

        await send(page, 'Compare Bun and Node');

        await expect(
            page.getByRole('heading', { name: 'Bun vs Node' }),
        ).toBeVisible();
        await expect(page.getByText('Fast installs')).toBeVisible();
        await expect(page.getByText('Younger ecosystem')).toBeVisible();
    });
});
