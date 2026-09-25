import { describe, expect, it } from 'vitest';
import { parseAdminEmails, shouldPromoteToAdmin } from './admin-emails';

describe('parseAdminEmails', () => {
    it('returns an empty list when unset or blank', () => {
        expect(parseAdminEmails(undefined)).toEqual([]);
        expect(parseAdminEmails('')).toEqual([]);
        expect(parseAdminEmails(' , ,')).toEqual([]);
    });

    it('trims, lowercases, and deduplicates', () => {
        expect(
            parseAdminEmails(
                ' Owner@Example.com, ops@example.com,owner@example.com ',
            ),
        ).toEqual(['owner@example.com', 'ops@example.com']);
    });
});

describe('shouldPromoteToAdmin', () => {
    const admins = ['owner@example.com'];
    const verified = {
        email: 'owner@example.com',
        emailVerified: true,
        role: 'USER',
        banned: false,
    };

    it('promotes a verified listed user', () => {
        expect(shouldPromoteToAdmin(verified, admins)).toBe(true);
    });

    it('matches the email case-insensitively', () => {
        expect(
            shouldPromoteToAdmin(
                { ...verified, email: 'Owner@Example.COM' },
                admins,
            ),
        ).toBe(true);
    });

    it('never promotes an unverified user, even when listed', () => {
        expect(
            shouldPromoteToAdmin({ ...verified, emailVerified: false }, admins),
        ).toBe(false);
    });

    it('ignores users who are not listed', () => {
        expect(
            shouldPromoteToAdmin(
                { ...verified, email: 'someone@example.com' },
                admins,
            ),
        ).toBe(false);
    });

    it('does nothing when ADMIN_EMAILS is empty', () => {
        expect(shouldPromoteToAdmin(verified, [])).toBe(false);
    });

    it('skips users who are already ADMIN', () => {
        expect(
            shouldPromoteToAdmin({ ...verified, role: 'ADMIN' }, admins),
        ).toBe(false);
    });

    it('skips banned users', () => {
        expect(
            shouldPromoteToAdmin({ ...verified, banned: true }, admins),
        ).toBe(false);
    });

    it('treats a missing role as promotable', () => {
        expect(
            shouldPromoteToAdmin(
                { email: 'owner@example.com', emailVerified: true },
                admins,
            ),
        ).toBe(true);
    });
});
