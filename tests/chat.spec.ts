import type { Route as PwRoute } from '@playwright/test';
import { test, expect } from './fixtures';
import { SSE_HEADERS, mockChatReply, sseBody } from './chat-mock';

/**
 * Each test runs as a fresh, isolated user (see the `authedPage` fixture), so
 * the thread sidebar starts empty and counts/links are deterministic. Threads
 * are counted by their `link` role — the "No conversations yet" empty state is a
 * listitem with no link, so it never inflates the count.
 */

const conversations = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Conversations' });

/** Path portion (e.g. /chat/abc123) of the currently open thread URL. */
function threadPath(url: string): string {
    return new URL(url).pathname;
}

test.describe('Chat', () => {
    test('starts with an empty thread list and prompt to pick a thread', async ({
        authedPage: page,
    }) => {
        await page.goto('/chat');

        await expect(page.getByText('Pick a thread!')).toBeVisible();
        await expect(page.getByText('No conversations yet')).toBeVisible();
        await expect(conversations(page).getByRole('link')).toHaveCount(0);
    });

    test('can create a new thread', async ({ authedPage: page }) => {
        await page.goto('/chat');

        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

        // The thread view shows the empty state
        await expect(page.getByText('No messages yet')).toBeVisible();
    });

    test('new thread appears in the sidebar', async ({ authedPage: page }) => {
        await page.goto('/chat');
        await expect(conversations(page).getByRole('link')).toHaveCount(0);

        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

        await expect(conversations(page).getByRole('link')).toHaveCount(1);
    });

    test('sending a message shows the user message and AI reply', async ({
        authedPage: page,
    }) => {
        await page.goto('/chat');
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

        const reply = 'Hello from mock AI!';
        await mockChatReply(page, reply);

        await page.getByPlaceholder('Your message here...').fill('Hi there');
        await page.getByRole('button', { name: 'Send' }).click();

        await expect(page.getByText('Hi there')).toBeVisible();
        await expect(page.getByText(reply)).toBeVisible();
    });

    test('AI response streams back incrementally', async ({
        authedPage: page,
    }) => {
        await page.goto('/chat');
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

        // Stream two separate deltas to verify incremental concatenation.
        await page.route('**/api/chat', async (route: PwRoute) => {
            await route.fulfill({
                status: 200,
                headers: SSE_HEADERS,
                body: sseBody([
                    { type: 'start', messageId: 'msg-stream' },
                    { type: 'start-step' },
                    { type: 'text-start', id: 'txt-s' },
                    { type: 'text-delta', id: 'txt-s', delta: 'first chunk ' },
                    { type: 'text-delta', id: 'txt-s', delta: 'second chunk' },
                    { type: 'text-end', id: 'txt-s' },
                    { type: 'finish-step' },
                    { type: 'finish', finishReason: 'stop' },
                ]),
            });
        });

        await page.getByPlaceholder('Your message here...').fill('Stream test');
        await page.getByRole('button', { name: 'Send' }).click();

        await expect(page.getByText('first chunk second chunk')).toBeVisible();
    });

    test('thread can be deleted', async ({ authedPage: page }) => {
        await page.goto('/chat');
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);
        const path = threadPath(page.url());

        const sidebar = conversations(page);
        await expect(sidebar.getByRole('link')).toHaveCount(1);

        // The delete button is revealed on hover of the thread's row.
        const row = sidebar
            .getByRole('listitem')
            .filter({ has: page.locator(`a[href="${path}"]`) });
        await row.hover();
        await row.getByRole('button', { name: 'Delete thread' }).click();

        // Confirm in the modal.
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Delete' }).click();

        // Redirects back to the chat index, and the thread is gone.
        await expect(page).toHaveURL(/\/chat$/);
        await expect(sidebar.getByRole('link')).toHaveCount(0);
        await expect(page.getByText('No conversations yet')).toBeVisible();
    });

    test('can navigate between multiple threads', async ({
        authedPage: page,
    }) => {
        await page.goto('/chat');

        // Create the first thread.
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);
        const firstPath = threadPath(page.url());
        await expect(page.getByText('No messages yet')).toBeVisible();

        // Create a second thread — wait for the path to actually change since
        // we are already on a /chat/<id> URL.
        await page.getByRole('button', { name: 'New Thread' }).click();
        await page.waitForURL(
            (url) =>
                /\/chat\/.+/.test(url.pathname) && url.pathname !== firstPath,
        );
        const secondPath = threadPath(page.url());

        const sidebar = conversations(page);
        await expect(sidebar.getByRole('link')).toHaveCount(2);

        // The open thread's link is marked current; the other is not.
        await expect(
            sidebar.locator(`a[href="${secondPath}"]`),
        ).toHaveAttribute('aria-current', 'page');
        await expect(
            sidebar.locator(`a[href="${firstPath}"]`),
        ).not.toHaveAttribute('aria-current', 'page');

        // Switch back to the first thread.
        await sidebar.locator(`a[href="${firstPath}"]`).click();
        await expect(page).toHaveURL(new RegExp(`${firstPath}$`));
        await expect(page.getByText('No messages yet')).toBeVisible();
        await expect(sidebar.locator(`a[href="${firstPath}"]`)).toHaveAttribute(
            'aria-current',
            'page',
        );
    });
});
