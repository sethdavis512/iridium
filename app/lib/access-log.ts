/**
 * Fields for one access-log line, written by the production server
 * (`server.ts`) through `log.info('http_request', ...)`. Pure, so the shape is
 * unit-tested without a server.
 */
export type AccessLogFields = {
    method: string;
    /** Pathname only: the query string can carry tokens (password resets). */
    path: string;
    status: number;
    /** Time until the response headers were ready, in milliseconds. */
    durationMs: number;
    contentLength?: number;
    requestId?: string;
};

/** Set on every app response by `requestIdMiddleware`. */
const REQUEST_ID_HEADER = 'x-request-id';

export function accessLogFields(
    request: Request,
    response: Response,
    durationMs: number,
): AccessLogFields {
    const fields: AccessLogFields = {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Math.round(durationMs * 10) / 10,
    };

    const contentLength = Number(response.headers.get('content-length'));
    if (response.headers.has('content-length') && contentLength >= 0) {
        fields.contentLength = contentLength;
    }

    const requestId = response.headers.get(REQUEST_ID_HEADER);
    if (requestId) fields.requestId = requestId;

    return fields;
}
