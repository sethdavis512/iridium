import type { ComponentPropsWithoutRef, Ref } from 'react';
import { cx } from 'cva.config';

/*
 * Token-styled native <select>: keeps uncontrolled <Form> posts working
 * without the items-driven COSS Select. Interactive pickers that warrant
 * the richer listbox should use ~/components/ui/select directly.
 */
type Props = ComponentPropsWithoutRef<'select'> & {
    selectSize?: 'sm' | 'md' | 'lg';
    ref?: Ref<HTMLSelectElement>;
};

const SIZE_CLASSES = {
    sm: 'h-7.5 sm:h-6.5 px-2',
    md: 'h-8.5 sm:h-7.5 px-2.5',
    lg: 'h-9.5 sm:h-8.5 px-3',
} as const;

export function Select({ selectSize = 'md', className, ...rest }: Props) {
    return (
        <select
            className={cx(
                'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/24 dark:bg-input/32 w-full rounded-lg border text-base shadow-xs/5 transition-shadow outline-none focus-visible:ring-[3px] disabled:opacity-64 sm:text-sm',
                SIZE_CLASSES[selectSize],
                className,
            )}
            {...rest}
        />
    );
}
