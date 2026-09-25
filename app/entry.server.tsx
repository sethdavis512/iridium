import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';

import type {
    EntryContext,
    HandleErrorFunction,
    RouterContextProvider,
} from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isRouteErrorResponse, ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import { requestIdContext } from '~/context';
import { env } from '~/lib/env.server';
import { log } from '~/lib/logger.server';
import { NonceProvider } from '~/lib/nonce';
import { installGracefulShutdown } from '~/lib/shutdown.server';

export const streamTimeout = 5_000;

const isProduction = env.NODE_ENV === 'production';

// Drain in-flight requests and close the database pools on SIGTERM/SIGINT.
// Production only: the dev server owns its own signal handling.
if (isProduction) installGracefulShutdown();

/**
 * Security headers applied to every document response.
 *
 * Scripts: only same-origin files and inline scripts carrying this request's
 * nonce (React Router's bootstrap and streamed data, React's streaming
 * helpers, and the pre-paint theme script in root.tsx), so an injected
 * inline script cannot run. Styles still allow `'unsafe-inline'` because
 * Tailwind v4 and React Router emit inline styles.
 */
function setSecurityHeaders(headers: Headers, nonce: string) {
    if (isProduction) {
        headers.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains',
        );
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );
    headers.set(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "img-src 'self' data: blob: https://res.cloudinary.com",
            "font-src 'self' https://fonts.gstatic.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            `script-src 'self' 'nonce-${nonce}'`,
            "connect-src 'self'",
            "object-src 'none'",
        ].join('; '),
    );
}

/** Correlation fields for server error logs. The query string is left out
 * because it can carry secrets (e.g. /reset-password?token=...). */
function requestFields(
    request: Request,
    context: Readonly<RouterContextProvider> | undefined,
) {
    return {
        // context is undefined only if React Router fails before creating it.
        requestId: context?.get(requestIdContext) ?? null,
        method: request.method,
        path: new URL(request.url).pathname,
    };
}

/**
 * Errors thrown from loaders, actions, and rendering. Logged as JSON with the
 * request id so they correlate with the request's other log lines. 4xx route
 * errors (e.g. no matching route) are routine traffic, so they log as warnings.
 */
export const handleError: HandleErrorFunction = (
    error,
    { request, context },
) => {
    if (request.signal.aborted) return;

    const fields = requestFields(request, context);

    if (isRouteErrorResponse(error)) {
        if (error.status < 500) {
            log.warn('request_error_response', {
                ...fields,
                status: error.status,
                statusText: error.statusText,
            });
            return;
        }
        // React Router wraps some internal errors; log the underlying one.
        const cause = (error as { error?: unknown }).error;
        log.exception('request_error', cause ?? error, {
            ...fields,
            status: error.status,
        });
        return;
    }

    log.exception('request_error', error, fields);
};

export default function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: RouterContextProvider,
) {
    // Fresh per response so an attacker can never predict it.
    const nonce = randomBytes(16).toString('base64');
    setSecurityHeaders(responseHeaders, nonce);

    if (request.method.toUpperCase() === 'HEAD') {
        return new Response(null, {
            status: responseStatusCode,
            headers: responseHeaders,
        });
    }

    return new Promise((resolve, reject) => {
        let shellRendered = false;
        const userAgent = request.headers.get('user-agent');

        const readyOption: keyof RenderToPipeableStreamOptions =
            (userAgent && isbot(userAgent)) || routerContext.isSpaMode
                ? 'onAllReady'
                : 'onShellReady';

        let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
            () => abort(),
            streamTimeout + 1000,
        );

        const { pipe, abort } = renderToPipeableStream(
            // ServerRouter applies the nonce to React Router's inline scripts
            // and uses it as the default for <Scripts>, <ScrollRestoration>,
            // and <Links>; NonceProvider exposes it to root's theme script.
            <NonceProvider nonce={nonce}>
                <ServerRouter
                    context={routerContext}
                    url={request.url}
                    nonce={nonce}
                />
            </NonceProvider>,
            {
                // React's own inline streaming (Suspense) scripts.
                nonce,
                [readyOption]() {
                    shellRendered = true;
                    const body = new PassThrough({
                        final(callback) {
                            clearTimeout(timeoutId);
                            timeoutId = undefined;
                            callback();
                        },
                    });
                    const stream = createReadableStreamFromReadable(body);

                    responseHeaders.set('Content-Type', 'text/html');

                    pipe(body);

                    resolve(
                        new Response(stream, {
                            headers: responseHeaders,
                            status: responseStatusCode,
                        }),
                    );
                },
                onShellError(error: unknown) {
                    reject(error);
                },
                onError(error: unknown) {
                    responseStatusCode = 500;
                    if (shellRendered) {
                        log.exception(
                            'render_error',
                            error,
                            requestFields(request, loadContext),
                        );
                    }
                },
            },
        );
    });
}
