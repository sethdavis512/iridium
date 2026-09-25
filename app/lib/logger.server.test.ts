import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { log, withLogContext } from './logger.server';

describe('logger', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    function lastCall(spy: ReturnType<typeof vi.spyOn>) {
        const args = spy.mock.calls.at(-1);
        return args ? JSON.parse(args[0] as string) : null;
    }

    it('routes info to console.log', () => {
        log.info('thing_happened', { foo: 'bar' });

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();

        const payload = lastCall(logSpy);
        expect(payload.level).toBe('info');
        expect(payload.event).toBe('thing_happened');
        expect(payload.foo).toBe('bar');
        expect(typeof payload.ts).toBe('string');
    });

    it('routes warn to console.warn', () => {
        log.warn('careful', { code: 1 });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        const payload = lastCall(warnSpy);
        expect(payload.level).toBe('warn');
        expect(payload.event).toBe('careful');
        expect(payload.code).toBe(1);
    });

    it('routes error to console.error', () => {
        log.error('boom', { reason: 'x' });

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const payload = lastCall(errorSpy);
        expect(payload.level).toBe('error');
        expect(payload.event).toBe('boom');
        expect(payload.reason).toBe('x');
    });

    it('exception() serializes Error instances with stack', () => {
        const err = new Error('kaboom');
        log.exception('failed', err, { threadId: 't1' });

        const payload = lastCall(errorSpy);
        expect(payload.level).toBe('error');
        expect(payload.event).toBe('failed');
        expect(payload.threadId).toBe('t1');
        expect(payload.error.name).toBe('Error');
        expect(payload.error.message).toBe('kaboom');
        expect(typeof payload.error.stack).toBe('string');
    });

    it('exception() handles non-Error values', () => {
        log.exception('failed', 'just a string');

        const payload = lastCall(errorSpy);
        expect(payload.error).toBe('just a string');
    });

    it('emits valid JSON on every call', () => {
        log.info('a');
        log.warn('b');
        log.error('c');

        for (const spy of [logSpy, warnSpy, errorSpy]) {
            const arg = spy.mock.calls[0][0] as string;
            expect(() => JSON.parse(arg)).not.toThrow();
        }
    });

    it('includes ISO timestamp', () => {
        log.info('ts_check');
        const payload = lastCall(logSpy);
        expect(payload.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('withLogContext() adds its fields to logs across awaits', async () => {
        await withLogContext({ requestId: 'req-1' }, async () => {
            await Promise.resolve();
            log.info('inside');
        });
        log.info('outside');

        const [inside, outside] = logSpy.mock.calls.map((call: unknown[]) =>
            JSON.parse(call[0] as string),
        );
        expect(inside.requestId).toBe('req-1');
        expect(outside.requestId).toBeUndefined();
    });

    it('explicit fields win over context fields', () => {
        withLogContext({ requestId: 'req-1', userId: 'u1' }, () => {
            log.info('override', { requestId: 'req-2' });
        });

        const payload = lastCall(logSpy);
        expect(payload.requestId).toBe('req-2');
        expect(payload.userId).toBe('u1');
    });
});
