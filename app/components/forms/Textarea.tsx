import type { ComponentPropsWithoutRef, Ref } from 'react';
import { Textarea as UiTextarea } from '~/components/ui/textarea';

const SIZE_MAP = { sm: 'sm', md: 'default', lg: 'lg' } as const;

type Props = ComponentPropsWithoutRef<'textarea'> & {
    textareaSize?: keyof typeof SIZE_MAP;
    ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({ textareaSize = 'md', ...rest }: Props) {
    return <UiTextarea size={SIZE_MAP[textareaSize]} {...rest} />;
}
