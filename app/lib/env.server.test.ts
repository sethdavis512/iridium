import { afterEach, describe, it, expect, vi } from 'vitest';
import { LOCAL_DATABASE_NAME } from '~/config';
import {
    bootEnvSchema,
    computeEnvWarnings,
    productionEmailWarnings,
} from './env.server';

const baseEnv = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/iridium',
    VOLTAGENT_DATABASE_URL:
        'postgresql://postgres:postgres@localhost:5433/voltagent',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_BASE_URL: 'https://iridium.example.com',
};

function failingKeys(input: Record<string, string>) {
    const result = bootEnvSchema.safeParse(input);
    return result.success
        ? []
        : result.error.issues.map((i) => String(i.path[0]));
}

describe('bootEnvSchema test-only flags', () => {
    it('boots in production when the test-only flags are unset or false', () => {
        expect(failingKeys({ ...baseEnv, NODE_ENV: 'production' })).toEqual([]);
        expect(
            failingKeys({
                ...baseEnv,
                NODE_ENV: 'production',
                E2E_TEST_HOOKS: 'false',
                DISABLE_AUTH_RATE_LIMIT: 'false',
            }),
        ).toEqual([]);
    });

    it('fails in production when E2E_TEST_HOOKS is true', () => {
        expect(
            failingKeys({
                ...baseEnv,
                NODE_ENV: 'production',
                E2E_TEST_HOOKS: 'true',
            }),
        ).toEqual(['E2E_TEST_HOOKS']);
    });

    it('fails in production when DISABLE_AUTH_RATE_LIMIT is true', () => {
        expect(
            failingKeys({
                ...baseEnv,
                NODE_ENV: 'production',
                DISABLE_AUTH_RATE_LIMIT: 'true',
            }),
        ).toEqual(['DISABLE_AUTH_RATE_LIMIT']);
    });

    it('allows the flags outside production (E2E and dev servers)', () => {
        for (const NODE_ENV of ['development', 'test']) {
            expect(
                failingKeys({
                    ...baseEnv,
                    NODE_ENV,
                    E2E_TEST_HOOKS: 'true',
                    DISABLE_AUTH_RATE_LIMIT: 'true',
                }),
            ).toEqual([]);
        }
    });
});

describe('computeEnvWarnings', () => {
    it('returns no warnings when no required var is placeholdered', () => {
        // Optional feature keys (Stripe, Resend, OAuth, …) are never surfaced,
        // so an otherwise-configured app shows an empty banner.
        expect(computeEnvWarnings([])).toEqual([]);
    });

    it('warns about each placeholdered required infra var', () => {
        const warnings = computeEnvWarnings([
            'DATABASE_URL',
            'BETTER_AUTH_SECRET',
        ]);
        expect(warnings.map((w) => w.key)).toEqual([
            'DATABASE_URL',
            'BETTER_AUTH_SECRET',
        ]);
        const db = warnings.find((w) => w.key === 'DATABASE_URL');
        expect(db?.effect).toMatch(/database/i);
    });

    it('falls back to a generic effect for an unknown key', () => {
        const [warning] = computeEnvWarnings(['SOMETHING_ELSE']);
        expect(warning.effect).toMatch(/placeholder/i);
    });
});

describe('productionEmailWarnings', () => {
    const verifiedSender = 'Iridium <hello@example.com>';

    it('stays silent outside production (console fallback)', () => {
        for (const NODE_ENV of ['development', 'test'] as const) {
            expect(
                productionEmailWarnings({
                    NODE_ENV,
                    RESEND_API_KEY: undefined,
                    EMAIL_FROM: verifiedSender,
                }),
            ).toEqual([]);
        }
    });

    it('warns in production when RESEND_API_KEY is unset', () => {
        const [warning] = productionEmailWarnings({
            NODE_ENV: 'production',
            RESEND_API_KEY: undefined,
            EMAIL_FROM: verifiedSender,
        });
        expect(warning).toMatch(/RESEND_API_KEY is unset/);
    });

    it('warns in production when EMAIL_FROM is the resend.dev test sender', () => {
        const [warning] = productionEmailWarnings({
            NODE_ENV: 'production',
            RESEND_API_KEY: 're_test',
            EMAIL_FROM: 'Iridium <onboarding@resend.dev>',
        });
        expect(warning).toMatch(/EMAIL_FROM/);
    });

    it('is quiet in production once Resend is fully configured', () => {
        expect(
            productionEmailWarnings({
                NODE_ENV: 'production',
                RESEND_API_KEY: 're_test',
                EMAIL_FROM: verifiedSender,
            }),
        ).toEqual([]);
    });
});

describe('database dev fallbacks', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    async function loadEnv(ports: Record<string, string | undefined>) {
        vi.stubEnv('DATABASE_URL', undefined);
        vi.stubEnv('VOLTAGENT_DATABASE_URL', undefined);
        for (const [key, value] of Object.entries(ports)) {
            vi.stubEnv(key, value);
        }
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.resetModules();
        return (await import('./env.server')).env;
    }

    it('use the docker-compose.dev.yml default ports', async () => {
        const env = await loadEnv({
            POSTGRES_PORT: undefined,
            VOLTAGENT_POSTGRES_PORT: undefined,
        });
        expect(env.DATABASE_URL).toBe(
            `postgresql://postgres:postgres@localhost:5432/${LOCAL_DATABASE_NAME}`,
        );
        expect(env.VOLTAGENT_DATABASE_URL).toBe(
            'postgresql://postgres:postgres@localhost:5433/voltagent',
        );
    });

    it('honor the host ports setup picked', async () => {
        const env = await loadEnv({
            POSTGRES_PORT: '5442',
            VOLTAGENT_POSTGRES_PORT: '5443',
        });
        expect(env.DATABASE_URL).toBe(
            `postgresql://postgres:postgres@localhost:5442/${LOCAL_DATABASE_NAME}`,
        );
        expect(env.VOLTAGENT_DATABASE_URL).toBe(
            'postgresql://postgres:postgres@localhost:5443/voltagent',
        );
    });
});
