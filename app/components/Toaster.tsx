import { useEffect } from 'react';
import { toastManager } from '~/components/ui/toast';

export type Toast = {
    type: 'success' | 'error' | 'info';
    message: string;
};

const AUTO_DISMISS_MS = 5_000;

/**
 * Bridges the server flash toast (root loader / toast.server.ts) into the
 * Base UI toast manager. Renders nothing itself; the ToastProvider viewport
 * in root.tsx displays it. The stable id makes back-to-back flashes replace
 * and re-animate the existing toast instead of stacking, so at most one
 * flash is ever on screen (tests query getByRole('status') in strict mode).
 */
export function Toaster({ toast }: { toast: Toast | null }) {
    useEffect(() => {
        if (!toast) return;

        toastManager.add({
            id: 'flash',
            title: toast.message,
            type: toast.type,
            timeout: AUTO_DISMISS_MS,
            // Base UI defaults the root to role="dialog"; flashes are
            // passive announcements, and tests (and screen readers) expect
            // a single role="status" region.
            data: { rootProps: { role: 'status' } },
        });
    }, [toast]);

    return null;
}
