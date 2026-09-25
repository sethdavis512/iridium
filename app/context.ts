import { createContext, type RouterContextProvider } from 'react-router';
import type { auth } from '~/lib/auth.server';

/** The user shape returned by Better Auth's `getSession().user`. */
export type SessionUser = NonNullable<
    Awaited<ReturnType<typeof auth.api.getSession>>
>['user'];

export const userContext = createContext<SessionUser | null>(null);

/** Per-request correlation id, set by the root `requestIdMiddleware`. */
export const requestIdContext = createContext<string | null>(null);

/**
 * Pull the authenticated user out of route context. Must be called from a
 * loader/action that runs *after* `authMiddleware` — that middleware
 * guarantees a non-null user. Throws if called without the middleware.
 */
export function requireUserFromContext(
    context: Readonly<RouterContextProvider>,
) {
    const user = context.get(userContext);
    if (!user) {
        throw new Response('Unauthorized', { status: 401 });
    }
    return user;
}
