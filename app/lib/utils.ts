import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class merger for copy-owned COSS UI components in app/components/ui/. */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
