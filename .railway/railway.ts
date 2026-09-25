/**
 * Railway Infrastructure as Code: the app service built from the root
 * Dockerfile plus its two Postgres databases (app data and VoltAgent memory).
 * Per-project values (project and service names, GitHub repo, pinned database
 * images) live in ./app.json, so each copy of this template describes its
 * own Railway project.
 *
 * New project: `bun run provision` rewrites app.json, creates the Railway
 * project, and applies this file. Existing project: edit, then run
 * `railway config plan` and `railway config apply`. Always read the plan: a
 * resource or variable missing from this file is deleted on apply, and
 * dropping `source` disconnects the GitHub repo.
 *
 * Secrets, URLs, and optional feature keys are `preserve()`: the provisioning
 * script or the dashboard sets them, and apply never overwrites them.
 */
import {
    database,
    defineRailway,
    github,
    postgres,
    preserve,
    project,
    service,
} from 'railway/iac';

import app from './app.json' with { type: 'json' };

type AppConfig = {
    project: string;
    service: string;
    repo: string;
    branch: string;
    postgresImage?: string;
    voltagentPostgresImage?: string;
};

const config: AppConfig = app;

// Existing databases pin their image so a plan can never swap the Postgres
// major version under live data. New projects omit the pin and get Railway's
// managed Postgres.
function pg(name: string, image?: string) {
    return image ? database(name, 'postgres', { image }) : postgres(name);
}

export default defineRailway((ctx) => {
    if (ctx.projectName !== config.project) {
        throw new Error(
            `.railway/app.json describes Railway project "${config.project}", ` +
                `but this directory is linked to "${ctx.projectName}". Run ` +
                '`bun run provision` for a new copy, or fix app.json.',
        );
    }

    const db = pg('Postgres', config.postgresImage);
    const voltagentDb = pg('VoltAgent Postgres', config.voltagentPostgresImage);

    const web = service(config.service, {
        // checkSuites = Railway's "Wait for CI": deploys start only after the
        // GitHub Actions workflow on the commit passes.
        source: github(config.repo, {
            branch: config.branch,
            checkSuites: true,
        }),
        build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
        start: 'npm run start',
        preDeploy: 'npx --no-install prisma migrate deploy',
        healthcheck: '/healthcheck',
        healthcheckTimeout: 100,
        deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
        env: {
            DATABASE_URL: db.env.DATABASE_URL,
            VOLTAGENT_DATABASE_URL: voltagentDb.env.DATABASE_URL,
            BETTER_AUTH_SECRET: preserve(),
            BETTER_AUTH_BASE_URL: preserve(),
            BETTER_AUTH_TRUSTED_ORIGINS: preserve(),
            ADMIN_EMAILS: preserve(),
            ANTHROPIC_API_KEY: preserve(),
            RESEND_API_KEY: preserve(),
            EMAIL_FROM: preserve(),
            GITHUB_CLIENT_ID: preserve(),
            GITHUB_CLIENT_SECRET: preserve(),
            GOOGLE_CLIENT_ID: preserve(),
            GOOGLE_CLIENT_SECRET: preserve(),
            TRIGGER_SECRET_KEY: preserve(),
            STRIPE_SECRET_KEY: preserve(),
            STRIPE_WEBHOOK_SECRET: preserve(),
            STRIPE_PRICE_ID: preserve(),
        },
    });

    return project(ctx.projectName, {
        resources: [web, db, voltagentDb],
    });
});
