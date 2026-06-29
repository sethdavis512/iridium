import { useState } from 'react';
import { TriangleAlertIcon, XIcon } from 'lucide-react';
import type { EnvWarning } from '~/lib/env-status';

/**
 * Dev-only banner listing unset/placeholdered environment variables so a
 * developer can see at a glance what isn't configured. Rendered at the very
 * top of the document by root.tsx. The server only passes warnings when
 * `shouldShowEnvBanner` is true (never in production or E2E runs), so this
 * never appears for end users.
 */
export function EnvBanner({ warnings }: { warnings: EnvWarning[] }) {
    const [dismissed, setDismissed] = useState(false);

    if (warnings.length === 0 || dismissed) return null;

    // Required (placeholdered infra) first — these are the ones that actually
    // break things; optional feature gaps follow.
    const sorted = [...warnings].sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
    );
    const requiredCount = sorted.filter((w) => w.severity === 'error').length;

    const summary =
        requiredCount > 0
            ? `${requiredCount} required var${requiredCount === 1 ? '' : 's'} missing — running on dev placeholders.`
            : `${sorted.length} optional integration${sorted.length === 1 ? '' : 's'} unconfigured — the app is running with safe fallbacks.`;

    return (
        <div
            role="status"
            className="border-warning/25 bg-warning/10 text-base-content border-b"
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
                        <span className="text-base-content/50 text-[0.65rem] font-semibold tracking-wider uppercase">
                            dev only
                        </span>
                    </div>
                    <p className="text-base-content/60 mt-0.5 text-xs">
                        {summary}
                    </p>

                    <ul className="mt-2.5 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {sorted.map((w) => (
                            <li
                                key={w.key}
                                className="flex items-start gap-2 text-xs"
                            >
                                <span
                                    aria-hidden
                                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                                        w.severity === 'error'
                                            ? 'bg-error'
                                            : 'bg-warning'
                                    }`}
                                />
                                <span className="min-w-0 leading-relaxed">
                                    <span className="sr-only">
                                        {w.severity === 'error'
                                            ? 'Required: '
                                            : 'Optional: '}
                                    </span>
                                    <code className="font-mono font-semibold">
                                        {w.key}
                                    </code>
                                    <span className="text-base-content/55">
                                        {' '}
                                        — {w.effect}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss environment notice"
                    className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content -mt-1 -mr-2 shrink-0"
                >
                    <XIcon className="size-4" />
                </button>
            </div>
        </div>
    );
}
