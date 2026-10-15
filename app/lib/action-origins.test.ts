import { describe, expect, it } from 'vitest';
import { actionOriginHosts } from './action-origins';

describe('actionOriginHosts', () => {
    it('returns nothing when no public URL is configured', () => {
        expect(actionOriginHosts({})).toEqual([]);
        expect(
            actionOriginHosts({
                BETTER_AUTH_BASE_URL: '',
                BETTER_AUTH_TRUSTED_ORIGINS: ' , ',
            }),
        ).toEqual([]);
    });

    it('allows the host of the public base URL, whatever its scheme', () => {
        expect(
            actionOriginHosts({
                BETTER_AUTH_BASE_URL: 'https://iridium.sethdavis.tech',
            }),
        ).toEqual(['iridium.sethdavis.tech']);
        expect(
            actionOriginHosts({
                BETTER_AUTH_BASE_URL: 'http://localhost:5173',
            }),
        ).toEqual(['localhost:5173']);
    });

    it('adds trusted origins, deduplicated, and keeps wildcard hosts', () => {
        expect(
            actionOriginHosts({
                BETTER_AUTH_BASE_URL: 'https://app.example.com',
                BETTER_AUTH_TRUSTED_ORIGINS:
                    ' https://app.example.com , https://*.preview.example.com,https://staging.example.com/path',
            }),
        ).toEqual([
            'app.example.com',
            '*.preview.example.com',
            'staging.example.com',
        ]);
    });

    it('skips values that are not URLs', () => {
        expect(
            actionOriginHosts({
                BETTER_AUTH_BASE_URL: 'not a url',
                BETTER_AUTH_TRUSTED_ORIGINS: 'https://ok.example.com',
            }),
        ).toEqual(['ok.example.com']);
    });
});
