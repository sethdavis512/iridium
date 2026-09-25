/**
 * One-command setup for a fresh copy of the template:
 *
 *   bun tools/init.ts            # interactive
 *   bun run setup                # same thing
 *   bun tools/init.ts --non-interactive --name "My App"
 *
 * Gives the copy its own identity: derives a slug from the app name and
 * writes it to package.json, APP_NAME/APP_SLUG in app/config.ts (cookie
 * names and demo emails follow the slug), the Docker Compose project and
 * database name, and the local database URLs. Then writes .env from
 * .env.example with a generated BETTER_AUTH_SECRET, starts the Docker
 * databases, applies migrations, seeds demo users, and prints what is left
 * to rebrand by hand.
 */
import { $, file, sleep, write } from 'bun';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirm, input, password } from '@inquirer/prompts';
import { APP_NAME, APP_SLUG } from '../app/config';
import {
    localDatabaseUrl,
    replaceLocalDatabaseName,
    setAppIdentity,
    setComposeIdentity,
    toDatabaseName,
    toDisplayName,
    toSlug,
} from './identity';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nonInteractive = args.includes('--non-interactive');

function argValue(flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : undefined;
}

function step(message: string) {
    console.log(`\n› ${message}`);
}

/**
 * Apply a text transform to a repo file. Returns whether it changed. A
 * transform that can't find what it expects warns instead of aborting setup.
 */
async function rewrite(
    relativePath: string,
    transform: (source: string) => string,
): Promise<boolean> {
    const path = join(root, relativePath);
    if (!existsSync(path)) return false;

    const source = await file(path).text();
    try {
        const next = transform(source);
        if (next === source) return false;
        await write(path, next);
        return true;
    } catch (error) {
        console.warn(
            `  ! ${relativePath}: ${(error as Error).message}. Update it by hand.`,
        );
        return false;
    }
}

// 1. Identity: app name -> slug -> package, config, Compose, database URLs.
// A folder-style answer ("my-app") becomes a display name ("My App").
const defaultName = toDisplayName(basename(root));
const appName = toDisplayName(
    nonInteractive
        ? (argValue('--name') ?? defaultName)
        : await input({ message: 'App name', default: defaultName }),
);
const slug = toSlug(appName);
const databaseName = toDatabaseName(slug);
const previousDatabaseName = toDatabaseName(APP_SLUG);

const packageJsonPath = join(root, 'package.json');
const packageJson = await file(packageJsonPath).json();

if (packageJson.name !== slug) {
    packageJson.name = slug;
    await write(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n');
    step(`Renamed package to "${slug}"`);
}

if (appName !== APP_NAME || slug !== APP_SLUG) {
    await rewrite('app/config.ts', (source) =>
        setAppIdentity(source, { name: appName, slug }),
    );
    step(`Set APP_NAME to "${appName}" and APP_SLUG to "${slug}"`);
}

if (slug !== APP_SLUG) {
    await rewrite('docker-compose.dev.yml', (source) =>
        setComposeIdentity(source, {
            slug,
            databaseName,
            previousDatabaseName,
        }),
    );
    for (const path of ['prisma.config.ts', '.env.example']) {
        await rewrite(path, (source) =>
            replaceLocalDatabaseName(
                source,
                previousDatabaseName,
                databaseName,
            ),
        );
    }
    console.log(
        `  Docker project "${slug}" and database "${databaseName}", so this copy never shares containers, volumes, or cookies with another one.`,
    );
}

// 2. Write .env from .env.example
const envPath = join(root, '.env');
const envExamplePath = join(root, '.env.example');

let writeEnv = true;
if (existsSync(envPath)) {
    writeEnv = nonInteractive
        ? false
        : await confirm({
              message: '.env already exists. Overwrite it?',
              default: false,
          });
    if (!writeEnv) {
        step('Keeping existing .env');
        const repointed = await rewrite('.env', (source) =>
            replaceLocalDatabaseName(
                source,
                previousDatabaseName,
                databaseName,
            ),
        );
        if (repointed) {
            console.log(
                `  Pointed its local DATABASE_URL at "${databaseName}".`,
            );
        }
    }
}

if (writeEnv) {
    if (!existsSync(envExamplePath)) {
        console.error('✗ .env.example not found; cannot write .env');
        process.exit(1);
    }

    const anthropicKey = nonInteractive
        ? ''
        : await password({
              message: 'Anthropic API key (leave blank to fill in later)',
              mask: '*',
          });

    const values: Record<string, string> = {
        DATABASE_URL: localDatabaseUrl(databaseName),
        VOLTAGENT_DATABASE_URL:
            'postgresql://postgres:postgres@localhost:5433/voltagent',
        BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
        BETTER_AUTH_BASE_URL: 'http://localhost:5173',
        ANTHROPIC_API_KEY: anthropicKey || 'sk-ant-REPLACE-ME',
    };

    const example: string = await file(envExamplePath).text();
    const seen = new Set<string>();

    const lines = example.split('\n').map((line) => {
        const match = line.match(/^([A-Z0-9_]+)\s*=/);
        if (match && values[match[1]] !== undefined) {
            seen.add(match[1]);
            return `${match[1]}="${values[match[1]]}"`;
        }
        return line;
    });

    for (const [key, value] of Object.entries(values)) {
        if (!seen.has(key)) lines.push(`${key}="${value}"`);
    }

    await write(envPath, lines.join('\n').trimEnd() + '\n');
    step('Wrote .env with a generated BETTER_AUTH_SECRET');
    if (!anthropicKey) {
        console.log('  Remember to set ANTHROPIC_API_KEY before using chat.');
    }
}

// 3. Docker databases
step('Starting Postgres containers');
const up = await $`docker compose -f docker-compose.dev.yml up -d`
    .cwd(root)
    .nothrow();
if (up.exitCode !== 0) {
    console.error(
        '✗ docker compose up failed. If another project (the original Iridium, or another copy) holds ports 5432/5433, stop it first: docker compose -p <its project name> stop',
    );
    process.exit(1);
}

// Wait until both databases accept connections.
step('Waiting for databases to become healthy');
const services = ['postgres', 'postgres-voltagent'];
for (const service of services) {
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        const result =
            await $`docker compose -f docker-compose.dev.yml exec -T ${service} pg_isready -U postgres`
                .cwd(root)
                .quiet()
                .nothrow();
        if (result.exitCode === 0) {
            healthy = true;
            break;
        }
        await sleep(1_000);
    }
    if (!healthy) {
        console.error(`✗ ${service} did not become healthy in 30s`);
        process.exit(1);
    }
    console.log(`  ${service} ready`);
}

// 4. Migrate + generate + seed
step('Applying migrations');
await $`bunx --bun prisma migrate deploy`.cwd(root);

step('Generating Prisma client');
await $`bunx --bun prisma generate`.cwd(root);

step('Seeding demo users');
await $`bunx --bun prisma db seed`.cwd(root);

const demoDomain = `${slug}.dev`;

console.log(`
✓ ${appName} is ready.

  Start the app:   bun run dev
  Then sign in:    alice@${demoDomain} / password123
  Admin account:   admin@${demoDomain} / password123

  Left to rebrand by hand:
  - Favicon: public/favicon.ico
  - Landing copy and GitHub link: app/routes/landing.tsx
  - Tagline: APP_TAGLINE in app/config.ts
  - Titles and descriptions: README.md and CLAUDE.md
  - Demo users with a known password: prisma/seed.ts (it refuses non-local databases)

  Production: bun run provision, then ADMIN_EMAILS for the first admin (README.md#railway)
  Docs: README.md and docs/adding-a-feature.md
`);
