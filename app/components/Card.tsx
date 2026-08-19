import type { VariantProps } from 'cva';
import { cva, cx } from 'cva.config';
import type { PropsWithChildren } from 'react';
import { Card as UiCard } from '~/components/ui/card';

export const cardVariants = cva({
    base: '',
    variants: {
        variant: {
            darken: 'bg-background',
            darker: 'bg-card',
            darkest: 'bg-muted',
        },
        bordered: {
            // UiCard is bordered by default; this variant is kept for
            // call-site compatibility.
            true: '',
        },
    },
    defaultVariants: {
        variant: 'darker',
    },
});

type Props = VariantProps<typeof cardVariants> & {
    className?: string;
    title?: string;
};

export function Card({
    bordered,
    title,
    children,
    className,
    variant,
}: PropsWithChildren<Props>) {
    return (
        <UiCard className={cx(cardVariants({ bordered, variant, className }))}>
            <div className="flex min-h-0 flex-col gap-3 p-5">
                {title && (
                    <h2 className="font-heading text-lg font-semibold">
                        {title}
                    </h2>
                )}
                {children}
            </div>
        </UiCard>
    );
}
