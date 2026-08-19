import { useEffect } from 'react';
import {
    data,
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useRouteLoaderData,
} from 'react-router';
import { getSessionInfo } from '~/models/session.server';
import { getTheme } from '~/lib/theme.server';
import { getToast } from '~/lib/toast.server';
import { envWarnings, shouldShowEnvBanner } from '~/lib/env.server';
import { Toaster } from '~/components/Toaster';
import { ToastProvider, AnchoredToastProvider } from '~/components/ui/toast';
import { EnvBanner } from '~/components/EnvBanner';
import type { Route } from './+types/root';

import './app.css';

export async function loader({ request }: Route.LoaderArgs) {
    const [session, theme, { toast, headers }] = await Promise.all([
        getSessionInfo(request),
        getTheme(request),
        getToast(request),
    ]);

    return data(
        {
            isAuthenticated: Boolean(session?.user),
            // Better Auth's types omit role even though the admin plugin
            // populates it; used to show the Admin nav item.
            role:
                (session?.user as { role?: string | null } | undefined)?.role ??
                null,
            isImpersonating: Boolean(session?.session.impersonatedBy),
            theme,
            toast,
            // Dev-only: surfaces unset env vars in a top banner. Empty in
            // production and during E2E runs so it never reaches end users.
            envWarnings: shouldShowEnvBanner ? envWarnings : [],
        },
        // Clears the consumed toast flash cookie.
        { headers },
    );
}

export function Layout({ children }: { children: React.ReactNode }) {
    // useRouteLoaderData (not props): Layout also wraps ErrorBoundary, where
    // loader data may be unavailable, so it must tolerate undefined.
    const loaderData = useRouteLoaderData<typeof loader>('root');
    const theme = loaderData?.theme ?? 'system';
    const bannerWarnings = loaderData?.envWarnings ?? [];

    // Pre-paint: only "system" needs JS. Explicit "dark" is already in the
    // SSR payload as class="dark", so there is never a theme flash.
    const themeScript = `(function(){try{if(${JSON.stringify(
        theme,
    )}==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}})()`;

    return (
        <html
            lang="en"
            className={theme === 'dark' ? 'dark h-full' : 'h-full'}
            // TRANSITIONAL shim: keeps DaisyUI themes rendering on
            // unconverted screens during the COSS UI migration. Removed
            // with the daisyui plugin in the final cleanup phase.
            data-theme={
                theme === 'system'
                    ? undefined
                    : theme === 'dark'
                      ? 'dracula'
                      : 'emerald'
            }
            // The inline script may add .dark before hydration ("system").
            suppressHydrationWarning
        >
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <Meta />
                <Links />
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body className="relative h-full">
                {/* isolate: Base UI portals stack above page content. */}
                <div className="relative isolate flex min-h-svh flex-col">
                    <EnvBanner warnings={bannerWarnings} />
                    {children}
                </div>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App({ loaderData }: Route.ComponentProps) {
    // Hydration beacon: lets E2E tests wait for interactivity before
    // clicking React-bound controls (html[data-hydrated]).
    useEffect(() => {
        document.documentElement.dataset.hydrated = 'true';
    }, []);

    return (
        <ToastProvider>
            <AnchoredToastProvider>
                <Outlet />
                <Toaster toast={loaderData.toast} />
            </AnchoredToastProvider>
        </ToastProvider>
    );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    let message = 'Oops!';
    let details = 'An unexpected error occurred.';
    let stack: string | undefined;

    if (isRouteErrorResponse(error)) {
        message = error.status === 404 ? '404' : 'Error';
        details =
            error.status === 404
                ? 'The requested page could not be found.'
                : (typeof error.data === 'string' && error.data) ||
                  error.statusText ||
                  details;
    } else if (import.meta.env.DEV && error && error instanceof Error) {
        details = error.message;
        stack = error.stack;
    }

    return (
        <main role="alert" className="container mx-auto p-4 pt-16">
            <h1>{message}</h1>
            <p>{details}</p>
            {stack && (
                <pre className="w-full overflow-x-auto p-4">
                    <code>{stack}</code>
                </pre>
            )}
        </main>
    );
}
