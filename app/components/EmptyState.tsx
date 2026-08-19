import type { LucideIcon } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { cx } from 'cva.config';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '~/components/ui/empty';

type Props = {
    icon?: LucideIcon;
    title: string;
    description?: string;
    className?: string;
};

export function EmptyState({
    icon: Icon,
    title,
    description,
    className,
    children,
}: PropsWithChildren<Props>) {
    return (
        <Empty className={cx('gap-2 p-8 md:py-12', className)}>
            <EmptyHeader>
                {Icon && (
                    <EmptyMedia variant="icon" className="mb-3">
                        <Icon aria-hidden="true" />
                    </EmptyMedia>
                )}
                <EmptyTitle>{title}</EmptyTitle>
                {description && (
                    <EmptyDescription>{description}</EmptyDescription>
                )}
            </EmptyHeader>
            {children && <EmptyContent>{children}</EmptyContent>}
        </Empty>
    );
}
