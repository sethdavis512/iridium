import type { Page } from '@playwright/test';
import { test, expect, waitForHydration } from './fixtures';
import { mockChatError, mockChatReply } from './chat-mock';

async function openNewThread(page: Page) {
    await page.goto('/chat');
    // Before hydration the composer accepts input but useChat isn't attached,
    // so Send silently does nothing. Wait on both sides of the navigation.
    await waitForHydration(page);
    await page.getByRole('button', { name: 'New Thread' }).click();
    await expect(page).toHaveURL(/\/chat\/.+/);
    await waitForHydration(page);
}

async function send(page: Page, text: string) {
    await waitForHydration(page);
    await page.getByPlaceholder('Your message here...').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Chat input behaviour', () => {
    test('Enter key sends the message', async ({ authedPage: page }) => {
        await openNewThread(page);
        await mockChatReply(page, 'Reply via Enter');

        const input = page.getByPlaceholder('Your message here...');
        await input.fill('hello there');
        await input.press('Enter');

        await expect(page.getByText('hello there')).toBeVisible();
        await expect(page.getByText('Reply via Enter')).toBeVisible();
    });

    test('does not send an empty message', async ({ authedPage: page }) => {
        await openNewThread(page);
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('No messages yet')).toBeVisible();
    });

    test('Stop is disabled and Send enabled at rest', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
    });
});

test.describe('Chat preset prompts', () => {
    const PRESETS = [
        'Summarize',
        'Explain',
        'Pros & Cons',
        'Next Steps',
        'My Notes',
        'Save Note',
    ];

    test('all preset buttons are shown and enabled', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        for (const label of PRESETS) {
            await expect(
                page.getByRole('button', { name: label }),
            ).toBeEnabled();
        }
    });

    test('clicking a preset sends it and shows the reply', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatReply(page, 'Here is your summary');
        await page.getByRole('button', { name: 'Summarize' }).click();
        await expect(page.getByText('Here is your summary')).toBeVisible();
    });
});

test.describe('Chat error handling', () => {
    test('shows an error alert when the request fails', async ({
        authedPage: page,
    }) => {
        await openNewThread(page);
        await mockChatError(page, 500);
        await send(page, 'this will fail');

        const alert = page.getByRole('alert');
        await expect(alert).toBeVisible();
        await expect(alert).toContainText('Something went wrong.');
        await expect(
            alert.getByRole('button', { name: 'Retry' }),
        ).toBeVisible();
        await expect(
            alert.getByRole('button', { name: 'Dismiss' }),
        ).toBeVisible();
    });

    test('Dismiss clears the error alert', async ({ authedPage: page }) => {
        await openNewThread(page);
        await mockChatError(page, 500);
        await send(page, 'this will fail');

        const alert = page.getByRole('alert');
        await expect(alert).toBeVisible();
        await alert.getByRole('button', { name: 'Dismiss' }).click();
        await expect(alert).toHaveCount(0);
    });

    test('Retry re-sends and can succeed', async ({ authedPage: page }) => {
        await openNewThread(page);
        await mockChatError(page, 500);
        await send(page, 'flaky message');

        await expect(page.getByRole('alert')).toBeVisible();

        // Swap the mock to succeed, then retry.
        await page.unroute('**/api/chat');
        await mockChatReply(page, 'Recovered reply');
        await page.getByRole('button', { name: 'Retry' }).click();

        await expect(page.getByText('Recovered reply')).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
    });
});
