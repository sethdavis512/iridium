import type { BrowserContext } from '@playwright/test';

import { test, expect, createFreshAdmin, createNoteViaApi } from '../fixtures';
import { mockChatReply, mockChatStream, toolCallChunks } from '../chat-mock';
import {
    MOBILE_VIEWPORT,
    createVisualContext,
    setTheme,
    settle,
    snap,
} from './helpers';

/**
 * Visual inventory: one screenshot per major surface/state, written to
 * test-results/visual-inventory/ and attached to the HTML report (which
 * doubles as a browsable gallery). Runs only via `bun run test:visual`; the
 * default e2e projects ignore tests/visual/.
 *
 * These are captures, not assertions: a shot fails only if the page cannot
 * reach the state, never on pixel drift. To promote a shot to visual
 * regression later, swap snap() for expect(page).toHaveScreenshot().
 */

function projectBaseURL(testInfo: { project: { use: { baseURL?: string } } }) {
    const baseURL = testInfo.project.use.baseURL;
    if (!baseURL) throw new Error('baseURL is not configured');
    return baseURL;
}

/** Three fixed notes used by every "populated" shot. */
async function seedNotes(context: BrowserContext) {
    await createNoteViaApi(context, {
        title: 'Quarterly planning',
        content: 'Draft the Q3 roadmap and circulate for feedback.',
    });
    await createNoteViaApi(context, {
        title: 'Reading list',
        content: 'Designing Data-Intensive Applications, chapter 5.',
    });
    await createNoteViaApi(context, {
        title: 'Brisket method',
        content: 'Salt overnight, smoke at 250F until probe tender.',
    });
    // Creating a note sets a "Note created." flash cookie; burn it with a
    // throwaway request so the toast doesn't photobomb the screenshot.
    await context.request.get('/dashboard');
}

test.describe('logged out', () => {
    test('landing, light', async ({ browser }, testInfo) => {
        const context = await browser.newContext({
            baseURL: projectBaseURL(testInfo),
        });
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/');
        await settle(page);
        await snap(page, testInfo, 'landing-light');
        await context.close();
    });

    test('landing, dark', async ({ browser }, testInfo) => {
        const context = await browser.newContext({
            baseURL: projectBaseURL(testInfo),
        });
        await setTheme(context, 'dark');
        const page = await context.newPage();
        await page.goto('/');
        await settle(page);
        await snap(page, testInfo, 'landing-dark');
        await context.close();
    });

    test('landing, mobile', async ({ browser }, testInfo) => {
        const context = await browser.newContext({
            baseURL: projectBaseURL(testInfo),
            viewport: MOBILE_VIEWPORT,
        });
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/');
        await settle(page);
        await snap(page, testInfo, 'landing-mobile');
        await context.close();
    });

    test('login', async ({ browser }, testInfo) => {
        const context = await browser.newContext({
            baseURL: projectBaseURL(testInfo),
        });
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/login');
        await settle(page);
        await snap(page, testInfo, 'login');
        await context.close();
    });

    test('login, dark', async ({ browser }, testInfo) => {
        const context = await browser.newContext({
            baseURL: projectBaseURL(testInfo),
        });
        await setTheme(context, 'dark');
        const page = await context.newPage();
        await page.goto('/login');
        await settle(page);
        await snap(page, testInfo, 'login-dark');
        await context.close();
    });

    test('login, mobile', async ({ browser }, testInfo) => {
        const context = await browser.newContext({
            baseURL: projectBaseURL(testInfo),
            viewport: MOBILE_VIEWPORT,
        });
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/login');
        await settle(page);
        await snap(page, testInfo, 'login-mobile');
        await context.close();
    });
});

test.describe('dashboard', () => {
    test('empty', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/dashboard');
        await settle(page);
        await snap(page, testInfo, 'dashboard-empty');
        await context.close();
    });

    for (const variant of ['light', 'dark', 'mobile'] as const) {
        test(`populated, ${variant}`, async ({ browser }, testInfo) => {
            const baseURL = projectBaseURL(testInfo);
            const context = await createVisualContext(
                browser,
                baseURL,
                `${testInfo.workerIndex}-${variant}`,
            );
            await setTheme(context, variant === 'dark' ? 'dark' : 'light');
            await seedNotes(context);
            const page = await context.newPage();
            if (variant === 'mobile') {
                await page.setViewportSize(MOBILE_VIEWPORT);
            }
            await page.goto('/dashboard');
            await settle(page);
            await snap(page, testInfo, `dashboard-populated-${variant}`);
            await context.close();
        });
    }
});

test.describe('notes', () => {
    test('empty state', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/notes');
        await settle(page);
        await snap(page, testInfo, 'notes-empty');
        await context.close();
    });

    test('populated', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        await seedNotes(context);
        const page = await context.newPage();
        await page.goto('/notes');
        await settle(page);
        await snap(page, testInfo, 'notes-populated');
        await context.close();
    });

    test('populated, mobile', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            `${testInfo.workerIndex}-mobile`,
        );
        await setTheme(context, 'light');
        await seedNotes(context);
        const page = await context.newPage();
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto('/notes');
        await settle(page);
        await snap(page, testInfo, 'notes-populated-mobile');
        await context.close();
    });

    test('create modal open', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/notes');
        await settle(page);
        await page.getByRole('button', { name: 'New Note' }).first().click();
        await expect(page.getByPlaceholder('Note title')).toBeVisible();
        await snap(page, testInfo, 'notes-create-modal', { fullPage: false });
        await context.close();
    });
});

test.describe('settings', () => {
    test('settings page', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/settings');
        await settle(page);
        await snap(page, testInfo, 'settings', {
            // The unique per-run account email renders in "Signed in as ...".
            extraMasks: [page.getByText(/@iridium\.test/)],
        });
        await context.close();
    });
});

test.describe('chat', () => {
    test('index, no thread selected', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/chat');
        await settle(page);
        await snap(page, testInfo, 'chat-index');
        await context.close();
    });

    test('thread with assistant reply', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/chat');
        await settle(page);
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

        await mockChatReply(
            page,
            'Iridium is the second-densest naturally occurring element, just behind osmium.',
        );
        await page
            .getByPlaceholder('Your message here...')
            .fill('Tell me something about iridium');
        await page.getByRole('button', { name: 'Send' }).click();

        // Screenshot the settled post-stream state; mid-stream frames are racy.
        await expect(page.getByText('second-densest')).toBeVisible();
        await settle(page);
        await snap(page, testInfo, 'chat-thread-reply');
        await context.close();
    });

    test('thread with assistant reply, mobile', async ({
        browser,
    }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            `${testInfo.workerIndex}-mobile`,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto('/chat');
        await settle(page);
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

        await mockChatReply(
            page,
            'Iridium is the second-densest naturally occurring element, just behind osmium.',
        );
        await page
            .getByPlaceholder('Your message here...')
            .fill('Tell me something about iridium');
        await page.getByRole('button', { name: 'Send' }).click();

        await expect(page.getByText('second-densest')).toBeVisible();
        await settle(page);
        await snap(page, testInfo, 'chat-thread-mobile');
        await context.close();
    });

    test('thread with tool card', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await createVisualContext(
            browser,
            baseURL,
            testInfo.workerIndex,
        );
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/chat');
        await settle(page);
        await page.getByRole('button', { name: 'New Thread' }).click();
        await expect(page).toHaveURL(/\/chat\/.+/);

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
        await page
            .getByPlaceholder('Your message here...')
            .fill('Show me a fact');
        await page.getByRole('button', { name: 'Send' }).click();

        await expect(
            page.getByRole('heading', { name: 'Did you know?' }),
        ).toBeVisible();
        await settle(page);
        await snap(page, testInfo, 'chat-thread-tool-card');
        await context.close();
    });
});

test.describe('admin', () => {
    test('user table', async ({ browser }, testInfo) => {
        const baseURL = projectBaseURL(testInfo);
        const context = await browser.newContext({ baseURL });
        await createFreshAdmin(context, baseURL, testInfo.workerIndex);
        await setTheme(context, 'light');
        const page = await context.newPage();
        await page.goto('/admin');
        await settle(page);
        await snap(page, testInfo, 'admin-users', {
            // User emails are unique per run; rows vary with parallel workers.
            extraMasks: [page.getByText(/@iridium\.(test|dev)/)],
        });
        await context.close();
    });
});
