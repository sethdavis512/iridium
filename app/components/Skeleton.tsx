import { cx } from 'cva.config';
import { Skeleton as UiSkeleton } from '~/components/ui/skeleton';

export function Skeleton({ className }: { className?: string }) {
    return <UiSkeleton className={className} />;
}

export function SkeletonLines({
    count = 3,
    className,
}: {
    count?: number;
    className?: string;
}) {
    return (
        <div
            aria-hidden="true"
            className={cx('flex flex-col gap-2', className)}
        >
            {Array.from({ length: count }, (_, i) => (
                <UiSkeleton key={i} className="h-4 w-full" />
            ))}
        </div>
    );
}
