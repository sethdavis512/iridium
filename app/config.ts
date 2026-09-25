/**
 * Central app branding. Change these to rebrand a derived app in one place
 * instead of grepping "Iridium" across routes, components, emails, and meta
 * tags. Client-safe (no server imports) so it can be used anywhere.
 */
export const APP_NAME = 'Iridium';

/** Footer/marketing tagline, rendered after the app name. */
export const APP_TAGLINE = 'Go build. Be bold.';

/**
 * Machine-safe identity for this copy of the template: lowercase letters,
 * digits, and hyphens, starting with a letter. `bun run setup` derives it from
 * the app name. It namespaces everything that would otherwise collide between
 * two copies on one machine: cookie names, the local database, the Docker
 * Compose project, and the demo users' emails. Typed as `string` so the
 * comparison in AUTH_COOKIE_PREFIX still typechecks after a rename.
 *
 * docker-compose.dev.yml, prisma.config.ts, and .env.example can't import this
 * file, so `bun run setup` rewrites them too; tools/identity.test.ts fails if
 * they drift. Change it by hand only together with those files.
 */
export const APP_SLUG: string = 'iridium';

/** Local Postgres database name: the slug with hyphens as underscores. */
export const LOCAL_DATABASE_NAME = APP_SLUG.replaceAll('-', '_');

/**
 * Prefix for Better Auth's cookies (`<prefix>.session_token`, ...), so two
 * copies on localhost don't overwrite each other's sessions. The original
 * Iridium app keeps Better Auth's default prefix because renaming the session
 * cookie signs every existing user out once.
 */
export const AUTH_COOKIE_PREFIX =
    APP_SLUG === 'iridium' ? 'better-auth' : APP_SLUG;

/** Email domain of the demo users (prisma/seed.ts) and the E2E seed logins. */
export const DEMO_EMAIL_DOMAIN = `${APP_SLUG}.dev`;
