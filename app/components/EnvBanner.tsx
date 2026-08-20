import { useState } from 'react';
import { TriangleAlertIcon, XIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { EnvWarning } from '~/lib/env-status';

/**
 * Dev-only banner listing required environment variables that are missing or
 * invalid and so running on a dev placeholder. Rendered at the very top of the
 * document by root.tsx. Optional feature keys are not shown — they degrade
 * gracefully. The server only passes warnings when `shouldShowEnvBanner` is
 * true (never in production or E2E runs), so this never appears for end users,
 * and it renders nothing when every required var is set.
 */
export function EnvBanner({ warnings }: { warnings: EnvWarning[] }) {
    const [dismissed, setDismissed] = useState(false);

    if (warnings.length === 0 || dismissed) return null;

    const count = warnings.length;
    const summary = `${count} required variable${count === 1 ? '' : 's'} unset — running on dev placeholders, so affected features won't actually work.`;

    return (
        <div
            role="status"
            className="border-warning/25 bg-warning/10 text-foreground border-b"
        >
            <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:gap-4 sm:px-6">
                <span className="bg-warning/20 text-warning mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
                    <TriangleAlertIcon className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">
                            Environment notice
                        </h2>
                        <span className="text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase">
                            dev only
                        </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                        {summary}
                    </p>

                    <ul className="mt-2.5 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {warnings.map((w) => (
                            <li
                                key={w.key}
                                className="flex items-start gap-2 text-xs"
                            >
                                <span
                                    aria-hidden
                                    className="bg-destructive mt-1.5 size-1.5 shrink-0 rounded-full"
                                />
                                <span className="min-w-0 leading-relaxed">
                                    <code className="font-mono font-semibold">
                                        {w.key}
                                    </code>
                                    <span className="text-muted-foreground">
                                        {' '}
                                        — {w.effect}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss environment notice"
                    className="text-muted-foreground hover:text-foreground -mt-1 -mr-2 shrink-0"
                >
                    <XIcon className="size-4" />
                </Button>
            </div>
        </div>
    );
}
