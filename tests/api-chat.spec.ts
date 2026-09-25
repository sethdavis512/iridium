import {
    test,
    expect,
    createAuthedContext,
    createThreadViaApi,
} from './fixtures';

/**
 * API-level checks for the chat endpoint. These exercise the auth/ownership
 * boundary that runs before any tokens are spent, so no AI service is needed.
 */

function validBody(id = 'some-thread') {
    return {
        id,
        messages: [
            { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
        ],
    };
}

test.describe('POST /api/chat', () => {
    test('rejects write methods other than POST with 405', async ({
        request,
    }) => {
        expect((await request.delete('/api/chat')).status()).toBe(405);
        expect(
            (await request.fetch('/api/chat', { method: 'PUT' })).status(),
        ).toBe(405);
    });

    test('rejects GET (no loader on the endpoint)', async ({ request }) => {
        const res = await request.get('/api/chat');
        expect(res.ok()).toBeFalsy();
        expect(res.status()).toBe(400);
    });

    test('returns 401 when unauthenticated', async ({ request }) => {
        const res = await request.post('/api/chat', { data: validBody() });
        expect(res.status()).toBe(401);
    });

    test('checks auth before validating the body', async ({ request }) => {
        const res = await request.post('/api/chat', { data: { nope: true } });
        expect(res.status()).toBe(401);
    });

    test('returns 413 for a body over 1 MB, before auth', async ({
        request,
    }) => {
        const res = await request.post('/api/chat', {
            data: { id: 'x', padding: 'x'.repeat(1_100_000) },
        });
        expect(res.status()).toBe(413);
    });

    test('returns 400 for an invalid request body', async ({
        browser,
        baseURL,
    }) => {
        const context = await createAuthedContext(browser, baseURL!, 'chat400');
        try {
            const res = await context.request.post('/api/chat', {
                data: { nope: true },
            });
            expect(res.status()).toBe(400);
        } finally {
            await context.close();
        }
    });

    test('returns 404 for a thread that does not exist', async ({
        browser,
        baseURL,
    }) => {
        const context = await createAuthedContext(browser, baseURL!, 'chat404');
        try {
            const res = await context.request.post('/api/chat', {
                data: validBody('thread-does-not-exist'),
            });
            expect(res.status()).toBe(404);
        } finally {
            await context.close();
        }
    });

    test("returns 403 for another user's thread", async ({
        browser,
        baseURL,
    }) => {
        const owner = await createAuthedContext(browser, baseURL!, 'owner');
        const attacker = await createAuthedContext(
            browser,
            baseURL!,
            'attacker',
        );
        try {
            const threadId = await createThreadViaApi(owner);

            const res = await attacker.request.post('/api/chat', {
                data: validBody(threadId),
            });
            expect(res.status()).toBe(403);
        } finally {
            await owner.close();
            await attacker.close();
        }
    });
});
