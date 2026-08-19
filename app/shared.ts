import { cx } from 'cva.config';
import type { NavLinkRenderProps } from 'react-router';

export const listItemClassName = `bg-card border border-border flex gap-2 py-3 px-4 rounded-lg`;

export const navLinkClassName = ({ isActive }: NavLinkRenderProps) =>
    cx(listItemClassName, isActive && 'bg-primary/8 border-primary/24');
