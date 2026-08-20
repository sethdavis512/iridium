import { useEffect, useState } from 'react';
import {
    CircleCheckIcon,
    CircleXIcon,
    InfoIcon,
    XIcon,
    type LucideIcon,
} from 'lucide-react';
import { Alert, AlertAction, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';

export type Toast = {
    type: 'success' | 'error' | 'info';
    message: string;
};

const ICONS: Record<Toast['type'], LucideIcon> = {
    success: CircleCheckIcon,
    error: CircleXIcon,
    info: InfoIcon,
};

const AUTO_DISMISS_MS = 5_000;

export function Toaster({ toast }: { toast: Toast | null }) {
    // Track which toast was dismissed (by identity) instead of a visible
    // flag so the effect never sets state synchronously.
    const [dismissed, setDismissed] = useState<Toast | null>(null);

    useEffect(() => {
        if (!toast) return;

        const timer = setTimeout(() => setDismissed(toast), AUTO_DISMISS_MS);

        return () => clearTimeout(timer);
    }, [toast]);

    if (!toast || dismissed === toast) return null;

    const Icon = ICONS[toast.type];

    return (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm">
            <Alert
                role="status"
                variant={toast.type}
                className="bg-popover shadow-lg"
            >
                <Icon aria-hidden="true" />
                <AlertTitle>{toast.message}</AlertTitle>
                <AlertAction>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        className="pointer-coarse:size-8"
                        aria-label="Dismiss notification"
                        onClick={() => setDismissed(toast)}
                    >
                        <XIcon aria-hidden="true" className="size-4" />
                    </Button>
                </AlertAction>
            </Alert>
        </div>
    );
}
