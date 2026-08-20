import { test, expect, createThreadViaApi, createNoteViaApi } from './fixtures';

test.describe('Dashboard', () => {
    test('renders for an authenticated user', async ({ authedPage: page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(
            page.getByRole('heading', { name: /^Hello / }),
        ).toBeVisible();
    });

    test('shows zero stats and empty states for a fresh user', async ({
        authedPage: page,
    }) => {
        await page.goto('/dashboard');

        await expect(
            page.locator('[data-slot="stat"]', { hasText: 'Conversations' }),
        ).toContainText('0');
        await expect(
            page.locator('[data-slot="stat"]', { hasText: 'Notes' }),
        ).toContainText('0');
        await expect(page.getByText('No conversations yet')).toBeVisible();
        await expect(page.getByText('No notes yet')).toBeVisible();
    });

    test('reflects created threads and notes in stats and lists', async ({
        authedPage: page,
    }) => {
        const threadId = await createThreadViaApi(page.context());
        await createNoteViaApi(page.context(), {
            title: 'Dashboard note',
            content: 'Visible in recents',
        });

        await page.goto('/dashboard');

        await expect(
            page.locator('[data-slot="stat"]', { hasText: 'Conversations' }),
        ).toContainText('1');
        await expect(
            page.locator('[data-slot="stat"]', { hasText: 'Notes' }),
        ).toContainText('1');
        await expect(page.getByText('Dashboard note')).toBeVisible();
        await expect(page.locator(`a[href="/chat/${threadId}"]`)).toBeVisible();
    });

    test('redirects to login when logged out', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/);
        await expect(
            page.getByRole('heading', { name: 'Authenticate' }),
        ).toBeVisible();
    });
});
