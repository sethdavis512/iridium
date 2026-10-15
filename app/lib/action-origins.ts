/**
 * Hosts React Router accepts action submissions from (`allowedActionOrigins`
 * in react-router.config.ts), on top of request.url's own origin.
 *
 * React Router compares the Origin header with request.url's full origin,
 * scheme included. react-router-serve builds request.url from the socket
 * (Express without `trust proxy`), so behind a TLS-terminating proxy such as
 * Railway's it is http:// while the browser sends `Origin: https://...`, and
 * every form and fetcher action answers 400. Listing the app's own public
 * hosts (BETTER_AUTH_BASE_URL plus BETTER_AUTH_TRUSTED_ORIGINS) lets those
 * same-site submissions through without trusting any other site.
 *
 * React Router reads this at build time, so the Dockerfile declares both vars
 * as build args. Pure (no server imports) so react-router.config.ts can load it.
 */
export function actionOriginHosts(
    env: Record<string, string | undefined>,
): string[] {
    const origins = [
        env.BETTER_AUTH_BASE_URL,
        ...(env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',') ?? []),
    ];
    const hosts = origins.flatMap((origin) => {
        const value = origin?.trim();
        if (!value) return [];
        try {
            return [new URL(value).host];
        } catch {
            return [];
        }
    });
    return [...new Set(hosts)];
}
