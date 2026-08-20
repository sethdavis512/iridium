import { useState } from 'react';
import { MenuIcon, PentagonIcon } from 'lucide-react';
import { Form, Link, NavLink, useRouteLoaderData } from 'react-router';
import { cx } from 'cva.config';
import { Container } from '~/components/Container';
import { ThemeToggle } from '~/components/ThemeToggle';
import { Button } from '~/components/ui/button';
import {
    Sheet,
    SheetHeader,
    SheetPanel,
    SheetPopup,
    SheetTitle,
    SheetTrigger,
} from '~/components/ui/sheet';
import type { loader as rootLoader } from '~/root';
import { APP_NAME } from '~/config';

const MOBILE_NAV_ID = 'mobile-nav';

const desktopNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
    cx(
        'rounded-lg px-3 py-1.5 text-sm transition-colors',
        isActive ? 'bg-accent font-semibold' : 'hover:bg-accent/60',
    );

const mobileNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
    cx(
        'block rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
            ? 'bg-accent font-semibold'
            : 'hover:bg-accent text-foreground',
    );

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

    return (
        <div>
            {isImpersonating && (
                <div className="bg-warning text-warning-foreground flex min-h-0 items-center justify-center gap-4 py-1.5 text-sm">
                    <span>You are impersonating this account.</span>
                    <Form method="POST" action="/stop-impersonating">
                        <Button
                            type="submit"
                            variant="outline"
                            size="xs"
                            className="pointer-coarse:h-8"
                        >
                            Stop impersonating
                        </Button>
                    </Form>
                </div>
            )}
            <header className="bg-card text-foreground flex min-h-16 items-center border-b">
                <a
                    href="#main-content"
                    className="bg-primary text-primary-foreground sr-only rounded-lg px-3 py-1.5 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
                >
                    Skip to main content
                </a>
                <Container className="px-4">
                    <nav
                        aria-label="Site"
                        className="flex w-full items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-2">
                            <Sheet
                                open={isMenuOpen}
                                onOpenChange={setIsMenuOpen}
                            >
                                <SheetTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Open navigation menu"
                                            aria-controls={MOBILE_NAV_ID}
                                            className="lg:hidden"
                                        />
                                    }
                                >
                                    <MenuIcon aria-hidden="true" />
                                </SheetTrigger>
                                <SheetPopup
                                    side="left"
                                    closeProps={{
                                        'aria-label': 'Close navigation menu',
                                    }}
                                >
                                    <SheetHeader>
                                        <SheetTitle>Navigation</SheetTitle>
                                    </SheetHeader>
                                    <SheetPanel>
                                        <nav
                                            id={MOBILE_NAV_ID}
                                            aria-label="Mobile navigation"
                                        >
                                            <ul className="flex flex-col gap-1">
                                                {navItems.map((item) => (
                                                    <li key={item.to}>
                                                        <NavLink
                                                            to={item.to}
                                                            onClick={closeMenu}
                                                            className={
                                                                mobileNavLinkClassName
                                                            }
                                                        >
                                                            {item.label}
                                                        </NavLink>
                                                    </li>
                                                ))}
                                                {isAuthenticated ? (
                                                    <li>
                                                        <Form
                                                            method="POST"
                                                            action="/logout"
                                                        >
                                                            <button
                                                                type="submit"
                                                                className="hover:bg-accent block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
                                                            >
                                                                Logout
                                                            </button>
                                                        </Form>
                                                    </li>
                                                ) : (
                                                    <li>
                                                        <Link
                                                            to="/login"
                                                            onClick={closeMenu}
                                                            className="hover:bg-accent block rounded-lg px-3 py-2 text-sm transition-colors"
                                                        >
                                                            Login
                                                        </Link>
                                                    </li>
                                                )}
                                            </ul>
                                        </nav>
                                    </SheetPanel>
                                </SheetPopup>
                            </Sheet>
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
                            <ul className="flex items-center gap-1">
                                {navItems.map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            className={desktopNavLinkClassName}
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
                                        <Button type="submit" variant="outline">
                                            Logout
                                        </Button>
                                    </Form>
                                ) : (
                                    <Button
                                        variant="outline"
                                        render={<Link to="/login" />}
                                    >
                                        Login
                                    </Button>
                                )}
                            </div>
                        </div>
                    </nav>
                </Container>
            </header>
        </div>
    );
}
