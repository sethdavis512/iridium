/**
 * Production HTTP server, in place of react-router-serve (which hard-codes
 * morgan's plain-text access log). Built by `bun run build` into
 * build/serve.js and run with Node (Dockerfile CMD, `.railway/railway.ts`
 * start command, `bun run start`).
 *
 * Like react-router-serve it serves build/client (fingerprinted /assets with
 * a one-year immutable cache), compresses responses, and listens on PORT
 * (default 3000) and HOST. Each request the app handles is logged as one JSON
 * line through `log`, carrying the `requestId` the app's other lines have.
 * Graceful shutdown needs nothing here: `installGracefulShutdown()` finds
 * this http.Server through Node's diagnostics channels.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import type { ServerBuild } from 'react-router';
import { accessLogFields } from '~/lib/access-log';
import { log } from '~/lib/logger.server';

// Set before React loads: it picks its production or development build from
// NODE_ENV on first import, so react-router is imported only after this.
process.env.NODE_ENV ??= 'production';
const { createRequestHandler } = await import('react-router');

// This file is bundled to build/serve.js, next to React Router's output.
const buildDir = import.meta.dirname;
const clientDir = join(buildDir, 'client');
const build = (await import(
    pathToFileURL(join(buildDir, 'server/index.js')).href
)) as ServerBuild;
const handleRequest = createRequestHandler(build, process.env.NODE_ENV);

const app = new Hono();

app.use(compress());
app.use(
    '/assets/*',
    serveStatic({
        root: clientDir,
        onFound: (_path, c) => {
            c.header('Cache-Control', 'public, max-age=31536000, immutable');
        },
    }),
);
app.use(serveStatic({ root: clientDir }));

app.all('*', async (c) => {
    const start = performance.now();
    const response = await handleRequest(c.req.raw);
    log.info(
        'http_request',
        accessLogFields(c.req.raw, response, performance.now() - start),
    );
    return response;
});

app.onError((error, c) => {
    log.exception('http_request_failed', error, {
        method: c.req.method,
        path: c.req.path,
    });
    return c.text('Internal Server Error', 500);
});

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port, hostname: process.env.HOST }, () => {
    log.info('server_listening', { port });
});
