/**
 * Pure helpers behind `bun run setup` (tools/init.ts) that give a copy of the
 * template its own identity: app name, slug, local database, and Docker
 * Compose project. No Bun APIs or file I/O, so they can be unit tested.
 * Database host ports live in tools/ports.ts.
 */
import { DEFAULT_DEV_PORTS } from './ports';

/** Longest slug we emit; keeps derived names well under Postgres's 63 bytes. */
const MAX_SLUG_LENGTH = 40;

/**
 * Derive the kebab-case slug (lowercase letters, digits, hyphens, starting
 * with a letter) from a free-form app or folder name.
 */
export function toSlug(name: string): string {
    const slug = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, '');

    if (!slug) return 'app';
    return /^[a-z]/.test(slug) ? slug : `app-${slug}`;
}

/**
 * Turn a folder-style name ("my-app") into a display name ("My App"). Input
 * that already has capitals or spaces is treated as intentional and kept.
 */
export function toDisplayName(name: string): string {
    const trimmed = name.trim();
    if (/[A-Z\s]/.test(trimmed)) return trimmed;

    const words = trimmed.split(/[-_.]+/).filter(Boolean);
    if (words.length === 0) return 'App';
    return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** The GitHub repository this template is published from. */
export const TEMPLATE_REPO = 'sethdavis512/iridium';

/**
 * Whether a git remote URL (SSH or HTTPS) points at the template repository,
 * so a copy's pushes and PRs would land on the template instead of the copy.
 */
export function isTemplateRemote(
    url: string,
    templateRepo: string = TEMPLATE_REPO,
): boolean {
    const repo = url
        .trim()
        .match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
    return repo?.toLowerCase() === templateRepo.toLowerCase();
}

/** Mirrors LOCAL_DATABASE_NAME in app/config.ts. */
export function toDatabaseName(slug: string): string {
    return slug.replaceAll('-', '_');
}

/** The docker-compose.dev.yml app database URL for a given database name. */
export function localDatabaseUrl(
    databaseName: string,
    port: number = DEFAULT_DEV_PORTS.app,
): string {
    return `postgresql://postgres:postgres@localhost:${port}/${databaseName}`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A TS string literal in the quote style Prettier would pick. */
function tsString(value: string): string {
    if (value.includes("'") && !value.includes('"')) return `"${value}"`;
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Replace the first match (the replacement is literal, no `$` patterns). */
function replaceOrThrow(
    source: string,
    pattern: RegExp,
    replacement: string | ((match: string, prefix: string) => string),
    what: string,
): string {
    if (!pattern.test(source)) throw new Error(`Could not find ${what}`);
    return source.replace(
        pattern,
        typeof replacement === 'string' ? () => replacement : replacement,
    );
}

const QUOTED = String.raw`(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")`;

/** Rewrite APP_NAME and APP_SLUG in app/config.ts. */
export function setAppIdentity(
    source: string,
    { name, slug }: { name: string; slug: string },
): string {
    const withName = replaceOrThrow(
        source,
        new RegExp(String.raw`^export const APP_NAME =\s*${QUOTED};`, 'm'),
        `export const APP_NAME = ${tsString(name)};`,
        'APP_NAME in app/config.ts',
    );
    return replaceOrThrow(
        withName,
        new RegExp(
            String.raw`^export const APP_SLUG: string =\s*${QUOTED};`,
            'm',
        ),
        `export const APP_SLUG: string = ${tsString(slug)};`,
        'APP_SLUG in app/config.ts',
    );
}

/**
 * Point docker-compose.dev.yml at the new identity: the Compose project name
 * (which namespaces containers and volumes) and the app database name. The
 * VoltAgent database keeps its generic name; it lives in the project's own
 * volume.
 */
export function setComposeIdentity(
    source: string,
    {
        slug,
        databaseName,
        previousDatabaseName,
    }: { slug: string; databaseName: string; previousDatabaseName: string },
): string {
    const withName = replaceOrThrow(
        source,
        /^name: .*$/m,
        `name: ${slug}`,
        'the top-level `name:` in docker-compose.dev.yml',
    );
    return replaceOrThrow(
        withName,
        new RegExp(
            String.raw`^(\s+POSTGRES_DB: )${escapeRegExp(previousDatabaseName)}$`,
            'm',
        ),
        (_match, prefix) => `${prefix}${databaseName}`,
        `POSTGRES_DB: ${previousDatabaseName} in docker-compose.dev.yml`,
    );
}

/**
 * Swap the database name in every local app database URL in a file, leaving
 * other hosts, ports, and databases alone. The port is the app database's
 * host port (5432 unless setup moved it) or a template-literal interpolation,
 * as in prisma.config.ts's POSTGRES_PORT fallback. Used for prisma.config.ts,
 * .env.example, and an existing .env.
 */
export function replaceLocalDatabaseName(
    source: string,
    previous: string,
    next: string,
    port: number = DEFAULT_DEV_PORTS.app,
): string {
    return source.replace(
        new RegExp(
            String.raw`(@localhost:(?:${port}|\$\{[^}]*\})/)${escapeRegExp(previous)}(?![\w-])`,
            'g',
        ),
        `$1${next}`,
    );
}
