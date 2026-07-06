import { useEffect, useState } from 'react';
import { MenuIcon, PentagonIcon, XIcon } from 'lucide-react';
import { Form, Link, NavLink, useRouteLoaderData } from 'react-router';
import { Container } from '~/components/Container';
import { Header } from '~/components/Header';
import { ThemeToggle } from '~/components/ThemeToggle';
import type { loader as rootLoader } from '~/root';
import { APP_NAME } from '~/config';

const MOBILE_NAV_ID = 'mobile-nav';

export function SiteHeader() {
    const data = useRouteLoaderData<typeof rootLoader>('root');
    const isAuthenticated = Boolean(data?.isAuthenticated);
    const isAdmin = data?.role === 'ADMIN';
    const isImpersonating = Boolean(data?.isImpersonating);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const navItems = [
        { to: '/', label: 'Home' },
        ...(isAuthenticated
            ? [
                  { to: '/dashboard', label: 'Dashboard' },
                  { to: '/chat', label: 'Chat' },
                  { to: '/notes', label: 'Notes' },
                  { to: '/settings', label: 'Settings' },
              ]
            : []),
        ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
    ];

    const closeMenu = () => setIsMenuOpen(false);

    useEffect(() => {
        if (!isMenuOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMenuOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isMenuOpen]);

    return (
        <div>
            {isImpersonating && (
                <div className="alert alert-warning min-h-0 justify-center gap-4 rounded-none py-1.5 text-sm">
                    <span>You are impersonating this account.</span>
                    <Form method="POST" action="/stop-impersonating">
                        <button
                            className="btn btn-xs pointer-coarse:btn-sm"
                            type="submit"
                        >
                            Stop impersonating
                        </button>
                    </Form>
                </div>
            )}
            <Header>
                <a
                    href="#main-content"
                    className="btn btn-sm btn-accent sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
                >
                    Skip to main content
                </a>
                <Container className="px-4">
                    <nav
                        aria-label="Site"
                        className="flex w-full items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                aria-label="Open navigation menu"
                                aria-expanded={isMenuOpen}
                                aria-controls={MOBILE_NAV_ID}
                                className="btn btn-square btn-ghost lg:hidden"
                                onClick={() => setIsMenuOpen((open) => !open)}
                            >
                                <MenuIcon aria-hidden="true" />
                            </button>
                            <Link
                                to="/"
                                className="flex items-center gap-2 font-bold"
                            >
                                <PentagonIcon aria-hidden="true" /> {APP_NAME}
                            </Link>
                        </div>
                        <nav
                            aria-label="Main navigation"
                            className="hidden lg:block"
                        >
                            <ul className="menu menu-horizontal gap-1 p-0">
                                {navItems.map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            className={({ isActive }) =>
                                                isActive
                                                    ? 'menu-active bg-neutral-content/15 font-semibold'
                                                    : ''
                                            }
                                        >
                                            {item.label}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <div className="hidden lg:block">
                                {isAuthenticated ? (
                                    <Form method="POST" action="/logout">
                                        <button className="btn" type="submit">
                                            Logout
                                        </button>
                                    </Form>
                                ) : (
                                    <Link className="btn" to="/login">
                                        Login
                                    </Link>
                                )}
                            </div>
                        </div>
                    </nav>
                </Container>
                {isMenuOpen && (
                    <div className="fixed inset-0 z-30 lg:hidden">
                        <button
                            type="button"
                            aria-label="Close navigation menu"
                            className="absolute inset-0 cursor-default bg-black/50"
                            onClick={closeMenu}
                        />
                        <nav
                            id={MOBILE_NAV_ID}
                            aria-label="Mobile navigation"
                            className="bg-base-200 text-base-content absolute inset-y-0 left-0 w-72 overflow-y-auto p-4"
                        >
                            <div className="mb-2 flex items-center justify-between">
                                <span className="menu-title px-0">
                                    Navigation
                                </span>
                                <button
                                    type="button"
                                    aria-label="Close navigation menu"
                                    className="btn btn-square btn-ghost btn-sm"
                                    onClick={closeMenu}
                                >
                                    <XIcon
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                </button>
                            </div>
                            <ul className="menu w-full gap-1 p-0">
                                {navItems.map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            onClick={closeMenu}
                                            className={({ isActive }) =>
                                                isActive ? 'menu-active' : ''
                                            }
                                        >
                                            {item.label}
                                        </NavLink>
                                    </li>
                                ))}
                                {isAuthenticated ? (
                                    <li>
                                        <Form method="POST" action="/logout">
                                            <button type="submit">
                                                Logout
                                            </button>
                                        </Form>
                                    </li>
                                ) : (
                                    <li>
                                        <Link to="/login" onClick={closeMenu}>
                                            Login
                                        </Link>
                                    </li>
                                )}
                            </ul>
                        </nav>
                    </div>
                )}
            </Header>
        </div>
    );
}
