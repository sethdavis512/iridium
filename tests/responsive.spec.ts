import type { BrowserContext, Page } from '@playwright/test';

import {
    test,
    expect,
    createFreshAdmin,
    createNoteViaApi,
    createThreadViaApi,
    waitForHydration,
} from './fixtures';
import { mockChatReply } from './chat-mock';
import { MOBILE_VIEWPORT } from './visual/helpers';

/**
 * Responsive guardrails: deterministic assertions that key surfaces stay
 * usable on small screens. Runs in the default browser projects (viewports
 * are set per test). The QA explorer's MOBILE charter covers the exploratory
 * long tail beyond these checks.
 */

const TABLET_VIEWPORT = { width: 768, height: 1024 };

async function expectNoHorizontalOverflow(page: Page, label: string) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
    expect
        .soft(scrollWidth, `${label}: document scrolls horizontally`)
        .toBeLessThanOrEqual(clientWidth + 1);
}

/** Seed enough content that lists, sidebars, and cards render populated. */
async function seedContent(context: BrowserContext) {
    await createNoteViaApi(context, {
        title: 'Quarterly planning with a deliberately long title to stress truncation',
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
    await createThreadViaApi(context);
}

test.describe('no horizontal overflow', () => {
    for (const route of ['/', '/login']) {
        test(`logged out ${route}`, async ({ page }) => {
            await page.setViewportSize(MOBILE_VIEWPORT);
            await page.goto(route);
            await waitForHydration(page);
            await expectNoHorizontalOverflow(page, `${route} @ phone`);

            await page.setViewportSize(TABLET_VIEWPORT);
            await expectNoHorizontalOverflow(page, `${route} @ tablet`);
        });
    }

    for (const route of ['/dashboard', '/notes', '/chat', '/settings']) {
        test(`authed ${route}`, async ({ authedPage: page }) => {
            await seedContent(page.context());
            await page.setViewportSize(MOBILE_VIEWPORT);
            await page.goto(route);
            await waitForHydration(page);
            await expectNoHorizontalOverflow(page, `${route} @ phone`);

            await page.setViewportSize(TABLET_VIEWPORT);
            await expectNoHorizontalOverflow(page, `${route} @ tablet`);
        });
    }

    test('admin user table', async ({ browser }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL;
        if (!baseURL) throw new Error('baseURL is not configured');
        const context = await browser.newContext({ baseURL });
        await createFreshAdmin(context, baseURL, testInfo.workerIndex);
        const page = await context.newPage();

        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto('/admin');
        await waitForHydration(page);
        await expectNoHorizontalOverflow(page, '/admin @ phone');

        // The table itself may be wider than the phone, but it must scroll
        // inside its overflow container, and its actions must be reachable
        // by scrolling that container, not the document.
        const wrapper = page.locator('.overflow-x-auto').first();
        await expect(wrapper).toBeVisible();
        await wrapper.evaluate((el) => {
            el.scrollLeft = el.scrollWidth;
        });
        await expect(
            page.getByRole('button', { name: 'Impersonate' }).first(),
        ).toBeVisible();

        await page.setViewportSize(TABLET_VIEWPORT);
        await expectNoHorizontalOverflow(page, '/admin @ tablet');

        await context.close();
    });
});

test.describe('mobile navigation completes', () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test('drawer link navigates and closes the drawer', async ({
        authedPage: page,
    }) => {
        await page.goto('/dashboard');
        await waitForHydration(page);

        const hamburger = page.getByRole('button', {
            name: 'Open navigation menu',
        });
        await hamburger.click();

        const drawer = page.getByRole('navigation', {
            name: 'Mobile navigation',
        });
        await drawer.getByRole('link', { name: 'Notes' }).click();

        await expect(page).toHaveURL(/\/notes/);
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
        await expect(drawer).toBeHidden();
    });

    test('backdrop click closes the drawer', async ({ authedPage: page }) => {
        await page.goto('/dashboard');
        await waitForHydration(page);

        const hamburger = page.getByRole('button', {
            name: 'Open navigation menu',
        });
        await hamburger.click();

        const drawer = page.getByRole('navigation', {
            name: 'Mobile navigation',
        });
        await expect(drawer).toBeVisible();

        // Click the backdrop (right of the sheet) to dismiss.
        await page.mouse.click(360, 400);
        await expect(drawer).toBeHidden();
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    });
});

test.describe('chat at phone size', () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test('stacked layout keeps the composer usable', async ({
        authedPage: page,
    }) => {
        const threadId = await createThreadViaApi(page.context());
        await page.goto(`/chat/${threadId}`);
        await waitForHydration(page);

        // The sidebar is capped (max-h-48) so the thread pane gets the room.
        const sidebar = page
            .getByRole('navigation', { name: 'Conversations' })
            .locator('..');
        const sidebarBox = await sidebar.boundingBox();
        expect(sidebarBox).not.toBeNull();
        expect(sidebarBox!.height).toBeLessThanOrEqual(
            192 + 60, // max-h-48 plus the search form above the list
        );

        const composer = page.getByPlaceholder('Your message here...');
        const send = page.getByRole('button', { name: 'Send' });
        for (const control of [composer, send]) {
            const box = await control.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width).toBeLessThanOrEqual(
                MOBILE_VIEWPORT.width,
            );
            expect(box!.y + box!.height).toBeLessThanOrEqual(
                MOBILE_VIEWPORT.height,
            );
        }

        await mockChatReply(page, 'Mobile reply rendered.');
        await composer.fill('Hello from a phone');
        await send.click();
        await expect(page.getByText('Mobile reply rendered.')).toBeVisible();
    });

    test('notes create modal fits the viewport', async ({
        authedPage: page,
    }) => {
        await page.goto('/notes');
        await waitForHydration(page);
        await page.getByRole('button', { name: 'New Note' }).first().click();

        const title = page.getByPlaceholder('Note title');
        await expect(title).toBeVisible();
        const box = await title.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

        await title.fill('Phone note');
        await page
            .getByPlaceholder('Write something worth remembering')
            .fill('Written at 390px wide.');
        await page.getByRole('button', { name: 'Create note' }).click();
        await expect(
            page.getByRole('heading', { name: 'Phone note' }),
        ).toBeVisible();
    });
});

test.describe('touch affordances', () => {
    // isMobile/hasTouch device emulation is Chromium-only; it is also what
    // makes the (pointer: coarse) media query match.
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'touch emulation requires chromium',
    );
    test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true, isMobile: true });

    test('delete thread is visible and tappable without hover', async ({
        authedPage: page,
    }) => {
        await createThreadViaApi(page.context());
        await page.goto('/chat');
        await waitForHydration(page);

        expect(
            await page.evaluate(
                () => window.matchMedia('(pointer: coarse)').matches,
            ),
        ).toBe(true);

        const deleteButton = page
            .getByRole('button', { name: 'Delete thread' })
            .first();
        // Visible at full opacity with no hover: the regression this guards
        // is the hover-only `opacity-0 group-hover:opacity-100` affordance.
        await expect(deleteButton).toBeVisible();
        await expect(deleteButton).toHaveCSS('opacity', '1');

        await deleteButton.tap();
        const dialog = page.getByRole('alertdialog');
        await expect(
            dialog.getByRole('heading', { name: 'Delete thread' }),
        ).toBeVisible();
        await dialog.getByRole('button', { name: 'Delete' }).tap();

        await expect(page.getByText('No conversations yet')).toBeVisible();
    });
});
