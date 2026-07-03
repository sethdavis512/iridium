import { describe, it, expect } from 'vitest';
import { computeEnvWarnings } from './env.server';

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
