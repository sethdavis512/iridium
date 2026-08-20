import type { PropsWithChildren } from 'react';
import type { VariantProps } from 'cva';
import { cva, cx } from 'cva.config';

export const chatBubbleContainerVariants = cva({
    base: 'flex w-full',
    variants: {
        placement: {
            start: 'justify-start',
            end: 'justify-end',
        },
    },
    defaultVariants: {
        placement: 'start',
    },
});

export const chatBubbleVariants = cva({
    base: 'max-w-[85%] rounded-xl px-4 py-2 text-sm sm:max-w-[75%]',
    variants: {
        variant: {
            primary: 'bg-primary text-primary-foreground rounded-br-sm',
            secondary: 'bg-secondary text-secondary-foreground rounded-br-sm',
            accent: 'bg-accent text-accent-foreground rounded-br-sm',
            default: 'bg-muted text-foreground rounded-bl-sm',
        },
    },
    defaultVariants: {
        variant: 'primary',
    },
});

interface ChatBubbleProps
    extends
        VariantProps<typeof chatBubbleContainerVariants>,
        VariantProps<typeof chatBubbleVariants> {}

export function ChatBubble({
    children,
    placement,
    variant,
}: PropsWithChildren<ChatBubbleProps>) {
    const senderLabel = placement === 'end' ? 'You' : 'Assistant';

    return (
        <div
            aria-label={senderLabel}
            className={cx(chatBubbleContainerVariants({ placement }))}
        >
            <div className={cx(chatBubbleVariants({ variant }))}>
                {children}
            </div>
        </div>
    );
}
