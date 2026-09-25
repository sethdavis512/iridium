import type { PoolConfig } from 'pg';

/**
 * Max connections per pool, sized for one replica with headroom. Railway
 * Postgres allows 100 connections per database by default, and a deploy
 * briefly runs the old and new replica side by side, so every number here
 * counts twice during a rollout. See "Database pools" in CLAUDE.md.
 */
export const POOL_MAX = {
    /** Prisma on DATABASE_URL (also used by seed and Trigger.dev tasks). */
    app: 10,
    /** VoltAgent memory adapter on VOLTAGENT_DATABASE_URL. */
    voltagent: 5,
    /** /healthcheck probe on VOLTAGENT_DATABASE_URL. */
    healthcheck: 1,
} as const;

/** Wait for a pooled connection (or a new one) before failing the query. */
export const CONNECTION_TIMEOUT_MS = 5_000;
/** Server-side cap on any single statement. */
export const STATEMENT_TIMEOUT_MS = 15_000;
/** Server-side cap on a transaction left open and idle. */
export const IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * pg pool options shared by every pool the server opens. pg's defaults are
 * max 10 and connectionTimeoutMillis 0 (wait forever), so an exhausted pool
 * or an unresponsive database hangs requests instead of failing them.
 * statement_timeout and idle_in_transaction_session_timeout are sent as
 * startup parameters, so Postgres enforces them on each connection.
 */
export function pgPoolConfig(
    connectionString: string,
    max: number,
): PoolConfig {
    return {
        connectionString,
        max,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        idleTimeoutMillis: 30_000,
        statement_timeout: STATEMENT_TIMEOUT_MS,
        idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
    };
}
