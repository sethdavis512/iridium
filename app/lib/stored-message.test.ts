import { describe, expect, it } from 'vitest';

import {
    parseStoredParts,
    serializeParts,
    toStoredRole,
    toUIMessage,
} from './stored-message';

const createdAt = new Date('2026-01-01T00:00:00Z');

describe('stored message format', () => {
    it('round-trips UIMessage parts through the content column', () => {
        const parts = [
            { type: 'text' as const, text: 'hello' },
            { type: 'step-start' as const },
        ];

        expect(parseStoredParts(serializeParts(parts))).toEqual(parts);
    });

    it('reads plain-text content from old rows as one text part', () => {
        expect(parseStoredParts('just text')).toEqual([
            { type: 'text', text: 'just text' },
        ]);
        expect(parseStoredParts('{"not":"an array"}')).toEqual([
            { type: 'text', text: '{"not":"an array"}' },
        ]);
    });

    it('maps roles both ways, showing SYSTEM rows as the assistant', () => {
        expect(toStoredRole('user')).toBe('USER');
        expect(toStoredRole('assistant')).toBe('ASSISTANT');

        expect(
            toUIMessage({
                id: 'm1',
                role: 'SYSTEM',
                content: '[]',
                createdAt,
            }),
        ).toEqual({ id: 'm1', role: 'assistant', parts: [], createdAt });
        expect(
            toUIMessage({ id: 'm2', role: 'USER', content: 'hi', createdAt })
                .role,
        ).toBe('user');
    });
});
