import { useCallback, useState } from 'react';
import { useNavigation } from 'react-router';

/**
 * Controlled dialog state for Base UI Dialog/AlertDialog: open flag plus an
 * optional "pending target" (the row a confirm dialog is acting on).
 *
 * Wire `open`/`onOpenChange` to the Dialog root so Esc, backdrop clicks, and
 * the built-in close button all work. `target` is deliberately NOT cleared
 * on close: it must survive a reopen-on-error cycle, and a stale target is
 * harmless because `openDialog(next)` always sets a fresh one.
 */
export function useDialogState<T = void>(options?: {
    /**
     * Holds the dialog open when this is truthy, e.g. a server validation
     * error returned by the action after the submit closed the dialog. The
     * dialog reopens (derived state, no effect) until the user explicitly
     * closes it again or a fresh error value replaces the dismissed one.
     */
    reopenOnError?: unknown;
}) {
    const [openState, setOpenState] = useState(false);
    const [target, setTarget] = useState<T | null>(null);
    // The error value the user has already dismissed; compared by identity
    // so a new error (fresh action data) reopens the dialog again.
    const [dismissedError, setDismissedError] = useState<unknown>(null);

    const reopenOnError = options?.reopenOnError;

    const open =
        openState || Boolean(reopenOnError && reopenOnError !== dismissedError);

    const openDialog = useCallback((next?: T) => {
        if (next !== undefined) setTarget(next);
        setOpenState(true);
    }, []);

    const close = useCallback(() => {
        setOpenState(false);
        setDismissedError(reopenOnError ?? null);
    }, [reopenOnError]);

    const onOpenChange = useCallback(
        (next: boolean) => {
            setOpenState(next);
            if (!next) setDismissedError(reopenOnError ?? null);
        },
        [reopenOnError],
    );

    return { open, onOpenChange, openDialog, close, target };
}

/**
 * The `intent` field of the in-flight form submission, or null when idle.
 * Pairs with the `<input type="hidden" name="intent">` action convention.
 */
export function usePendingIntent() {
    const navigation = useNavigation();

    return navigation.state !== 'idle'
        ? (navigation.formData?.get('intent')?.toString() ?? null)
        : null;
}

/** True while any form submission or loader navigation is in flight. */
export function useIsSubmitting() {
    const navigation = useNavigation();
    return navigation.state !== 'idle';
}
