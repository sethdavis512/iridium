import { test, expect, TEST_USER, waitForHydration } from './fixtures';

test.describe('Login', () => {
    test('logs in with valid credentials and redirects to dashboard', async ({
        page,
    }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByPlaceholder('name@example.com').fill(TEST_USER.email);
        await page.getByPlaceholder('Your password').fill(TEST_USER.password);
        await page.getByRole('button', { name: 'Login' }).click();

        await expect(page).toHaveURL(/\/dashboard/);
        await expect(
            page.getByRole('heading', { name: /^Hello / }),
        ).toBeVisible();
    });

    test('hides social login buttons when no provider is configured', async ({
        page,
    }) => {
        // The E2E server sets no OAuth env vars, so the env-gated provider
        // buttons must not render.
        await page.goto('/login');
        await waitForHydration(page);

        await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
        await expect(
            page.getByRole('button', { name: /Continue with/ }),
        ).toHaveCount(0);
    });

    test('shows error for invalid credentials', async ({ page }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByPlaceholder('name@example.com').fill(TEST_USER.email);
        await page.getByPlaceholder('Your password').fill('wrongpassword');
        await page.getByRole('button', { name: 'Login' }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByRole('alert')).toContainText(
            /fail|invalid|incorrect/i,
        );
    });

    test('validates required fields', async ({ page }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByRole('button', { name: 'Login' }).click();
        await expect(
            page.getByText('Enter a valid email address'),
        ).toBeVisible();
        await expect(
            page.getByText('Password must be at least 8 characters'),
        ).toBeVisible();
    });

    test('validates short password', async ({ page }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByPlaceholder('name@example.com').fill('test@test.com');
        await page.getByPlaceholder('Your password').fill('short');
        await page.getByRole('button', { name: 'Login' }).click();
        await expect(
            page.getByText('Password must be at least 8 characters'),
        ).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Registration', () => {
    test('switches to register mode and shows name field', async ({ page }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await expect(page.getByPlaceholder('Your name')).not.toBeVisible();
        await page.getByRole('radio', { name: 'Register' }).check();
        await expect(page.getByPlaceholder('Your name')).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Register' }),
        ).toBeVisible();
    });

    test('requires name when registering', async ({ page }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByRole('radio', { name: 'Register' }).check();
        await page.getByPlaceholder('name@example.com').fill('new@test.com');
        await page.getByPlaceholder('Your password').fill('password123');
        await page.getByRole('button', { name: 'Register' }).click();
        await expect(page.getByText('Name is required')).toBeVisible();
    });

    test('registers a new user and redirects to dashboard', async ({
        page,
    }) => {
        const unique = `e2e-register-${crypto.randomUUID()}@iridium.test`;
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByRole('radio', { name: 'Register' }).check();
        await page.getByPlaceholder('Your name').fill('E2E Test User');
        await page.getByPlaceholder('name@example.com').fill(unique);
        await page.getByPlaceholder('Your password').fill('password123');
        await page.getByRole('button', { name: 'Register' }).click();
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(
            page.getByRole('heading', { name: /^Hello / }),
        ).toBeVisible();
    });

    test('shows error when registering with existing email', async ({
        page,
    }) => {
        await page.goto('/login');
        await waitForHydration(page);
        await page.getByRole('radio', { name: 'Register' }).check();
        await page.getByPlaceholder('Your name').fill('Alice Dup');
        await page.getByPlaceholder('name@example.com').fill(TEST_USER.email);
        await page.getByPlaceholder('Your password').fill('password123');
        await page.getByRole('button', { name: 'Register' }).click();
        await expect(page.getByRole('alert')).toBeVisible({
            timeout: 10000,
        });
    });
});

test.describe('Logout', () => {
    test('logs out and redirects to login', async ({ authedPage: page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'Logout' }).click();
        await expect(
            page.getByRole('heading', { name: 'Authenticate' }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });

    test('protected pages redirect to login when logged out', async ({
        page,
    }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Auth-conditional navigation', () => {
    test('shows login link when unauthenticated', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    });

    test('shows logout button when authenticated', async ({
        authedPage: page,
    }) => {
        await page.goto('/');
        await expect(
            page.getByRole('button', { name: 'Logout' }),
        ).toBeVisible();
    });
});
