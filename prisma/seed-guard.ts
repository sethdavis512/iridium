/**
 * The seed creates demo accounts with a known password, including an ADMIN,
 * so it must never run against production by accident. Pure so the rule can
 * be unit tested; prisma/seed.ts calls it before touching the database.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why seeding should be refused, or null when it may proceed. `force`
 * (the `--force` flag) overrides every check.
 */
export function seedRefusalReason({
    nodeEnv,
    databaseUrl,
    force,
}: {
    nodeEnv: string | undefined;
    databaseUrl: string;
    force: boolean;
}): string | null {
    if (force) return null;

    if (nodeEnv === 'production') {
        return 'NODE_ENV is "production"';
    }

    let host: string;
    try {
        host = new URL(databaseUrl).hostname;
    } catch {
        return 'DATABASE_URL is not a valid URL';
    }
    if (!LOCAL_HOSTS.has(host)) {
        return `the database host "${host}" is not localhost`;
    }

    return null;
}
