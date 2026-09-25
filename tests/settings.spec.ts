import {
    test,
    expect,
    createFreshUser,
    loginViaUI,
    waitForHydration,
} from './fixtures';

test.describe('Settings', () => {
    test('updates the profile name and bio with a toast', async ({
        authedPage: page,
    }) => {
        await page.goto('/settings');

        await page
            .getByPlaceholder('A line or two about you')
            .fill('I build things.');
        const nameInput = page.locator('input[name="name"]');
        await nameInput.fill('Renamed User');
        await page.getByRole('button', { name: 'Save profile' }).click();

        await expect(page.getByRole('status')).toContainText('Profile updated');

        await page.reload();
        await expect(page.locator('input[name="name"]')).toHaveValue(
            'Renamed User',
        );
        await expect(
            page.getByPlaceholder('A line or two about you'),
        ).toHaveValue('I build things.');
    });

    test('rejects an empty name', async ({ authedPage: page }) => {
        await page.goto('/settings');

        await page.locator('input[name="name"]').fill('');
        await page.getByRole('button', { name: 'Save profile' }).click();

        await expect(page.getByText('Name is required')).toBeVisible();
    });

    test('changes the password and allows sign-in with the new one', async ({
        browser,
    }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL!;
        const context = await browser.newContext({ baseURL });
        const { email, password } = await createFreshUser(
            context,
            baseURL,
            `pw-${testInfo.workerIndex}`,
        );
        const page = await context.newPage();

        await page.goto('/settings');
        await page.locator('input[name="currentPassword"]').fill(password);
        const newPassword = 'changed-password-99';
        await page.locator('input[name="newPassword"]').fill(newPassword);
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(page.getByRole('status')).toContainText(
            'Password changed',
        );

        // Sign out (wait for the redirect), then back in with the new password.
        await page.getByRole('button', { name: 'Logout' }).click();
        await page.waitForURL(/\/login$/);
        await loginViaUI(page, { email, password: newPassword });
        await expect(page).toHaveURL(/\/dashboard$/);

        await context.close();
    });

    test('rejects a wrong current password', async ({ authedPage: page }) => {
        await page.goto('/settings');

        await page
            .locator('input[name="currentPassword"]')
            .fill('not-the-password');
        await page.locator('input[name="newPassword"]').fill('whatever-1234');
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(
            page.getByText('Current password is incorrect.'),
        ).toBeVisible();
    });

    test('deletes the account after password confirmation', async ({
        browser,
    }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL!;
        const context = await browser.newContext({ baseURL });
        const { email, password } = await createFreshUser(
            context,
            baseURL,
            `del-${testInfo.workerIndex}`,
        );
        const page = await context.newPage();

        await page.goto('/settings');
        await waitForHydration(page);
        await page.getByRole('button', { name: 'Delete account' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.locator('input[name="password"]').fill(password);
        await dialog.getByRole('button', { name: 'Delete my account' }).click();

        // Back on the landing page, signed out.
        await expect(page).toHaveURL(/\/$/);

        // The old credentials no longer work.
        await page.goto('/login');
        await page.getByPlaceholder('name@example.com').fill(email);
        await page.getByPlaceholder('Your password').fill(password);
        await page.getByRole('button', { name: 'Login' }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);

        await context.close();
    });

    test('requires authentication', async ({ page }) => {
        await page.goto('/settings');
        await expect(page).toHaveURL(/\/login/);
    });
});
