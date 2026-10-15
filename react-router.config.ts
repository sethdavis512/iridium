import type { Config } from '@react-router/dev/config';
import { actionOriginHosts } from './app/lib/action-origins';

export default {
    ssr: true,
    // The app's public hosts, so form and fetcher actions survive a
    // TLS-terminating proxy (see app/lib/action-origins.ts). Read at build
    // time: the Dockerfile passes the env vars through as build args.
    allowedActionOrigins: actionOriginHosts(process.env),
} satisfies Config;
