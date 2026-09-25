import type {
    Browser,
    BrowserContext,
    Locator,
    Page,
    TestInfo,
} from '@playwright/test';

import { waitForHydration } from '../fixtures';

/** Where snap() writes the gallery PNGs. Gitignored via /test-results/. */
export const VISUAL_DIR = 'test-results/visual-inventory';

export const MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * Fresh browser context authenticated as a new user whose display name is the
 * fixed string "Visual Tester". fixtures' createFreshUser embeds the tag in
 * the name, which renders in page chrome and would vary shot-to-shot.
 * Caller closes the returned context.
 */
export async function createVisualContext(
    browser: Browser,
    baseURL: string,
    tag: string | number = 'x',
): Promise<BrowserContext> {
    const context = await browser.newContext({ baseURL });

    const res = await context.request.post('/api/auth/sign-up/email', {
        headers: { Origin: baseURL },
        data: {
            name: 'Visual Tester',
            // Random UUID for the same reason as fixtures' createFreshUser.
            email: `visual-${tag}-${crypto.randomUUID()}@iridium.test`,
            password: 'password123',
        },
    });
    if (!res.ok()) {
        throw new Error(
            `Visual-user sign-up failed (${res.status()}): ${await res.text()}`,
        );
    }

    return context;
}

/**
 * Pin the theme cookie via the /api/theme action (the cookie is httpOnly, so
 * it cannot be planted with addCookies). Never leave the "system" default in
 * visual tests: it omits data-theme and tracks the machine's
 * prefers-color-scheme.
 */
export async function setTheme(
    context: BrowserContext,
    theme: 'light' | 'dark',
) {
    const res = await context.request.post('/api/theme', { form: { theme } });
    if (!res.ok()) {
        throw new Error(`Theme switch failed (${res.status()})`);
    }
}

/**
 * Wait until the page is visually stable: hydrated, web fonts loaded, and the
 * network quiet (no in-flight fetches repainting lists).
 */
export async function settle(page: Page) {
    await waitForHydration(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
}

/**
 * Locators hidden under pink boxes in every shot. <time> covers FormattedDate
 * (renders today's locale date, so unmasked shots change daily). Extra
 * per-shot masks (e.g. the account email on /settings) are appended by the
 * caller.
 */
export function masks(page: Page, extra: Locator[] = []): Locator[] {
    return [page.locator('time'), ...extra];
}

/**
 * Capture one gallery entry: a full-page PNG under VISUAL_DIR plus an
 * attachment so the Playwright HTML report doubles as a browsable gallery.
 * Options mirror toHaveScreenshot defaults so promoting the inventory to
 * pixel-diff regression later is a one-line change per call site.
 */
export async function snap(
    page: Page,
    testInfo: TestInfo,
    name: string,
    { extraMasks = [] as Locator[], fullPage = true } = {},
) {
    const path = `${VISUAL_DIR}/${name}.png`;
    await page.screenshot({
        path,
        fullPage,
        mask: masks(page, extraMasks),
        animations: 'disabled',
        caret: 'hide',
    });
    await testInfo.attach(name, { path, contentType: 'image/png' });
}
