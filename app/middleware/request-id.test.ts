import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { requestIdContext } from '~/context';
import { log } from '~/lib/logger.server';
import {
    REQUEST_ID_HEADER,
    requestIdMiddleware,
    resolveRequestId,
} from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function run(
    headers: Record<string, string>,
    handler: () => Response = () => new Response('ok'),
) {
    const context = new RouterContextProvider();
    const request = new Request('http://localhost/dashboard', { headers });
    const response = (await requestIdMiddleware(
        { request, context, params: {}, url: new URL(request.url) } as never,
        async () => handler(),
    )) as Response;
    return { response, requestId: context.get(requestIdContext) };
}

describe('resolveRequestId', () => {
    it('reuses a well-formed incoming id', () => {
        expect(resolveRequestId('abc-123_DEF.4')).toBe('abc-123_DEF.4');
    });

    it('mints a UUID when the header is missing or unsafe', () => {
        expect(resolveRequestId(null)).toMatch(UUID);
        expect(resolveRequestId('bad id\n{"level":"error"}')).toMatch(UUID);
        expect(resolveRequestId('x'.repeat(129))).toMatch(UUID);
    });
});

describe('requestIdMiddleware', () => {
    afterEach(() => vi.restoreAllMocks());

    it('stores the id in context and echoes it on the response', async () => {
        const { response, requestId } = await run({});
        expect(requestId).toMatch(UUID);
        expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    });

    it('propagates an incoming x-request-id', async () => {
        const { response, requestId } = await run({
            [REQUEST_ID_HEADER]: 'edge-42',
        });
        expect(requestId).toBe('edge-42');
        expect(response.headers.get(REQUEST_ID_HEADER)).toBe('edge-42');
    });

    it('tags log lines emitted while handling the request', async () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await run({ [REQUEST_ID_HEADER]: 'edge-43' }, () => {
            log.info('loader_ran');
            return new Response('ok');
        });
        const payload = JSON.parse(spy.mock.calls[0][0] as string);
        expect(payload.requestId).toBe('edge-43');
    });

    it('handles responses with immutable headers', async () => {
        const { response } = await run({}, () =>
            Response.redirect('http://localhost/login', 302),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('http://localhost/login');
        expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID);
    });
});
