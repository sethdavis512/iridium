import type { ReactNode } from 'react';
import { cx } from 'cva.config';
import { Fieldset, FieldsetLegend } from '~/components/ui/fieldset';

export type FieldControlProps = {
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
};

type Props = {
    label: string;
    /** Used to derive the error element id for aria-describedby wiring. */
    name: string;
    error?: string;
    disabled?: boolean;
    className?: string;
    children: ReactNode | ((controlProps: FieldControlProps) => ReactNode);
};

export function Field({
    label,
    name,
    error,
    disabled,
    className,
    children,
}: Props) {
    const errorId = `${name}-error`;
    const controlProps: FieldControlProps = {
        'aria-describedby': error ? errorId : undefined,
        'aria-invalid': error ? true : undefined,
    };

    return (
        <Fieldset
            className={cx('flex flex-col gap-1.5 py-1', className)}
            disabled={disabled}
        >
            <FieldsetLegend className="pb-1.5 text-sm">{label}</FieldsetLegend>
            {typeof children === 'function' ? children(controlProps) : children}
            {error && (
                <p id={errorId} className="text-destructive text-sm">
                    {error}
                </p>
            )}
        </Fieldset>
    );
}
