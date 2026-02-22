import type { User } from 'better-auth';
import { Button } from '../actions/Button';
import { XIcon } from 'lucide-react';
import { TabContent, TabRadio, Tabs } from '../navigation/Tabs';
import { ThemeSwitcher } from './ThemeSwitcher';
import { Link } from 'react-router';
import { Paths } from '~/constants';

interface AdminPanelProps {
    drawerActions: {
        closeDrawer: () => void;
    };
    theme: string;
    user: User | null;
}

export function AdminPanel({ drawerActions, theme, user }: AdminPanelProps) {
    return (
        <>
            <div className="flex justify-end">
                <Button circle onClick={drawerActions.closeDrawer}>
                    <XIcon />
                </Button>
            </div>
            <div className="space-y-4">
                <h2 className="text-xl font-semibold ">Admin Panel</h2>
                <p>
                    Logged in as{' '}
                    <strong>{user?.email || 'Unknown User'}</strong>
                </p>
                <h3 className="text-lg font-semibold ">Settings</h3>
                <p>Customize application settings.</p>
                <Tabs variant="lift">
                    <TabRadio name="my_tabs" label="Theme" defaultChecked />
                    <TabContent className="bg-base-100 border-base-300 p-6">
                        <p className="mb-4">
                            Select the theme to temporarily apply to the
                            application interface.
                        </p>
                        <ThemeSwitcher selectedTheme={theme} />
                    </TabContent>
                </Tabs>
                <h3 className="text-lg font-semibold ">Forms</h3>
                <p>
                    <Link className="link" to={Paths.FORMS}>
                        View the Forms page to see user experience
                    </Link>
                </p>
                <h3 className="text-lg font-semibold ">Components</h3>
                <p>
                    <Link className="link" to={Paths.DESIGN}>
                        View more components on the design page
                    </Link>
                </p>
            </div>
        </>
    );
}
