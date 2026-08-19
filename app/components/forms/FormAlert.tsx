import { CircleXIcon } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { Alert, AlertAction, AlertTitle } from '~/components/ui/alert';

type Props = PropsWithChildren<{
    message: string | null | undefined;
    className?: string;
}>;

export function FormAlert({ message, className, children }: Props) {
    if (!message) return null;

    return (
        <Alert variant="error" className={className}>
            <CircleXIcon aria-hidden="true" />
            <AlertTitle>{message}</AlertTitle>
            {children && <AlertAction>{children}</AlertAction>}
        </Alert>
    );
}
