/**
 * Client-safe type for the dev-only environment banner. Kept separate from
 * env.server.ts (which is server-only) so the banner component can import it
 * without pulling server code into the browser bundle.
 *
 * Only *required* infra vars that are missing/invalid (and so running on a dev
 * placeholder) produce a warning. Optional feature keys degrade gracefully and
 * are intentionally not surfaced in the banner.
 */
export type EnvWarning = {
    /** The environment variable name, e.g. DATABASE_URL. */
    key: string;
    /** Plain-language consequence of the variable running on a placeholder. */
    effect: string;
};
