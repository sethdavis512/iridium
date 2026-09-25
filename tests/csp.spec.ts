import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/** Record CSP violations from both the console and the DOM event. */
async function watchCsp(page: Page) {
    const consoleViolations: string[] = [];
    page.on('console', (msg) => {
        if (/Content Security Policy/i.test(msg.text())) {
            consoleViolations.push(msg.text());
        }
    });
    await page.addInitScript(() => {
        const w = window as unknown as { __csp: string[] };
        w.__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => {
            w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
        });
    });
    return async () => [
        ...consoleViolations,
        ...(await page.evaluate(
            () => (window as unknown as { __csp: string[] }).__csp,
        )),
    ];
}

async function loadAndCheck(page: Page, path: string) {
    const violations = await watchCsp(page);
    await page.goto(path);
    await expect(page.locator('html[data-hydrated]')).toBeAttached();
    expect(await violations()).toEqual([]);
}

test.describe('Content Security Policy', () => {
    test('script-src uses a fresh nonce instead of unsafe-inline', async ({
        request,
    }) => {
        const first = await request.get('/');
        const second = await request.get('/');

        const csp = first.headers()['content-security-policy'];
        const scriptSrc = csp
            .split(';')
            .map((d) => d.trim())
            .find((d) => d.startsWith('script-src'));
        expect(scriptSrc).toBeDefined();
        expect(scriptSrc).not.toContain('unsafe-inline');

        const nonce = scriptSrc!.match(/'nonce-([^']+)'/)?.[1];
        expect(nonce).toBeTruthy();
        expect(second.headers()['content-security-policy']).not.toContain(
            nonce!,
        );

        // Every inline script in the document carries this response's nonce.
        const html = await first.text();
        const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/g)]
            .map((m) => m[1])
            .filter((attrs) => !/\bsrc=/.test(attrs));
        expect(inlineScripts.length).toBeGreaterThan(0);
        for (const attrs of inlineScripts) {
            expect(attrs).toContain(`nonce="${nonce}"`);
        }
    });

    test('landing page loads without CSP violations', async ({ page }) => {
        await loadAndCheck(page, '/');
    });

    test('login page loads without CSP violations', async ({ page }) => {
        await loadAndCheck(page, '/login');
    });

    test('dashboard loads without CSP violations', async ({ authedPage }) => {
        await loadAndCheck(authedPage, '/dashboard');
    });

    test('pre-paint theme script runs before any bundle loads', async ({
        browser,
    }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        const page = await context.newPage();
        const violations = await watchCsp(page);
        // Block every external script so React never hydrates: only the
        // inline, nonce-carrying theme script can add .dark.
        await page.route('**/*', (route) =>
            route.request().resourceType() === 'script'
                ? route.abort()
                : route.continue(),
        );

        await page.goto('/');
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        expect(await violations()).toEqual([]);
        await context.close();
    });
});
