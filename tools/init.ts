/**
 * One-command setup for a fresh clone:
 *
 *   bun tools/init.ts            # interactive
 *   bun run setup                # same thing
 *   bun tools/init.ts --non-interactive --name my-app
 *
 * Renames the package, writes .env from .env.example with a generated
 * BETTER_AUTH_SECRET, starts the Docker databases, applies migrations,
 * and seeds demo users.
 */
import { $, file, sleep, write } from 'bun';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirm, input, password } from '@inquirer/prompts';

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

// 1. Project name -> package.json
const defaultName = basename(root);
const projectName = nonInteractive
    ? (argValue('--name') ?? defaultName)
    : await input({ message: 'Project name', default: defaultName });

const packageJsonPath = join(root, 'package.json');
const packageJson = await file(packageJsonPath).json();

if (packageJson.name !== projectName) {
    packageJson.name = projectName;
    await write(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n');
    step(`Renamed package to "${projectName}"`);
    console.log(
        '  (App branding lives in app/components and app/routes; rename "Iridium" there when you are ready.)',
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
    if (!writeEnv) step('Keeping existing .env');
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
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/iridium',
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
await $`docker compose -f docker-compose.dev.yml up -d`.cwd(root);

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

console.log(`
✓ ${projectName} is ready.

  Start the app:   bun run dev
  Then sign in:    alice@iridium.dev / password123
  Admin account:   admin@iridium.dev / password123

  Docs: README.md and docs/adding-a-feature.md
`);
