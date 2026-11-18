import { describe, expect, it } from 'vitest';

import { accessLogFields } from '~/lib/access-log';
import { REQUEST_ID_HEADER } from '~/middleware/request-id';

describe('accessLogFields', () => {
    it('logs method, path, status, duration, size, and request id', () => {
        const response = new Response('hello', {
            status: 201,
            headers: { 'content-length': '5', [REQUEST_ID_HEADER]: 'abc-123' },
        });

        expect(
            accessLogFields(
                new Request('http://localhost/notes', { method: 'POST' }),
                response,
                12.345,
            ),
        ).toEqual({
            method: 'POST',
            path: '/notes',
            status: 201,
            durationMs: 12.3,
            contentLength: 5,
            requestId: 'abc-123',
        });
    });

    it('drops the query string, which can carry reset tokens', () => {
        const fields = accessLogFields(
            new Request('http://localhost/reset-password?token=secret'),
            new Response(null),
            1,
        );

        expect(fields.path).toBe('/reset-password');
        expect(JSON.stringify(fields)).not.toContain('secret');
    });

    it('omits size and request id when the response has neither', () => {
        const fields = accessLogFields(
            new Request('http://localhost/'),
            new Response(null, { status: 404 }),
            0.04,
        );

        expect(fields).toEqual({
            method: 'GET',
            path: '/',
            status: 404,
            durationMs: 0,
        });
    });
});
