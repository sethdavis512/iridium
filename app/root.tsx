import {
    data,
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
} from 'react-router';
import { FileQuestionIcon } from 'lucide-react';

import { getUserFromSession } from './lib/session.server';
import { getUserRole } from './models/user.server';
import { themeCookie } from './lib/cookies.server';
import { useRootData } from './hooks/useRootData';
import type { Route } from './+types/root';

import './app.css';

export const links: Route.LinksFunction = () => [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
    },
    {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:ital,wght@0,100..900;1,100..900&display=swap',
    },
];

export async function loader({ request }: Route.LoaderArgs) {
    const user = await getUserFromSession(request);

    const roleObj = user ? await getUserRole(user?.id) : null;
    const role = roleObj?.role || null;

    const cookieHeader = request.headers.get('Cookie');
    const cookie = (await themeCookie.parse(cookieHeader)) || {};
    const theme = cookie.theme || process.env.DEFAULT_THEME || 'light';

    return {
        role,
        theme,
        user,
    };
}

export async function action({ request }: Route.ActionArgs) {
    const cookieHeader = request.headers.get('Cookie');
    const cookie = (await themeCookie.parse(cookieHeader)) || {};

    return data(null, {
        headers: {
            'Set-Cookie': await themeCookie.serialize({
                ...cookie,
                theme: (await request.formData()).get('theme') as string,
            }),
        },
    });
}

export function Layout({ children }: { children: React.ReactNode }) {
    const data = useRootData();

    return (
        <html
            lang="en"
            className="min-h-screen bg-base-300"
            data-theme={data?.theme || process.env.DEFAULT_THEME || 'light'}
        >
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <Meta />
                <Links />
            </head>
            <body className="min-h-screen">
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return <Outlet />;
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
                : error.statusText || details;
    } else if (import.meta.env.DEV && error && error instanceof Error) {
        details = error.message;
        stack = error.stack;
    }

    return (
        <main className="pt-16 p-4 container mx-auto">
            <div className="mb-8">
                <FileQuestionIcon className="h-12 w-12 text-zinc-400" />
            </div>
            <h1 className="text-6xl font-bold">{message}</h1>
            <p>{details}</p>
            {stack && (
                <pre className="w-full p-4 overflow-x-auto">
                    <code>{stack}</code>
                </pre>
            )}
        </main>
    );
}
