import { describe, expect, it } from 'vitest';
import {
    CONNECTION_TIMEOUT_MS,
    pgPoolConfig,
    POOL_MAX,
    STATEMENT_TIMEOUT_MS,
} from './db-pool.server';

describe('pgPoolConfig', () => {
    it('never leaves pg on its wait-forever defaults', () => {
        const config = pgPoolConfig('postgresql://localhost/db', 7);
        expect(config).toMatchObject({
            connectionString: 'postgresql://localhost/db',
            max: 7,
            connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
            statement_timeout: STATEMENT_TIMEOUT_MS,
        });
        expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
        expect(config.idle_in_transaction_session_timeout).toBeGreaterThan(0);
    });

    it('keeps two overlapping replicas well under 100 connections per DB', () => {
        const appDb = POOL_MAX.app;
        const voltagentDb = POOL_MAX.voltagent + POOL_MAX.healthcheck;
        expect(appDb * 2).toBeLessThanOrEqual(50);
        expect(voltagentDb * 2).toBeLessThanOrEqual(50);
    });
});
