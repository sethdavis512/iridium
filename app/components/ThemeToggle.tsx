import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useFetcher, useRouteLoaderData } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import type { Theme } from '~/lib/theme';
import type { loader as rootLoader } from '~/root';
import { Button } from '~/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '~/components/ui/menu';

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: MonitorIcon },
];

export function ThemeToggle() {
    const fetcher = useFetcher();
    const data = useRouteLoaderData<typeof rootLoader>('root');

    // Optimistic: show the submitted theme before the cookie round-trips.
    const theme =
        (fetcher.formData?.get('theme') as Theme | undefined) ??
        data?.theme ??
        'system';
    const ActiveIcon =
        OPTIONS.find((option) => option.value === theme)?.icon ?? MonitorIcon;

    return (
        <Menu>
            <MenuTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Change theme"
                    />
                }
            >
                <ActiveIcon aria-hidden="true" className="size-5" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-36">
                {OPTIONS.map(({ value, label, icon: Icon }) => (
                    <MenuItem
                        key={value}
                        className={
                            value === theme ? 'bg-accent font-medium' : ''
                        }
                        onClick={() =>
                            fetcher.submit(
                                { theme: value },
                                { method: 'POST', action: '/api/theme' },
                            )
                        }
                    >
                        <Icon aria-hidden="true" className="size-4" />
                        {label}
                    </MenuItem>
                ))}
            </MenuPopup>
        </Menu>
    );
}
