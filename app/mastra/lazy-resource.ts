import { log } from '~/lib/logger.server';

/**
 * Thrown by LazyResource.get() while the resource can't be opened.
 * `retryAfterMs` is how long until the next attempt may run (0 when the next
 * call will try again). The open failure, if any, is the `cause`.
 */
export class ResourceUnavailableError extends Error {
    readonly retryAfterMs: number;

    constructor(resource: string, retryAfterMs: number, cause?: unknown) {
        const reason = cause instanceof Error ? `: ${cause.message}` : '';
        super(`${resource} is unavailable${reason}`, { cause });
        this.name = 'ResourceUnavailableError';
        this.retryAfterMs = retryAfterMs;
    }
}

type LazyResourceOptions<T> = {
    /** Names the resource in logs and errors. */
    name: string;
    /** Opens the resource. On failure it must release what it acquired. */
    open: () => Promise<T>;
    /** Releases an opened resource. */
    close: (resource: T) => unknown;
    /** Wait after the first failure; doubles per consecutive failure. */
    initialDelayMs?: number;
    maxDelayMs?: number;
    now?: () => number;
};

export type LazyResource<T> = {
    /**
     * The open resource, opening it on the first call. Concurrent callers
     * share one attempt. After a failed attempt, calls reject with
     * ResourceUnavailableError without retrying until the backoff delay has
     * passed; the first call after that tries again.
     */
    get(): Promise<T>;
    /** Closes the resource (waiting out an attempt in flight); get() then rejects. */
    close(): Promise<void>;
};

/**
 * A resource opened on first use and retried with capped exponential backoff
 * when opening fails, instead of opened at import time. Nothing retries in
 * the background: a failed open only runs again when something asks for it.
 */
export function createLazyResource<T>({
    name,
    open,
    close,
    initialDelayMs = 1_000,
    maxDelayMs = 30_000,
    now = Date.now,
}: LazyResourceOptions<T>): LazyResource<T> {
    let ready: { value: T } | null = null;
    let pending: Promise<T> | null = null;
    let closed = false;
    let failures = 0;
    let retryAt = 0;
    let lastError: unknown;

    const unavailable = () =>
        new ResourceUnavailableError(
            name,
            Math.max(0, retryAt - now()),
            lastError,
        );

    async function attempt(): Promise<T> {
        let value: T;
        try {
            value = await open();
        } catch (error) {
            failures += 1;
            const delay = Math.min(
                initialDelayMs * 2 ** (failures - 1),
                maxDelayMs,
            );
            retryAt = now() + delay;
            lastError = error;
            log.exception('resource_open_failed', error, {
                resource: name,
                failures,
                retryInMs: delay,
            });
            throw unavailable();
        }

        if (closed) {
            // close() ran while this attempt was opening.
            await close(value);
            throw new ResourceUnavailableError(name, 0);
        }

        log.info('resource_opened', { resource: name, attempts: failures + 1 });
        ready = { value };
        failures = 0;
        lastError = undefined;
        return value;
    }

    return {
        get() {
            if (ready) return Promise.resolve(ready.value);
            if (closed) {
                return Promise.reject(new ResourceUnavailableError(name, 0));
            }
            if (pending) return pending;
            if (now() < retryAt) return Promise.reject(unavailable());

            pending = attempt().finally(() => {
                pending = null;
            });
            return pending;
        },

        async close() {
            closed = true;
            await pending?.catch(() => {});
            if (ready) {
                const { value } = ready;
                ready = null;
                await close(value);
            }
        },
    };
}
