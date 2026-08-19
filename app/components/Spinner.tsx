import { cx } from 'cva.config';
import { Spinner as UiSpinner } from '~/components/ui/spinner';

const SIZE_CLASSES = {
    xs: 'size-3',
    sm: 'size-4',
    md: 'size-6',
    lg: 'size-8',
} as const;

type Props = {
    size?: keyof typeof SIZE_CLASSES;
    /** Accessible status text; announce what is loading when it isn't obvious. */
    label?: string;
    className?: string;
};

export function Spinner({ label = 'Loading', size = 'sm', className }: Props) {
    return (
        <UiSpinner
            aria-label={label}
            className={cx(SIZE_CLASSES[size], className)}
        />
    );
}
