import { test, expect } from './fixtures';

test.describe('Healthcheck', () => {
    test('reports ok when both databases are reachable', async ({
        request,
    }) => {
        const res = await request.get('/healthcheck');
        expect(res.status()).toBe(200);
        expect(res.headers()['content-type']).toContain('application/json');
        await expect(res.json()).resolves.toEqual({ status: 'ok' });
    });
});

test.describe('Request id', () => {
    test('echoes an incoming x-request-id', async ({ request }) => {
        const res = await request.get('/healthcheck', {
            headers: { 'x-request-id': 'e2e-probe-1' },
        });
        expect(res.headers()['x-request-id']).toBe('e2e-probe-1');
    });

    test('assigns one to document responses', async ({ request }) => {
        const res = await request.get('/');
        expect(res.status()).toBe(200);
        expect(res.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
});
