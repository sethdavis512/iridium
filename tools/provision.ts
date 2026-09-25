/**
 * Stand up a brand-new Railway project for this copy of the template:
 *
 *   bun run provision                  # interactive
 *   bun run provision --dry-run        # checks + plan, changes nothing
 *   bun run provision --non-interactive --name my-app [--workspace <id>]
 *
 * Flags: --name <project>, --workspace <id|name>, --service <name> (default
 * "web"), --branch <branch> (default: origin's default branch), --no-wait,
 * --force (provision even if .railway/app.json already points at this repo).
 *
 * Steps: writes .railway/app.json for this repo, creates and links the
 * Railway project, applies .railway/railway.ts (app service built from the
 * Dockerfile, both Postgres databases, Wait for CI), generates a Railway
 * domain, sets BETTER_AUTH_SECRET / BETTER_AUTH_BASE_URL and any optional
 * keys, redeploys, and waits for /healthcheck.
 *
 * Secrets go to Railway on stdin, never argv. Non-interactive optional keys
 * come from PROVISION_ANTHROPIC_API_KEY, PROVISION_RESEND_API_KEY, and
 * PROVISION_EMAIL_FROM, so a local .env is never pushed to production.
 */
import { $, file, sleep, write } from 'bun';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirm, input, password, select } from '@inquirer/prompts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appConfigPath = join(root, '.railway', 'app.json');
const args = process.argv.slice(2);
const nonInteractive = args.includes('--non-interactive');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const wait = !args.includes('--no-wait');

const HEALTH_TIMEOUT_MS = 20 * 60_000;

type AppConfig = {
    project: string;
    service: string;
    repo: string;
    branch: string;
    postgresImage?: string;
    voltagentPostgresImage?: string;
};

function argValue(flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : undefined;
}

function step(message: string) {
    console.log(`\n› ${message}`);
}

function fail(message: string): never {
    console.error(`\n✗ ${message}`);
    process.exit(1);
}

/** Runs a Railway-mutating action, or just describes it under --dry-run. */
async function mutate(description: string, action: () => Promise<void>) {
    if (dryRun) {
        console.log(`  [dry-run] ${description}`);
        return;
    }
    await action();
}

function parseGitHubRepo(url: string): string | undefined {
    return url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
}

/** Finds the first *.railway.app hostname anywhere in a JSON payload. */
function findRailwayDomain(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.railway\.app/i)?.[0];
    }
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) {
            const found = findRailwayDomain(child);
            if (found) return found;
        }
    }
    return undefined;
}

async function setVariable(service: string, key: string, value: string) {
    await mutate(`railway variable set ${key} --stdin (${service})`, () =>
        $`railway variable set ${key} --stdin --service ${service} --skip-deploys < ${Buffer.from(value)}`
            .cwd(root)
            .quiet()
            .then(() => console.log(`  set ${key}`)),
    );
}

// 1. Preflight: CLI, auth, GitHub remote, pushed branch.
step('Checking prerequisites');

if ((await $`railway --version`.quiet().nothrow()).exitCode !== 0) {
    fail(
        'Railway CLI not found. Install it (`brew install railway` or ' +
            '`npm i -g @railway/cli`), then run `railway login`.',
    );
}
if ((await $`railway config --help`.quiet().nothrow()).exitCode !== 0) {
    fail('Railway CLI is too old for `railway config`. Run `railway upgrade`.');
}

const whoami = await $`railway whoami --json`.quiet().nothrow();
if (whoami.exitCode !== 0)
    fail('Not logged in to Railway. Run `railway login`.');
const account = JSON.parse(whoami.stdout.toString()) as {
    email: string;
    workspaces: { id: string; name: string }[];
};
console.log(`  Railway account: ${account.email}`);

const remote = await $`git remote get-url origin`.cwd(root).quiet().nothrow();
const repo = parseGitHubRepo(remote.stdout.toString().trim());
if (!repo) {
    fail(
        'No GitHub `origin` remote. Railway deploys from GitHub: create the ' +
            'repo, `git remote add origin ...`, and push first.',
    );
}

const defaultBranch =
    (
        await $`git symbolic-ref --short refs/remotes/origin/HEAD`
            .cwd(root)
            .quiet()
            .nothrow()
            .text()
    )
        .trim()
        .replace(/^origin\//, '') || 'main';
const branch = argValue('--branch') ?? defaultBranch;

const onRemote = await $`git ls-remote --exit-code --heads origin ${branch}`
    .cwd(root)
    .quiet()
    .nothrow();
if (onRemote.exitCode !== 0) {
    fail(`Branch "${branch}" is not on origin. Push it before provisioning.`);
}
const unpushed = (
    await $`git rev-list --count origin/${branch}..HEAD`
        .cwd(root)
        .quiet()
        .nothrow()
        .text()
).trim();
if (unpushed && unpushed !== '0') {
    console.warn(
        `  ⚠ ${unpushed} local commit(s) not on origin/${branch}. Railway ` +
            'deploys what is on GitHub, so they will not be included.',
    );
}
console.log(`  GitHub source: ${repo}@${branch}`);

const current = (await file(appConfigPath).json()) as AppConfig;
if (current.repo === repo && !force) {
    fail(
        `.railway/app.json already points at ${repo} (Railway project ` +
            `"${current.project}"), so this checkout looks provisioned. Change ` +
            'infrastructure with `railway config plan` / `railway config ' +
            'apply`, or pass --force to create another project anyway.',
    );
}

const status = await $`railway status --json`.cwd(root).quiet().nothrow();
if (status.exitCode === 0) {
    const linked = JSON.parse(status.stdout.toString()) as { name: string };
    console.warn(
        `  ⚠ This directory is linked to Railway project "${linked.name}". ` +
            'Provisioning links it to the new project instead.',
    );
}

// 2. Inputs.
const packageJson = (await file(join(root, 'package.json')).json()) as {
    name: string;
};
const projectName =
    argValue('--name') ??
    (nonInteractive
        ? packageJson.name
        : await input({
              message: 'Railway project name',
              default: packageJson.name,
          }));
const serviceName = argValue('--service') ?? 'web';

let workspace = argValue('--workspace');
if (!workspace) {
    if (account.workspaces.length === 1) {
        workspace = account.workspaces[0].id;
    } else if (nonInteractive) {
        fail('Multiple Railway workspaces. Pass --workspace <id|name>.');
    } else {
        workspace = await select({
            message: 'Railway workspace',
            choices: account.workspaces.map((w) => ({
                name: w.name,
                value: w.id,
            })),
        });
    }
}

const optional: Record<string, string> = {};
if (nonInteractive) {
    for (const key of ['ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'EMAIL_FROM']) {
        const value = process.env[`PROVISION_${key}`];
        if (value) optional[key] = value;
    }
} else {
    const anthropic = await password({
        message: 'Anthropic API key for chat (blank to skip)',
        mask: '*',
    });
    if (anthropic) optional.ANTHROPIC_API_KEY = anthropic;

    const resend = await password({
        message: 'Resend API key for email (blank = emails only logged)',
        mask: '*',
    });
    if (resend) {
        optional.RESEND_API_KEY = resend;
        const from = await input({
            message:
                'EMAIL_FROM on a Resend-verified domain, e.g. "App <no-reply@example.com>" (blank to skip)',
        });
        if (from) optional.EMAIL_FROM = from;
    }
}

const nextConfig: AppConfig = {
    project: projectName,
    service: serviceName,
    repo,
    branch,
};

console.log(`
  Project:    ${projectName} (workspace ${workspace})
  Service:    ${serviceName}, built from ./Dockerfile, deploys ${repo}@${branch}
  Databases:  Postgres, VoltAgent Postgres
  Variables:  BETTER_AUTH_SECRET (generated), BETTER_AUTH_BASE_URL${Object.keys(
      optional,
  )
      .map((key) => `, ${key}`)
      .join('')}`);

if (!nonInteractive && !dryRun) {
    const proceed = await confirm({
        message: 'Create these Railway resources? (billable)',
        default: true,
    });
    if (!proceed) fail('Aborted; nothing was created.');
}

// 3. Create the project and apply .railway/railway.ts.
step('Writing .railway/app.json');
await mutate(`write ${JSON.stringify(nextConfig)}`, () =>
    write(appConfigPath, JSON.stringify(nextConfig, null, 4) + '\n').then(
        () => undefined,
    ),
);

step(`Creating Railway project "${projectName}"`);
await mutate(
    `railway init --name ${projectName} --workspace ${workspace}`,
    () =>
        $`railway init --name ${projectName} --workspace ${workspace!}`
            .cwd(root)
            .then(() => undefined),
);

step('Applying .railway/railway.ts');
const applied = dryRun
    ? true
    : (await $`railway config apply --yes`.cwd(root).nothrow()).exitCode === 0;
if (dryRun) console.log('  [dry-run] railway config apply --yes');
if (!applied) {
    fail(
        '`railway config apply` failed; the project exists but is incomplete. ' +
            'If the error mentions the repo, give the Railway GitHub app access ' +
            `to ${repo} (github.com/apps/railway-app), then re-run ` +
            '`railway config apply` from this directory.',
    );
}

// 4. Domain + variables, then one deploy with everything in place.
step('Generating a Railway domain');
let domain = dryRun ? `${serviceName}-production.up.railway.app` : undefined;
if (!dryRun) {
    const created =
        await $`railway domain --service ${serviceName} --port 8080 --json`
            .cwd(root)
            .quiet()
            .nothrow();
    domain = findRailwayDomain(created.stdout.toString());
    if (!domain) {
        const listed =
            await $`railway domain list --service ${serviceName} --json`
                .cwd(root)
                .quiet()
                .nothrow();
        domain = findRailwayDomain(listed.stdout.toString());
    }
    if (!domain) {
        fail(
            'Could not read the generated domain. Run `railway domain ' +
                `--service ${serviceName}\`, then set BETTER_AUTH_BASE_URL and ` +
                `BETTER_AUTH_SECRET with \`railway variable set\`.`,
        );
    }
}
console.log(`  https://${domain}`);

step('Setting variables');
await setVariable(
    serviceName,
    'BETTER_AUTH_SECRET',
    randomBytes(32).toString('base64'),
);
await setVariable(serviceName, 'BETTER_AUTH_BASE_URL', `https://${domain}`);
for (const [key, value] of Object.entries(optional)) {
    await setVariable(serviceName, key, value);
}

step('Deploying');
await mutate(`railway redeploy --service ${serviceName} --from-source`, () =>
    $`railway redeploy --service ${serviceName} --from-source --yes`
        .cwd(root)
        .quiet()
        .nothrow()
        .then((result) => {
            if (result.exitCode !== 0) {
                console.warn(
                    '  ⚠ Redeploy did not start; the deploy queued by apply ' +
                        'will pick up the variables on its next attempt.',
                );
            }
        }),
);

// 5. Wait for the app to report healthy.
let healthy = false;
if (wait && !dryRun) {
    step(
        'Waiting for /healthcheck (Docker build, Wait for CI, and migrations ' +
            'take a few minutes)',
    );
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const response = await fetch(`https://${domain}/healthcheck`, {
            signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (response?.ok) {
            healthy = true;
            break;
        }
        process.stdout.write('.');
        await sleep(15_000);
    }
    console.log('');
}

const linked = dryRun
    ? null
    : ((await $`railway status --json`.cwd(root).quiet().nothrow().json()) as {
          id: string;
      });

console.log(`
${dryRun ? '✓ Dry run complete; nothing was changed.' : healthy ? `✓ ${projectName} is live.` : `• ${projectName} is provisioned${wait ? ' but not healthy yet' : ''}.`}

  App:        https://${domain}
  Railway:    ${linked ? `https://railway.com/project/${linked.id}` : '(created on a real run)'}
${
    healthy || dryRun || !wait
        ? ''
        : `
  Not healthy after ${HEALTH_TIMEOUT_MS / 60_000} min. Check:
    railway service status --all
    railway logs --service ${serviceName} --build --lines 100
    railway logs --service ${serviceName} --lines 100
  A deploy is skipped when CI fails on the commit (Wait for CI is on).
`
}
  Next:
    1. Commit .railway/app.json so later \`railway config plan\` runs target this project.
    2. Custom domain: \`railway domain app.example.com --service ${serviceName}\`, then set
       BETTER_AUTH_BASE_URL (and BETTER_AUTH_TRUSTED_ORIGINS for extra hosts).
    3. Email: without RESEND_API_KEY, password-reset and verification emails are only logged.
    4. OAuth callbacks: <base URL>/api/auth/callback/github and /callback/google.
    5. Background jobs: create a Trigger.dev project and set TRIGGER_SECRET_KEY.
    6. Ship changes by merging to ${branch}; Railway deploys after CI passes.
`);
