import { clsx, type ClassValue } from 'clsx';
import { defineConfig } from 'cva/config';
import { twMerge } from 'tailwind-merge';

export const { cva, cx } = defineConfig({
    cx: (...inputs: ClassValue[]) => twMerge(clsx(inputs)),
});
