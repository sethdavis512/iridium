import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    APP_SLUG,
    AUTH_COOKIE_PREFIX,
    DEMO_EMAIL_DOMAIN,
    LOCAL_DATABASE_NAME,
} from '~/config';
import {
    isTemplateRemote,
    localDatabaseUrl,
    replaceLocalDatabaseName,
    setAppIdentity,
    setComposeIdentity,
    toDatabaseName,
    toDisplayName,
    toSlug,
} from './identity';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('toSlug', () => {
    it.each([
        ['Iridium', 'iridium'],
        ['my-app', 'my-app'],
        ['Acme Notes', 'acme-notes'],
        ['  --Acme__HQ--  ', 'acme-hq'],
        ['Café Crème!', 'cafe-creme'],
        ['42 Things', 'app-42-things'],
        ['', 'app'],
        ['!!!', 'app'],
    ])('%j -> %j', (name, slug) => {
        expect(toSlug(name)).toBe(slug);
    });

    it('caps the length without leaving a trailing hyphen', () => {
        const slug = toSlug(`${'a'.repeat(39)} tail`);
        expect(slug.length).toBeLessThanOrEqual(40);
        expect(slug).not.toMatch(/-$/);
    });
});

describe('toDisplayName', () => {
    it.each([
        ['my-app', 'My App'],
        ['iridium', 'Iridium'],
        ['acme_hq.web', 'Acme Hq Web'],
        ['Acme Notes', 'Acme Notes'],
        ['AcmeHQ', 'AcmeHQ'],
        ['  ', 'App'],
    ])('%j -> %j', (name, display) => {
        expect(toDisplayName(name)).toBe(display);
    });
});

describe('isTemplateRemote', () => {
    it.each([
        ['git@github.com:sethdavis512/iridium.git', true],
        ['https://github.com/sethdavis512/iridium', true],
        ['https://github.com/SethDavis512/Iridium.git\n', true],
        ['git@github.com:acme/iridium.git', false],
        ['git@github.com:sethdavis512/iridium-fork.git', false],
        ['https://gitlab.com/sethdavis512/iridium.git', false],
        ['', false],
    ])('%j -> %j', (url, expected) => {
        expect(isTemplateRemote(url)).toBe(expected);
    });
});

describe('toDatabaseName', () => {
    it('swaps hyphens for underscores', () => {
        expect(toDatabaseName('acme-notes')).toBe('acme_notes');
    });

    it('matches LOCAL_DATABASE_NAME in app/config.ts', () => {
        expect(toDatabaseName(APP_SLUG)).toBe(LOCAL_DATABASE_NAME);
    });
});

describe('setAppIdentity', () => {
    const source = read('app/config.ts');

    it('rewrites APP_NAME and APP_SLUG and nothing else', () => {
        const next = setAppIdentity(source, {
            name: 'Acme Notes',
            slug: 'acme-notes',
        });
        expect(next).toContain("export const APP_NAME = 'Acme Notes';");
        expect(next).toContain("export const APP_SLUG: string = 'acme-notes';");
        expect(next.split('\n').length).toBe(source.split('\n').length);
        expect(next).toContain('export const APP_TAGLINE');
    });

    it('uses double quotes for a name with an apostrophe, like Prettier', () => {
        const next = setAppIdentity(source, { name: "Seth's App", slug: 's' });
        expect(next).toContain(`export const APP_NAME = "Seth's App";`);
    });

    it('is repeatable', () => {
        const once = setAppIdentity(source, { name: 'A', slug: 'a' });
        const twice = setAppIdentity(once, { name: 'B', slug: 'b' });
        expect(twice).toContain("export const APP_NAME = 'B';");
        expect(twice).toContain("export const APP_SLUG: string = 'b';");
    });

    it('throws when a constant is missing', () => {
        expect(() =>
            setAppIdentity("export const APP_NAME = 'X';\n", {
                name: 'A',
                slug: 'a',
            }),
        ).toThrow(/APP_SLUG/);
    });
});

describe('setComposeIdentity', () => {
    const source = read('docker-compose.dev.yml');

    it('renames the Compose project and the app database only', () => {
        const next = setComposeIdentity(source, {
            slug: 'acme-notes',
            databaseName: 'acme_notes',
            previousDatabaseName: LOCAL_DATABASE_NAME,
        });
        expect(next).toMatch(/^name: acme-notes$/m);
        expect(next).toMatch(/^\s+POSTGRES_DB: acme_notes$/m);
        expect(next).toMatch(/^\s+POSTGRES_DB: voltagent$/m);
        expect(next).not.toMatch(
            new RegExp(`POSTGRES_DB: ${LOCAL_DATABASE_NAME}$`, 'm'),
        );
    });

    it('throws when the previous database name is not there', () => {
        expect(() =>
            setComposeIdentity(source, {
                slug: 'a',
                databaseName: 'a',
                previousDatabaseName: 'not_there',
            }),
        ).toThrow(/POSTGRES_DB: not_there/);
    });
});

describe('replaceLocalDatabaseName', () => {
    it('swaps the app database in every local URL', () => {
        const next = replaceLocalDatabaseName(
            read('.env.example'),
            LOCAL_DATABASE_NAME,
            'acme_notes',
        );
        expect(next).not.toContain(`5432/${LOCAL_DATABASE_NAME}`);
        expect(next.match(/5432\/acme_notes/g)).toHaveLength(2);
        expect(next).toContain('localhost:5433/voltagent');
    });

    it("rewrites prisma.config.ts's POSTGRES_PORT fallback", () => {
        const next = replaceLocalDatabaseName(
            read('prisma.config.ts'),
            LOCAL_DATABASE_NAME,
            'acme_notes',
        );
        expect(next).toContain('|| 5432}/acme_notes`');
        expect(next).not.toContain(`}/${LOCAL_DATABASE_NAME}\``);
    });

    it('follows the app database to the port setup picked', () => {
        const source =
            'DATABASE_URL="postgresql://postgres:postgres@localhost:5442/iridium"';
        expect(
            replaceLocalDatabaseName(source, 'iridium', 'acme', 5442),
        ).toContain('@localhost:5442/acme"');
        expect(replaceLocalDatabaseName(source, 'iridium', 'acme')).toBe(
            source,
        );
    });

    it('leaves other databases, ports, and hosts alone', () => {
        const source = [
            'postgresql://postgres:postgres@localhost:5432/iridium_test',
            'postgresql://postgres:postgres@localhost:5433/iridium',
            'postgresql://postgres:postgres@db.example.com:5432/iridium',
        ].join('\n');
        expect(replaceLocalDatabaseName(source, 'iridium', 'acme')).toBe(
            source,
        );
    });
});

// docker-compose.dev.yml, prisma.config.ts, and .env.example can't import
// app/config.ts, so `bun run setup` rewrites them. These checks catch a hand
// edit of APP_SLUG that forgot one of them.
describe('files that mirror APP_SLUG', () => {
    const url = localDatabaseUrl(LOCAL_DATABASE_NAME);

    it('docker-compose.dev.yml uses the slug and database name', () => {
        const compose = read('docker-compose.dev.yml');
        expect(compose).toMatch(new RegExp(`^name: ${APP_SLUG}$`, 'm'));
        expect(compose).toMatch(
            new RegExp(`^\\s+POSTGRES_DB: ${LOCAL_DATABASE_NAME}$`, 'm'),
        );
    });

    it('prisma.config.ts falls back to the local database', () => {
        expect(read('prisma.config.ts')).toMatch(
            new RegExp(
                String.raw`@localhost:\$\{[^}]*\}/${LOCAL_DATABASE_NAME}` + '`',
            ),
        );
    });

    it('.env.example points DATABASE_URL at the local database', () => {
        expect(read('.env.example')).toContain(`DATABASE_URL="${url}"`);
    });

    it('derives the demo email domain from the slug', () => {
        expect(DEMO_EMAIL_DOMAIN).toBe(`${APP_SLUG}.test`);
    });

    it.runIf(APP_SLUG === 'iridium')(
        "keeps Better Auth's default cookie prefix for the original app",
        () => {
            expect(AUTH_COOKIE_PREFIX).toBe('better-auth');
        },
    );

    it.skipIf(APP_SLUG === 'iridium')(
        'prefixes auth cookies with the slug',
        () => {
            expect(AUTH_COOKIE_PREFIX).toBe(APP_SLUG);
        },
    );
});
