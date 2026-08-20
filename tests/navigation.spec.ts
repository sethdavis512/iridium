import { test, expect } from './fixtures';

const siteNav = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Site' });
const mainNav = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Main navigation' });

test.describe('Desktop navigation', () => {
    test('logged-out: shows Login, hides Chat and Logout', async ({ page }) => {
        await page.goto('/');

        await expect(
            siteNav(page).getByRole('link', { name: 'Login' }),
        ).toBeVisible();
        await expect(
            siteNav(page).getByRole('button', { name: 'Logout' }),
        ).toHaveCount(0);

        await expect(
            mainNav(page).getByRole('link', { name: 'Home' }),
        ).toBeVisible();
        await expect(
            mainNav(page).getByRole('link', { name: 'Chat' }),
        ).toHaveCount(0);
    });

    test('logged-in: shows Logout and Chat, hides Login', async ({
        authedPage: page,
    }) => {
        await page.goto('/');

        await expect(
            siteNav(page).getByRole('button', { name: 'Logout' }),
        ).toBeVisible();
        await expect(
            siteNav(page).getByRole('link', { name: 'Login' }),
        ).toHaveCount(0);

        await expect(
            mainNav(page).getByRole('link', { name: 'Chat' }),
        ).toBeVisible();
    });

    test('brand link returns to home', async ({ authedPage: page }) => {
        await page.goto('/chat');
        await siteNav(page).getByRole('link', { name: 'Iridium' }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(
            page.getByRole('heading', { name: 'Iridium', level: 1 }),
        ).toBeVisible();
    });

    test('footer is present', async ({ page }) => {
        await page.goto('/');
        await expect(
            page.getByText('Iridium. Go build. Be bold.'),
        ).toBeVisible();
    });

    test('skip-to-content link is keyboard reachable', async ({ page }) => {
        await page.goto('/');
        const skip = page.getByRole('link', { name: 'Skip to main content' });
        await expect(skip).toHaveAttribute('href', '#main-content');

        // Focusing reveals it (focus:not-sr-only) and activating jumps to main.
        await skip.focus();
        await expect(skip).toBeVisible();
        await skip.press('Enter');
        await expect(page).toHaveURL(/#main-content$/);
    });
});

test.describe('Mobile navigation', () => {
    test.use({ viewport: { width: 375, height: 720 } });

    test('hamburger opens the drawer and Escape closes it', async ({
        authedPage: page,
    }) => {
        await page.goto('/');

        const hamburger = page.getByRole('button', {
            name: 'Open navigation menu',
        });
        await expect(hamburger).toBeVisible();
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');

        // Desktop site links are hidden at this width.
        await expect(
            siteNav(page).getByRole('button', { name: 'Logout' }),
        ).toBeHidden();

        await hamburger.click();

        // The open sheet makes the rest of the page inert, so the trigger
        // drops out of the accessibility tree; assert on the drawer itself.
        const drawer = page.getByRole('navigation', {
            name: 'Mobile navigation',
        });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Home' })).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Chat' })).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(drawer).toBeHidden();
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    });

    test('logged-out drawer shows Login', async ({ page }) => {
        await page.goto('/');
        await page
            .getByRole('button', { name: 'Open navigation menu' })
            .click();

        const drawer = page.getByRole('navigation', {
            name: 'Mobile navigation',
        });
        await expect(drawer.getByRole('link', { name: 'Login' })).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Chat' })).toHaveCount(0);
    });
});
