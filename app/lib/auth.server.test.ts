import { describe, expect, it, vi } from 'vitest';
import { getIP } from 'better-auth/api';

vi.mock('~/lib/prisma', () => ({ default: {} }));
vi.mock('~/lib/jobs.server', () => ({ enqueueAuthEmail: vi.fn() }));

import { auth } from './auth.server';

function signInRequest(headers: Record<string, string>) {
    return new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers,
    });
}

describe('auth client IP resolution', () => {
    it('keys on X-Real-IP, ignoring a forged X-Forwarded-For', () => {
        const request = signInRequest({
            'x-real-ip': '198.51.100.20',
            'x-forwarded-for': '203.0.113.7',
        });
        expect(getIP(request, auth.options)).toBe('198.51.100.20');
    });

    it('does not give rotating X-Forwarded-For values their own buckets', () => {
        const first = getIP(
            signInRequest({ 'x-forwarded-for': '203.0.113.7' }),
            auth.options,
        );
        const second = getIP(
            signInRequest({ 'x-forwarded-for': '203.0.113.8' }),
            auth.options,
        );
        // No X-Real-IP (local dev, E2E): the dev/test fallback applies.
        expect(first).toBe('127.0.0.1');
        expect(second).toBe(first);
    });
});
