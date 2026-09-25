import {
    test as base,
    expect,
    type Browser,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import { DEMO_EMAIL_DOMAIN } from '~/config';

export const TEST_USER = {
    name: 'Alice',
    email: `alice@${DEMO_EMAIL_DOMAIN}`,
    password: 'password123',
};

/** Second seeded user, used for cross-user authorization tests. */
export const TEST_USER_BOB = {
    name: 'Bob',
    email: `bob@${DEMO_EMAIL_DOMAIN}`,
    password: 'password123',
};

/** Where the auth form sends users on success. */
export const REDIRECT_PATH = '/dashboard';

/**
 * Wait for React hydration (html[data-hydrated], set by root.tsx). Required
 * before interacting with controls whose behavior is attached by React
 * (fetcher-submitting selects, dialog-opening buttons): before hydration
 * they accept DOM events but do nothing.
 */
export async function waitForHydration(page: Page) {
    await page.waitForSelector('html[data-hydrated]', { state: 'attached' });
}

/** Sign in through the login form and wait for the post-login redirect. */
export async function loginViaUI(
    page: Page,
    user: { email: string; password: string } = TEST_USER,
) {
    await page.goto('/login');
    await waitForHydration(page);
    await page.getByPlaceholder('name@example.com').fill(user.email);
    await page.getByPlaceholder('Your password').fill(user.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL(new RegExp(REDIRECT_PATH));
}

/**
 * Sign up a brand-new account via the Better Auth API in the given context and
 * return its credentials. Sign-up auto-signs-in, so the context is left
 * authenticated (its cookie jar holds the session). The email carries a random
 * UUID so concurrent Playwright runs sharing one database (where worker
 * indexes and timestamps repeat) never mint the same address.
 */
export async function createFreshUser(
    context: BrowserContext,
    baseURL: string,
    tag: string | number = 'x',
) {
    const email = `e2e-${tag}-${crypto.randomUUID()}@iridium.test`;
    const password = 'password123';

    const res = await context.request.post('/api/auth/sign-up/email', {
        // Better Auth checks the request Origin against its trusted origins.
        headers: { Origin: baseURL },
        data: { name: `E2E User ${tag}`, email, password },
    });

    if (!res.ok()) {
        throw new Error(
            `Fresh-user sign-up failed (${res.status()}): ${await res.text()}`,
        );
    }

    return { email, password };
}

/**
 * Create a fresh browser context already authenticated as a brand-new user.
 * Caller is responsible for closing the returned context.
 */
export async function createAuthedContext(
    browser: Browser,
    baseURL: string,
    tag: string | number = 'x',
): Promise<BrowserContext> {
    const context = await browser.newContext({ baseURL });
    await createFreshUser(context, baseURL, tag);
    return context;
}

/**
 * Create a thread for the user owning `context` and return its id. Uses the
 * /chat action (the same path the New Thread button hits) and reads the id
 * from the redirect Location.
 */
export async function createThreadViaApi(
    context: BrowserContext,
): Promise<string> {
    const res = await context.request.post('/chat', {
        form: { intent: 'new-thread' },
        maxRedirects: 0,
    });

    const location = res.headers()['location'];
    if (!location) {
        throw new Error(
            `Expected a redirect creating a thread, got ${res.status()}`,
        );
    }

    return location.split('/').pop()!;
}

/**
 * Sign up a brand-new user and promote them to ADMIN via the test-only
 * /api/test-role hook. Signs in again afterwards so the session cookie
 * (which caches the role for up to 5 minutes) reflects the promotion.
 */
export async function createFreshAdmin(
    context: BrowserContext,
    baseURL: string,
    tag: string | number = 'x',
) {
    const { email, password } = await createFreshUser(
        context,
        baseURL,
        `admin-${tag}`,
    );

    const promote = await context.request.post('/api/test-role', {
        form: { email, role: 'ADMIN' },
    });
    if (!promote.ok()) {
        throw new Error(`Admin promotion failed (${promote.status()})`);
    }

    const signIn = await context.request.post('/api/auth/sign-in/email', {
        headers: { Origin: baseURL },
        data: { email, password },
    });
    if (!signIn.ok()) {
        throw new Error(`Admin re-sign-in failed (${signIn.status()})`);
    }

    return { email, password };
}

/**
 * Create a note for the user owning `context` via the /notes action.
 */
export async function createNoteViaApi(
    context: BrowserContext,
    { title, content }: { title: string; content: string },
): Promise<void> {
    const res = await context.request.post('/notes', {
        form: { intent: 'create-note', title, content },
        maxRedirects: 0,
    });

    if (res.status() !== 302) {
        throw new Error(
            `Expected a redirect creating a note, got ${res.status()}`,
        );
    }
}

/**
 * Extend the base test with an `authedPage` fixture backed by a brand-new user
 * created per test. Each test therefore starts from a clean slate (zero
 * threads, zero notes), which keeps parallel runs free of shared-state races.
 */
export const test = base.extend<{ authedPage: Page }>({
    authedPage: async ({ browser }, use, testInfo) => {
        const baseURL = testInfo.project.use.baseURL;
        if (!baseURL) throw new Error('baseURL is not configured');

        const context = await browser.newContext({ baseURL });
        await createFreshUser(context, baseURL, testInfo.workerIndex);

        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

export { expect };
