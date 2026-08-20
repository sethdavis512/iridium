import { test, expect } from './fixtures';

test.describe('Theme switching', () => {
    test('defaults to system (no dark class in light color scheme)', async ({
        page,
    }) => {
        await page.goto('/');

        await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    });

    test('system preference applies dark before hydration', async ({
        browser,
    }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        const page = await context.newPage();
        await page.goto('/');

        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        await context.close();
    });

    test('selecting dark sets the dark class and persists across reload without FOUC', async ({
        page,
    }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Change theme' }).click();
        await page.getByRole('menuitem', { name: 'Dark' }).click();

        await expect(page.locator('html')).toHaveClass(/\bdark\b/);

        // SSR must emit the class in the initial HTML payload (no flash):
        // fetch the document directly instead of waiting for hydration.
        const response = await page.request.get('/');
        expect(await response.text()).toMatch(/<html[^>]*class="[^"]*\bdark\b/);

        await page.reload();
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    });

    test('selecting light removes the dark class', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Change theme' }).click();
        await page.getByRole('menuitem', { name: 'Dark' }).click();
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);

        await page.getByRole('button', { name: 'Change theme' }).click();
        await page.getByRole('menuitem', { name: 'Light' }).click();

        await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    });

    test('rejects an invalid theme value', async ({ page }) => {
        const response = await page.request.post('/api/theme', {
            form: { theme: 'neon' },
        });

        expect(response.status()).toBe(400);
    });
});
