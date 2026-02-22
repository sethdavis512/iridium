#!/usr/bin/env tsx
/**
 * Iridium Setup Wizard
 *
 * Run with: npm run setup
 *
 * Generates .env, runs Prisma migrations, and optionally seeds the database.
 */
import inquirer from 'inquirer';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

function run(cmd: string, label: string) {
    console.log(`\n⏳ ${label}...`);
    try {
        execSync(cmd, { stdio: 'inherit' });
        console.log(`✅ ${label} complete.`);
    } catch (err) {
        console.error(`❌ ${label} failed.`);
        throw err;
    }
}

async function main() {
    console.log('\n╔══════════════════════════════════╗');
    console.log('║      Iridium Setup Wizard        ║');
    console.log('╚══════════════════════════════════╝\n');

    // ── Check for existing .env ──────────────────────────────────────────────
    if (existsSync('.env')) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: '.env already exists. Overwrite it?',
                default: false,
            },
        ]);
        if (!overwrite) {
            console.log('\nKeeping existing .env. Running migrations...');
            run('npx prisma migrate deploy', 'Database migrations');
            console.log('\n✅ Done! Run: npm run dev\n');
            return;
        }
    }

    // ── Required vars ────────────────────────────────────────────────────────
    console.log('\n── Required Configuration ──────────────────────────────────\n');

    const secret = randomBytes(32).toString('base64');

    const required = await inquirer.prompt([
        {
            type: 'input',
            name: 'databaseUrl',
            message: 'DATABASE_URL:',
            default: 'postgresql://user:password@localhost:5432/iridium',
            validate: (val: string) =>
                val.startsWith('postgresql://') || 'Must be a valid PostgreSQL URL',
        },
        {
            type: 'input',
            name: 'appUrl',
            message: 'App URL (BETTER_AUTH_URL):',
            default: 'http://localhost:5173',
        },
    ]);

    console.log(`\n  BETTER_AUTH_SECRET → auto-generated (${secret.length} chars)`);

    // ── Email (Resend) ────────────────────────────────────────────────────────
    console.log('\n── Email (Resend) ──────────────────────────────────────────');
    console.log('  Get your key at: https://resend.com/api-keys\n');

    const email = await inquirer.prompt([
        {
            type: 'password',
            name: 'resendApiKey',
            message: 'RESEND_API_KEY:',
            mask: '*',
        },
        {
            type: 'input',
            name: 'resendFromEmail',
            message: 'RESEND_FROM_EMAIL:',
            default: 'hello@yourdomain.com',
        },
    ]);

    // ── Optional: AI chat ────────────────────────────────────────────────────
    const { enableAI } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'enableAI',
            message: 'Enable AI chat? (requires a provider API key)',
            default: false,
        },
    ]);

    let aiProvider = '';
    let aiModel = '';
    let aiApiKey = '';
    let aiKeyName = 'OPENAI_API_KEY';

    if (enableAI) {
        const { selectedProvider } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedProvider',
                message: 'AI provider:',
                choices: [
                    { name: 'OpenAI (gpt-4o-mini)', value: 'openai' },
                    { name: 'Anthropic (claude-3-5-haiku)', value: 'anthropic' },
                    { name: 'Google (gemini-2.0-flash)', value: 'google' },
                ],
                default: 'openai',
            },
        ]);

        aiProvider = selectedProvider;
        aiKeyName =
            aiProvider === 'anthropic'
                ? 'ANTHROPIC_API_KEY'
                : aiProvider === 'google'
                  ? 'GOOGLE_GENERATIVE_AI_API_KEY'
                  : 'OPENAI_API_KEY';

        const defaultModel =
            aiProvider === 'anthropic'
                ? 'claude-3-5-haiku-20241022'
                : aiProvider === 'google'
                  ? 'gemini-2.0-flash'
                  : 'gpt-4o-mini';

        const aiDetails = await inquirer.prompt([
            {
                type: 'input',
                name: 'aiModel',
                message: 'AI model:',
                default: defaultModel,
            },
            {
                type: 'password',
                name: 'aiApiKey',
                message: `${aiKeyName}:`,
                mask: '*',
            },
        ]);

        aiModel = aiDetails.aiModel;
        aiApiKey = aiDetails.aiApiKey;
    }

    // ── Optional: Storage ────────────────────────────────────────────────────
    const { enableStorage } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'enableStorage',
            message: 'Enable file storage (S3-compatible)?',
            default: false,
        },
    ]);

    let awsAccessKeyId = '';
    let awsSecretAccessKey = '';
    let awsBucketName = '';
    let awsEndpointUrl = 'https://storage.railway.app';
    let awsRegion = 'auto';

    if (enableStorage) {
        const storageConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'awsAccessKeyId',
                message: 'AWS_ACCESS_KEY_ID:',
            },
            {
                type: 'password',
                name: 'awsSecretAccessKey',
                message: 'AWS_SECRET_ACCESS_KEY:',
                mask: '*',
            },
            {
                type: 'input',
                name: 'awsBucketName',
                message: 'AWS_BUCKET_NAME:',
            },
            {
                type: 'input',
                name: 'awsEndpointUrl',
                message: 'AWS_ENDPOINT_URL:',
                default: 'https://storage.railway.app',
            },
            {
                type: 'input',
                name: 'awsRegion',
                message: 'AWS_DEFAULT_REGION:',
                default: 'auto',
            },
        ]);

        awsAccessKeyId = storageConfig.awsAccessKeyId;
        awsSecretAccessKey = storageConfig.awsSecretAccessKey;
        awsBucketName = storageConfig.awsBucketName;
        awsEndpointUrl = storageConfig.awsEndpointUrl;
        awsRegion = storageConfig.awsRegion;
    }

    // ── Optional: OAuth ──────────────────────────────────────────────────────
    const { enableOAuth } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'enableOAuth',
            message: 'Enable OAuth (GitHub and/or Google)?',
            default: false,
        },
    ]);

    let githubClientId = '';
    let githubClientSecret = '';
    let googleClientId = '';
    let googleClientSecret = '';

    if (enableOAuth) {
        const { providers } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'providers',
                message: 'Which OAuth providers?',
                choices: [
                    { name: 'GitHub', value: 'github' },
                    { name: 'Google', value: 'google' },
                ],
            },
        ]);

        if (providers.includes('github')) {
            console.log('  → Get credentials: https://github.com/settings/developers\n');
            const gh = await inquirer.prompt([
                { type: 'input', name: 'clientId', message: 'GITHUB_CLIENT_ID:' },
                { type: 'password', name: 'clientSecret', message: 'GITHUB_CLIENT_SECRET:', mask: '*' },
            ]);
            githubClientId = gh.clientId;
            githubClientSecret = gh.clientSecret;
        }

        if (providers.includes('google')) {
            console.log('  → Get credentials: https://console.cloud.google.com/apis/credentials\n');
            const gg = await inquirer.prompt([
                { type: 'input', name: 'clientId', message: 'GOOGLE_CLIENT_ID:' },
                { type: 'password', name: 'clientSecret', message: 'GOOGLE_CLIENT_SECRET:', mask: '*' },
            ]);
            googleClientId = gg.clientId;
            googleClientSecret = gg.clientSecret;
        }
    }

    // ── Write .env ───────────────────────────────────────────────────────────
    const envLines = [
        '# Generated by npm run setup',
        '',
        '# ═══════════════════════════════════════════════════',
        '# REQUIRED',
        '# ═══════════════════════════════════════════════════',
        `DATABASE_URL=${required.databaseUrl}`,
        `BETTER_AUTH_SECRET=${secret}`,
        `BETTER_AUTH_URL=${required.appUrl}`,
        `VITE_BETTER_AUTH_BASE_URL=${required.appUrl}`,
        '',
        '# ═══════════════════════════════════════════════════',
        '# REQUIRED — Email (Resend)',
        '# ═══════════════════════════════════════════════════',
        `RESEND_API_KEY=${email.resendApiKey}`,
        `RESEND_FROM_EMAIL=${email.resendFromEmail}`,
    ];

    if (enableAI) {
        envLines.push(
            '',
            '# ═══════════════════════════════════════════════════',
            '# OPTIONAL — AI Chat',
            '# ═══════════════════════════════════════════════════',
            `AI_PROVIDER=${aiProvider}`,
            `AI_MODEL=${aiModel}`,
            `${aiKeyName}=${aiApiKey}`,
        );
    }

    if (enableStorage) {
        envLines.push(
            '',
            '# ═══════════════════════════════════════════════════',
            '# OPTIONAL — File Storage',
            '# ═══════════════════════════════════════════════════',
            `AWS_ACCESS_KEY_ID=${awsAccessKeyId}`,
            `AWS_SECRET_ACCESS_KEY=${awsSecretAccessKey}`,
            `AWS_BUCKET_NAME=${awsBucketName}`,
            `AWS_ENDPOINT_URL=${awsEndpointUrl}`,
            `AWS_DEFAULT_REGION=${awsRegion}`,
            'AWS_FORCE_PATH_STYLE=false',
        );
    }

    if (githubClientId || googleClientId) {
        envLines.push(
            '',
            '# ═══════════════════════════════════════════════════',
            '# OPTIONAL — OAuth',
            '# ═══════════════════════════════════════════════════',
        );
        if (githubClientId) {
            envLines.push(
                `GITHUB_CLIENT_ID=${githubClientId}`,
                `GITHUB_CLIENT_SECRET=${githubClientSecret}`,
            );
        }
        if (googleClientId) {
            envLines.push(
                `GOOGLE_CLIENT_ID=${googleClientId}`,
                `GOOGLE_CLIENT_SECRET=${googleClientSecret}`,
            );
        }
    }

    envLines.push('', 'DEFAULT_THEME=light', '');

    writeFileSync('.env', envLines.join('\n'));
    console.log('\n✅ .env written.');

    // ── Run migrations ───────────────────────────────────────────────────────
    run('npx prisma generate', 'Prisma client generation');
    run('npx prisma migrate deploy', 'Database migrations');

    // ── Optional: seed ───────────────────────────────────────────────────────
    const { seed } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'seed',
            message: 'Seed the database with demo data? (admin@iridium.com / Admin123!)',
            default: true,
        },
    ]);

    if (seed) {
        run('npm run seed', 'Database seed');
    }

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  Setup complete!                                     ║');
    console.log('║                                                      ║');
    console.log('║  Next steps:                                         ║');
    console.log('║    npm run dev                                       ║');
    if (seed) {
        console.log('║                                                      ║');
        console.log('║  Test credentials:                                   ║');
        console.log('║    admin@iridium.com / Admin123!                     ║');
    }
    console.log('╚══════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
    console.error('\n❌ Setup failed:', err.message ?? err);
    process.exit(1);
});
