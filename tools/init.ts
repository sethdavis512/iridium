/**
 * One-command setup for a fresh copy of the template:
 *
 *   bun tools/init.ts            # interactive
 *   bun run setup                # same thing
 *   bun tools/init.ts --non-interactive --name "My App" [--detach-origin]
 *
 * Gives the copy its own identity: derives a slug from the app name and
 * writes it to package.json, APP_NAME/APP_SLUG in app/config.ts (cookie
 * names and demo emails follow the slug), the Docker Compose project and
 * database name, and the local database URLs. When another project already
 * holds the database host ports (5432/5433), it picks a free pair (asking
 * first, automatic with --non-interactive). Then writes .env from
 * .env.example with a generated BETTER_AUTH_SECRET and those ports, starts
 * the Docker databases, applies migrations, seeds demo users, and prints
 * what is left to rebrand by hand.
 */
import { $, file, sleep, write } from 'bun';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirm, input, password } from '@inquirer/prompts';
import { parse } from 'dotenv';
import { APP_NAME, APP_SLUG } from '../app/config';
import {
    isTemplateRemote,
    localDatabaseUrl,
    replaceLocalDatabaseName,
    setAppIdentity,
    setComposeIdentity,
    TEMPLATE_REPO,
    toDatabaseName,
    toDisplayName,
    toSlug,
} from './identity';
import {
    configuredDevPorts,
    findFreeDevPorts,
    isPortFree,
    parsePort,
    setEnvDevPorts,
    voltagentDatabaseUrl,
} from './ports';

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

    // A clone (rather than "Use this template") still has the template as
    // origin, so pushes and agent-opened PRs would target the template.
    const origin = await $`git remote get-url origin`
        .cwd(root)
        .quiet()
        .nothrow();
    const originUrl = origin.exitCode === 0 ? origin.stdout.toString() : '';
    if (isTemplateRemote(originUrl)) {
        const detach = nonInteractive
            ? args.includes('--detach-origin')
            : await confirm({
                  message: `git origin still points at the template (${TEMPLATE_REPO}). Remove it?`,
                  default: true,
              });
        if (detach) {
            await $`git remote remove origin`.cwd(root);
            step(
                'Removed the template origin. Add yours with: git remote add origin <url>',
            );
        } else {
            console.warn(
                `  ! origin still points at ${TEMPLATE_REPO}; pushes and PRs will go there. Run: git remote remove origin`,
            );
        }
    }
}

// 2. Database host ports. Every copy defaults to 5432/5433, so another
// project's databases (the original Iridium, another copy, a native Postgres)
// may hold them. This project's own running containers don't count, so a
// re-run keeps its ports.
async function publishedPort(service: string): Promise<number | undefined> {
    const result =
        await $`docker compose -f docker-compose.dev.yml port ${service} 5432`
            .cwd(root)
            .quiet()
            .nothrow();
    if (result.exitCode !== 0) return undefined;
    return parsePort(result.stdout.toString().trim().split(':').pop());
}

const currentPorts = configuredDevPorts(process.env);
const taken: number[] = [];
for (const [service, port] of [
    ['postgres', currentPorts.app],
    ['postgres-voltagent', currentPorts.voltagent],
] as const) {
    if (!(await isPortFree(port)) && (await publishedPort(service)) !== port) {
        taken.push(port);
    }
}

let ports = currentPorts;
if (taken.length > 0) {
    const inUse =
        taken.length > 1
            ? `Ports ${taken.join(' and ')} are already in use`
            : `Port ${taken[0]} is already in use`;
    const free = await findFreeDevPorts(isPortFree);
    const move =
        free !== undefined &&
        (nonInteractive ||
            (await confirm({
                message: `${inUse} (another project's databases?). Use ${free.app}/${free.voltagent} for this copy instead?`,
                default: true,
            })));
    if (move) {
        ports = free;
        step(
            `${inUse}; this copy's databases will use ${ports.app}/${ports.voltagent}`,
        );
    } else {
        console.warn(
            `  ! ${inUse}. Stop the other project's databases, or set POSTGRES_PORT / VOLTAGENT_POSTGRES_PORT and the matching URLs in .env.`,
        );
    }
}

// 3. Write .env from .env.example
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
                currentPorts.app,
            ),
        );
        if (repointed) {
            console.log(
                `  Pointed its local DATABASE_URL at "${databaseName}".`,
            );
        }
        if (ports !== currentPorts) {
            await rewrite('.env', (source) =>
                setEnvDevPorts(source, currentPorts, ports),
            );
            console.log(
                `  Moved its database ports and local URLs to ${ports.app}/${ports.voltagent}.`,
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
        DATABASE_URL: localDatabaseUrl(databaseName, ports.app),
        VOLTAGENT_DATABASE_URL: voltagentDatabaseUrl(ports.voltagent),
        POSTGRES_PORT: String(ports.app),
        VOLTAGENT_POSTGRES_PORT: String(ports.voltagent),
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

// Bun loaded the previous .env into process.env at startup, and inherited
// values beat the file for Compose (POSTGRES_PORT) and Prisma (DATABASE_URL),
// so hand the commands below what .env says now.
const finalEnv = parse(await file(envPath).text());
for (const key of [
    'DATABASE_URL',
    'VOLTAGENT_DATABASE_URL',
    'POSTGRES_PORT',
    'VOLTAGENT_POSTGRES_PORT',
]) {
    if (finalEnv[key] !== undefined) process.env[key] = finalEnv[key];
}

// 4. Docker databases
step('Starting Postgres containers');
const up = await $`docker compose -f docker-compose.dev.yml up -d`
    .cwd(root)
    .nothrow();
if (up.exitCode !== 0) {
    console.error(
        `✗ docker compose up failed. If another project holds port ${ports.app} or ${ports.voltagent}, stop it (docker compose -p <its project name> stop) or run setup again to pick free ports.`,
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

// 5. Migrate + generate + seed
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
  - Placeholder landing copy: app/routes/landing.tsx; repo link: APP_REPO_URL in app/config.ts
  - Tagline: APP_TAGLINE in app/config.ts
  - Titles and descriptions: README.md and CLAUDE.md
  - Demo users with a known password: prisma/seed.ts (it refuses non-local databases)

  Production: bun run provision, then ADMIN_EMAILS for the first admin (README.md#railway)
  Docs: README.md and docs/adding-a-feature.md
`);
