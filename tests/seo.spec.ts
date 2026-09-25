import { APP_NAME } from '~/config';
import { test, expect } from './fixtures';

test.describe('SEO', () => {
    test('serves robots.txt', async ({ page }) => {
        const response = await page.request.get('/robots.txt');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/plain');

        const body = await response.text();
        expect(body).toContain('User-agent: *');
        expect(body).toContain('Sitemap:');
    });

    test('serves sitemap.xml with public routes', async ({ page }) => {
        const response = await page.request.get('/sitemap.xml');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/xml');

        const body = await response.text();
        expect(body).toContain('<urlset');
        expect(body).toContain('/login');
    });

    test('landing page has Open Graph tags', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
            'content',
            APP_NAME,
        );
        await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
            'content',
            'summary',
        );
    });
});
