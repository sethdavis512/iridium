import type { MiddlewareFunction } from 'react-router';
import { requestIdContext } from '~/context';
import { withLogContext } from '~/lib/logger.server';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Accept upstream ids only if they are short and log-safe. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Reuse a well-formed incoming id (so upstream logs line up), else mint one. */
export function resolveRequestId(incoming: string | null): string {
    return incoming && VALID_REQUEST_ID.test(incoming)
        ? incoming
        : crypto.randomUUID();
}

function withRequestIdHeader(response: Response, requestId: string) {
    try {
        response.headers.set(REQUEST_ID_HEADER, requestId);
        return response;
    } catch {
        // Some responses (e.g. Response.redirect()) have immutable headers.
        const headers = new Headers(response.headers);
        headers.set(REQUEST_ID_HEADER, requestId);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
}

/**
 * Assigns every request a correlation id: stored in `requestIdContext` (for
 * handleError and loaders), attached to every log line emitted while the
 * request runs, and echoed back as the `x-request-id` response header.
 */
export const requestIdMiddleware: MiddlewareFunction<Response> = async (
    { request, context },
    next,
) => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    context.set(requestIdContext, requestId);
    const response = await withLogContext({ requestId }, next);
    return withRequestIdHeader(response, requestId);
};
