import { PassThrough } from 'node:stream';

import type { EntryContext, RouterContextProvider } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import { env } from '~/lib/env.server';
import { installGracefulShutdown } from '~/lib/shutdown.server';

export const streamTimeout = 5_000;

const isProduction = env.NODE_ENV === 'production';

// Drain in-flight requests and close the database pools on SIGTERM/SIGINT.
// Production only: the dev server owns its own signal handling.
if (isProduction) installGracefulShutdown();

/**
 * Security headers applied to every document response.
 *
 * CSP intentionally allows `'unsafe-inline'` for styles because Tailwind
 * v4 emits inline styles for some features, and React Router injects a
 * tiny inline runtime script. `'self'` covers the rest.
 */
function setSecurityHeaders(headers: Headers) {
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
            // Inline scripts are required for the React Router runtime bootstrap.
            "script-src 'self' 'unsafe-inline'",
            "connect-src 'self'",
            "object-src 'none'",
        ].join('; '),
    );
}

export default function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    _loadContext: RouterContextProvider,
) {
    setSecurityHeaders(responseHeaders);

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
            <ServerRouter context={routerContext} url={request.url} />,
            {
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
                        console.error(error);
                    }
                },
            },
        );
    });
}
