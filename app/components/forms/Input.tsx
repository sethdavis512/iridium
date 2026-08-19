import type { ComponentPropsWithoutRef, Ref } from 'react';
import { Input as UiInput } from '~/components/ui/input';

const SIZE_MAP = { sm: 'sm', md: 'default', lg: 'lg' } as const;

type Props = Omit<ComponentPropsWithoutRef<'input'>, 'size'> & {
    inputSize?: keyof typeof SIZE_MAP;
    ref?: Ref<HTMLInputElement>;
};

export function Input({ inputSize = 'md', ...rest }: Props) {
    return <UiInput size={SIZE_MAP[inputSize]} {...rest} />;
}
