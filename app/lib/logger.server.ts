/**
 * Tiny structured-JSON logger. No deps.
 *
 * In production, emits one JSON object per line to stdout/stderr so logs can
 * be ingested by any log aggregator that understands NDJSON (Datadog, Loki,
 * CloudWatch, etc.). In development, emits a human-readable single line so
 * the terminal stays scannable.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const logContext = new AsyncLocalStorage<LogFields>();

/**
 * Run `fn` with `fields` (e.g. a request id) attached to every log line
 * emitted inside it, including from awaited async work. Explicit fields
 * passed to a log call win over context fields.
 */
export function withLogContext<T>(fields: LogFields, fn: () => T): T {
    return logContext.run({ ...logContext.getStore(), ...fields }, fn);
}

/**
 * Use JSON format anywhere that's not a developer terminal -- this includes
 * `production` (real deploys) and `test` (so log assertions can JSON.parse).
 */
const useJson = process.env.NODE_ENV !== 'development';

function serializeError(error: unknown): LogFields {
    if (error instanceof Error) {
        return {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
        };
    }

    return { error: String(error) };
}

function replacer(_key: string, value: unknown) {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }
    return value;
}

function formatDev(level: LogLevel, event: string, fields: LogFields) {
    const tag = level === 'error' ? '✗' : level === 'warn' ? '!' : '·';
    const extras = Object.keys(fields).length
        ? ` ${JSON.stringify(fields, replacer)}`
        : '';
    return `${tag} ${level.toUpperCase().padEnd(5)} ${event}${extras}`;
}

function emit(level: LogLevel, event: string, ownFields: LogFields = {}) {
    const fields = { ...logContext.getStore(), ...ownFields };
    const line = useJson
        ? JSON.stringify(
              { ts: new Date().toISOString(), level, event, ...fields },
              replacer,
          )
        : formatDev(level, event, fields);

    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export const log = {
    info(event: string, fields?: LogFields) {
        emit('info', event, fields);
    },
    warn(event: string, fields?: LogFields) {
        emit('warn', event, fields);
    },
    error(event: string, fields?: LogFields) {
        emit('error', event, fields);
    },
    /** Convenience: log an error with structured stack trace. */
    exception(event: string, error: unknown, fields?: LogFields) {
        emit('error', event, { ...serializeError(error), ...fields });
    },
};
