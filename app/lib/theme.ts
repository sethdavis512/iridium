import { z } from 'zod';

export const themeSchema = z.enum(['light', 'dark', 'system']);

export type Theme = z.infer<typeof themeSchema>;
