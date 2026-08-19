import type { PropsWithChildren } from 'react';
import { Form } from 'react-router';
import { SearchIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { Button } from '~/components/ui/button';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '~/components/ui/input-group';

type Props = PropsWithChildren<{
    /** Current ?q= value; rendered as the input's defaultValue. */
    query: string;
    placeholder: string;
    /** Accessible name for the search input. */
    inputLabel: string;
    inputSize?: 'sm' | 'md';
    /** Omit for an icon-only input that submits on Enter. */
    submitLabel?: string;
    /** Classes for the input + button group. */
    groupClassName?: string;
    className?: string;
}>;

/**
 * GET search form for ?q= filtering. Extra filter controls (selects, etc.)
 * can be passed as children; they submit with the same form.
 */
export function SearchForm({
    query,
    placeholder,
    inputLabel,
    inputSize = 'md',
    submitLabel,
    groupClassName,
    className,
    children,
}: Props) {
    const input = (
        <InputGroup className="grow">
            <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
                type="search"
                name="q"
                size={inputSize === 'sm' ? 'sm' : 'default'}
                placeholder={placeholder}
                defaultValue={query}
                aria-label={inputLabel}
            />
        </InputGroup>
    );

    return (
        <Form method="GET" role="search" className={className}>
            {submitLabel ? (
                <div className={cx('flex items-center gap-2', groupClassName)}>
                    {input}
                    <Button
                        type="submit"
                        variant="outline"
                        size={inputSize === 'sm' ? 'sm' : 'default'}
                    >
                        {submitLabel}
                    </Button>
                </div>
            ) : (
                input
            )}
            {children}
        </Form>
    );
}
