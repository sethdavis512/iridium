import { describe, expect, it } from 'vitest';
import { seedRefusalReason } from './seed-guard';

const local = 'postgresql://postgres:postgres@localhost:5432/iridium';

describe('seedRefusalReason', () => {
    it.each([
        local,
        'postgresql://postgres:postgres@127.0.0.1:5432/iridium',
        'postgresql://postgres:postgres@[::1]:5432/iridium',
    ])('allows a local database in development: %s', (databaseUrl) => {
        expect(
            seedRefusalReason({
                nodeEnv: 'development',
                databaseUrl,
                force: false,
            }),
        ).toBeNull();
    });

    it('allows a local database when NODE_ENV is unset or test', () => {
        for (const nodeEnv of [undefined, 'test']) {
            expect(
                seedRefusalReason({
                    nodeEnv,
                    databaseUrl: local,
                    force: false,
                }),
            ).toBeNull();
        }
    });

    it('refuses when NODE_ENV is production, even on localhost', () => {
        expect(
            seedRefusalReason({
                nodeEnv: 'production',
                databaseUrl: local,
                force: false,
            }),
        ).toMatch(/production/);
    });

    it('refuses a remote database host', () => {
        expect(
            seedRefusalReason({
                nodeEnv: 'development',
                databaseUrl:
                    'postgresql://postgres:secret@monorail.proxy.rlwy.net:43210/railway',
                force: false,
            }),
        ).toMatch(/monorail\.proxy\.rlwy\.net/);
    });

    it('refuses a host that only contains "localhost"', () => {
        expect(
            seedRefusalReason({
                nodeEnv: 'development',
                databaseUrl: 'postgresql://u:p@localhost.evil.example:5432/db',
                force: false,
            }),
        ).not.toBeNull();
    });

    it('refuses an unparseable DATABASE_URL', () => {
        expect(
            seedRefusalReason({
                nodeEnv: 'development',
                databaseUrl: 'not a url',
                force: false,
            }),
        ).toMatch(/valid URL/);
    });

    it('--force overrides every check', () => {
        expect(
            seedRefusalReason({
                nodeEnv: 'production',
                databaseUrl: 'postgresql://u:p@db.example.com:5432/app',
                force: true,
            }),
        ).toBeNull();
    });
});
