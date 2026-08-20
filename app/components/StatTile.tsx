import type { PropsWithChildren } from 'react';
import { cx } from 'cva.config';

type Props = PropsWithChildren<{
    /** Small muted label above the value. */
    title: string;
    className?: string;
}>;

/** Dashboard stat tile: muted title over a large value. */
export function StatTile({ title, className, children }: Props) {
    return (
        <div
            data-slot="stat"
            className={cx(
                'bg-card border-border flex flex-col gap-1 rounded-xl border px-5 py-4',
                className,
            )}
        >
            <div className="text-muted-foreground text-sm">{title}</div>
            <div className="font-heading text-3xl font-semibold">
                {children}
            </div>
        </div>
    );
}
