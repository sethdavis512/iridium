import type { LucideIcon } from 'lucide-react';
import { CheckIcon, LoaderCircleIcon } from 'lucide-react';
import type { PropsWithChildren } from 'react';

export function isToolLoading(state: string) {
    return state === 'input-available' || state === 'input-streaming';
}

export function isToolDone(state: string) {
    return state === 'output-available';
}

type Props = PropsWithChildren<{
    label: string;
    state: string;
    icon?: LucideIcon;
}>;

/**
 * Chrome for agent tool calls in the chat transcript: boxed container with
 * an icon + label row, a spinner while the tool runs, and a check when it
 * finishes. Tool-specific output renders as children.
 */
export function ToolPartShell({ icon: Icon, label, state, children }: Props) {
    return (
        <div className="border-border bg-muted mt-2 rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                <span className="font-medium">{label}</span>
                {isToolLoading(state) && (
                    <LoaderCircleIcon
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                    />
                )}
                {isToolDone(state) && (
                    <CheckIcon
                        className="text-success h-3 w-3"
                        aria-hidden="true"
                    />
                )}
            </div>
            {children}
        </div>
    );
}
