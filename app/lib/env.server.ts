import { z } from 'zod';
import type { EnvWarning } from '~/lib/env-status';

const envSchema = z.object({
    DATABASE_URL: z.url({ message: 'DATABASE_URL must be a valid URL' }),
    BETTER_AUTH_SECRET: z
        .string()
        .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_BASE_URL: z.url(),
    /**
     * Comma-separated list of additional trusted origins for Better Auth.
     * BETTER_AUTH_BASE_URL is always trusted; use this for preview deploys,
     * staging hosts, or custom domains served by the same backend.
     */
    BETTER_AUTH_TRUSTED_ORIGINS: z
        .string()
        .optional()
        .transform((value) =>
            value
                ? value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                : [],
        ),
    /**
     * Optional: when unset, AI chat is disabled but the app still boots. The
     * Vercel AI SDK reads this from process.env at request time, so a missing
     * key only fails the chat request (surfaced in the chat error UI), not
     * startup. Set a real key to enable chat.
     */
    ANTHROPIC_API_KEY: z.string().optional(),
    /**
     * Optional: when unset, outgoing email is rendered and logged to the
     * console instead of sent. Set a real key in production.
     */
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Iridium <onboarding@resend.dev>'),
    /**
     * Optional OAuth providers: a provider's login button only renders when
     * both its client ID and secret are set. Callback URLs are
     * <BETTER_AUTH_BASE_URL>/api/auth/callback/github and /callback/google.
     */
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /**
     * Optional: enables Trigger.dev background jobs (async auth emails,
     * async thread titles; the scheduled purge runs on Trigger's side).
     * When unset, jobs.server.ts runs the same work inline.
     */
    TRIGGER_SECRET_KEY: z.string().optional(),
    /**
     * Optional Stripe billing. When STRIPE_SECRET_KEY is unset, billing.server.ts
     * runs in stub mode (mock checkout/portal sessions, logged to the console) so
     * local dev and CI need no Stripe account. STRIPE_WEBHOOK_SECRET verifies
     * incoming webhook signatures; STRIPE_PRICE_ID is the default plan price.
     */
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID: z.string().optional(),
    VOLTAGENT_DATABASE_URL: z.url({
        message: 'VOLTAGENT_DATABASE_URL must be a valid URL',
    }),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
    /**
     * Disables Better Auth's rate limiter. Intended only for the E2E test
     * server, which creates many sessions quickly; unset everywhere else so
     * dev, CI, and prod keep the production limits.
     */
    DISABLE_AUTH_RATE_LIMIT: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => value === 'true'),
    /**
     * Enables test-only endpoints (e.g. /api/test-mailbox). Intended only
     * for the E2E test server; never set in production.
     */
    E2E_TEST_HOOKS: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => value === 'true'),
});

type Env = z.infer<typeof envSchema>;

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Dev/test placeholders for required infrastructure vars. When one is missing
 * or invalid outside production, we substitute a placeholder so the app still
 * boots (and surface it in the dev banner) instead of crashing. Production
 * never uses these — it fails fast on misconfiguration.
 */
const DEV_FALLBACKS: Record<string, string> = {
    DATABASE_URL:
        'postgresql://placeholder:placeholder@localhost:5432/placeholder',
    VOLTAGENT_DATABASE_URL:
        'postgresql://placeholder:placeholder@localhost:5433/placeholder',
    BETTER_AUTH_SECRET: 'dev-only-placeholder-secret-change-me-please',
    BETTER_AUTH_BASE_URL: 'http://localhost:5173',
};

/** Why a placeholdered infra var matters — shown in the dev banner. */
const INFRA_EFFECTS: Record<string, string> = {
    DATABASE_URL: 'App database is unreachable; most pages will error.',
    VOLTAGENT_DATABASE_URL: 'AI memory store is unreachable; chat will error.',
    BETTER_AUTH_SECRET: 'Sessions use an insecure placeholder secret.',
    BETTER_AUTH_BASE_URL: 'Auth callbacks use a placeholder URL.',
};

function reportAndExit(error: z.ZodError): never {
    const formatted = error.issues
        .map((i) => `  ✗ ${i.path.join('.')}: ${i.message}`)
        .join('\n');

    console.error(`\n❌ Invalid environment variables:\n${formatted}\n`);
    console.error('→ Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
}

function validateEnv(): { env: Env; placeholdered: string[] } {
    const result = envSchema.safeParse(process.env);
    if (result.success) return { env: result.data, placeholdered: [] };

    // Production must never run misconfigured — fail fast.
    if (isProduction) reportAndExit(result.error);

    // Dev/test: substitute placeholders for failing infra vars so the app can
    // still boot. The banner (and this warning) tells the developer what's off.
    const patched: NodeJS.ProcessEnv = { ...process.env };
    const placeholdered: string[] = [];
    for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (key in DEV_FALLBACKS && !placeholdered.includes(key)) {
            patched[key] = DEV_FALLBACKS[key];
            placeholdered.push(key);
        }
    }

    const retry = envSchema.safeParse(patched);
    // A failure here means a required var we don't have a placeholder for —
    // unrecoverable, so fall back to fail-fast even in dev.
    if (!retry.success) reportAndExit(retry.error);

    console.warn(
        `\n⚠ Missing/invalid env: ${placeholdered.join(', ')} — using dev ` +
            `placeholders so the app can boot. See the in-app banner.\n`,
    );
    return { env: retry.data, placeholdered };
}

const resolved = validateEnv();

export const env = resolved.env;

/**
 * Build the dev banner's warning list. Only *required* infra vars that are
 * missing/invalid (and so running on a dev placeholder) are surfaced — optional
 * feature keys degrade gracefully and are deliberately not shown. Pure so it
 * can be unit-tested without touching process.env.
 */
export function computeEnvWarnings(placeholdered: string[]): EnvWarning[] {
    return placeholdered.map((key) => ({
        key,
        effect: INFRA_EFFECTS[key] ?? 'Using a development placeholder.',
    }));
}

export const envWarnings: EnvWarning[] = computeEnvWarnings(
    resolved.placeholdered,
);

/**
 * Whether the in-app dev env banner should render: only outside production,
 * and never during E2E runs (which set E2E_TEST_HOOKS) so it can't perturb
 * test interactions or visual snapshots.
 */
export const shouldShowEnvBanner = !isProduction && !env.E2E_TEST_HOOKS;
