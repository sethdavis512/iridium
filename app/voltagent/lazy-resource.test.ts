import { beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '~/lib/logger.server';

import { createLazyResource, ResourceUnavailableError } from './lazy-resource';

type Resource = { id: number };

/** A lazy resource over a scripted `open`, on a clock the test controls. */
function setup(options: { initialDelayMs?: number; maxDelayMs?: number } = {}) {
    let clock = 0;
    let opened = 0;
    const open = vi.fn(async (): Promise<Resource> => ({ id: ++opened }));
    const close = vi.fn();
    const resource = createLazyResource({
        name: 'test_db',
        open,
        close,
        initialDelayMs: 1_000,
        maxDelayMs: 8_000,
        now: () => clock,
        ...options,
    });
    const advance = (ms: number) => {
        clock += ms;
    };
    return { resource, open, close, advance };
}

const refused = () => new Error('connect ECONNREFUSED 127.0.0.1:5433');

/** Rejects `get()` with a ResourceUnavailableError and returns it. */
async function unavailable(promise: Promise<unknown>) {
    const error = await promise.then(
        () => {
            throw new Error('expected get() to reject');
        },
        (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ResourceUnavailableError);
    return error as ResourceUnavailableError;
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(log, 'info').mockImplementation(() => {});
    vi.spyOn(log, 'exception').mockImplementation(() => {});
});

describe('createLazyResource', () => {
    it('opens nothing until the first get()', () => {
        const { open } = setup();

        expect(open).not.toHaveBeenCalled();
    });

    it('opens once and reuses the resource', async () => {
        const { resource, open } = setup();

        const first = await resource.get();
        const second = await resource.get();

        expect(first).toEqual({ id: 1 });
        expect(second).toBe(first);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it('shares one attempt between concurrent callers', async () => {
        const { resource, open } = setup();

        const results = await Promise.all([
            resource.get(),
            resource.get(),
            resource.get(),
        ]);

        expect(open).toHaveBeenCalledTimes(1);
        expect(new Set(results).size).toBe(1);
    });

    it('rejects every concurrent caller of a failed attempt', async () => {
        const { resource, open } = setup();
        open.mockRejectedValueOnce(refused());

        const results = await Promise.allSettled([
            resource.get(),
            resource.get(),
        ]);

        expect(open).toHaveBeenCalledTimes(1);
        for (const result of results) {
            expect(result.status).toBe('rejected');
        }
    });

    it('turns an open failure into ResourceUnavailableError with the cause and a retry delay', async () => {
        const { resource, open } = setup();
        const cause = refused();
        open.mockRejectedValueOnce(cause);

        const error = await unavailable(resource.get());

        expect(error.cause).toBe(cause);
        expect(error.retryAfterMs).toBe(1_000);
        expect(error.message).toBe(
            'test_db is unavailable: connect ECONNREFUSED 127.0.0.1:5433',
        );
        expect(log.exception).toHaveBeenCalledWith(
            'resource_open_failed',
            cause,
            { resource: 'test_db', failures: 1, retryInMs: 1_000 },
        );
    });

    it('fails fast during the backoff delay, then retries and recovers', async () => {
        const { resource, open, advance } = setup();
        open.mockRejectedValueOnce(refused());
        await unavailable(resource.get());

        advance(400);
        const waiting = await unavailable(resource.get());
        expect(waiting.retryAfterMs).toBe(600);
        expect(open).toHaveBeenCalledTimes(1);

        advance(600);
        await expect(resource.get()).resolves.toEqual({ id: 1 });
        expect(open).toHaveBeenCalledTimes(2);
        expect(log.info).toHaveBeenCalledWith('resource_opened', {
            resource: 'test_db',
            attempts: 2,
        });
    });

    it('doubles the delay per consecutive failure up to the cap', async () => {
        const { resource, open, advance } = setup();
        open.mockRejectedValue(refused());

        const delays: number[] = [];
        for (let i = 0; i < 6; i++) {
            const error = await unavailable(resource.get());
            delays.push(error.retryAfterMs);
            advance(error.retryAfterMs);
        }

        expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
        expect(open).toHaveBeenCalledTimes(6);
    });

    it('close() releases the open resource and later get() rejects', async () => {
        const { resource, close, open } = setup();
        const value = await resource.get();

        await resource.close();

        expect(close).toHaveBeenCalledWith(value);
        const error = await unavailable(resource.get());
        expect(error.retryAfterMs).toBe(0);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it('close() during an attempt closes what that attempt opens', async () => {
        const { resource, open, close } = setup();
        let finishOpen!: (value: Resource) => void;
        open.mockImplementationOnce(
            () =>
                new Promise<Resource>((resolve) => {
                    finishOpen = resolve;
                }),
        );

        const inFlight = resource.get();
        const closing = resource.close();
        finishOpen({ id: 99 });

        await unavailable(inFlight);
        await closing;
        expect(close).toHaveBeenCalledWith({ id: 99 });
    });

    it('close() before any use opens nothing', async () => {
        const { resource, open, close } = setup();

        await resource.close();

        expect(open).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });
});
