import { Link, useSearchParams } from 'react-router';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
    Pagination as UiPagination,
    PaginationContent,
    PaginationItem,
} from '~/components/ui/pagination';

type Props = {
    page: number;
    totalPages: number;
    className?: string;
};

export function Pagination({ page, totalPages, className }: Props) {
    const [searchParams] = useSearchParams();

    if (totalPages <= 1) return null;

    const linkTo = (target: number) => {
        const params = new URLSearchParams(searchParams);
        params.set('page', String(target));
        return `?${params.toString()}`;
    };

    return (
        <UiPagination aria-label="Pagination" className={className}>
            <PaginationContent>
                <PaginationItem>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Previous page"
                        disabled={page <= 1}
                        render={
                            page > 1 ? (
                                <Link to={linkTo(page - 1)} />
                            ) : undefined
                        }
                    >
                        <ChevronLeftIcon aria-hidden="true" />
                    </Button>
                </PaginationItem>
                <PaginationItem>
                    <span className="text-muted-foreground px-2 text-sm">
                        Page {page} of {totalPages}
                    </span>
                </PaginationItem>
                <PaginationItem>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Next page"
                        disabled={page >= totalPages}
                        render={
                            page < totalPages ? (
                                <Link to={linkTo(page + 1)} />
                            ) : undefined
                        }
                    >
                        <ChevronRightIcon aria-hidden="true" />
                    </Button>
                </PaginationItem>
            </PaginationContent>
        </UiPagination>
    );
}
