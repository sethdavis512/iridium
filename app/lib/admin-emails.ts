/**
 * First-admin bootstrap (ADMIN_EMAILS). Pure so the promotion rule can be unit
 * tested without Better Auth or a database; auth.server.ts wires it into the
 * email-verification and sign-in hooks.
 */

/** Parse ADMIN_EMAILS: comma-separated, trimmed, lowercased, deduplicated. */
export function parseAdminEmails(value: string | undefined): string[] {
    if (!value) return [];
    const emails = value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    return [...new Set(emails)];
}

export type PromotionCandidate = {
    email: string;
    emailVerified: boolean;
    role?: string | null;
    banned?: boolean | null;
};

/**
 * Whether ADMIN_EMAILS should promote this user to ADMIN. Only verified
 * addresses qualify: sign-in isn't gated on verification, so promoting at
 * sign-up would hand ADMIN to whoever registers a listed address first.
 * Banned users and existing admins are left alone.
 */
export function shouldPromoteToAdmin(
    user: PromotionCandidate,
    adminEmails: readonly string[],
): boolean {
    if (!user.emailVerified || user.banned || user.role === 'ADMIN') {
        return false;
    }
    return adminEmails.includes(user.email.trim().toLowerCase());
}
