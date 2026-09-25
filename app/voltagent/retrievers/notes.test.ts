import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseMessage, RetrieveOptions } from '@voltagent/core';

const { searchNotesByKeywords } = vi.hoisted(() => ({
    searchNotesByKeywords: vi.fn(),
}));

vi.mock('~/models/note.server', () => ({
    searchNotesByKeywords: (...args: unknown[]) =>
        searchNotesByKeywords(...args),
}));

import { NotesRetriever, RETRIEVER_NOTE_LIMIT } from './notes';

const options = { userId: 'u1' } as RetrieveOptions;

beforeEach(() => {
    vi.clearAllMocks();
    searchNotesByKeywords.mockResolvedValue([]);
});

describe('NotesRetriever', () => {
    it('searches with the text parts of array-shaped message content', async () => {
        searchNotesByKeywords.mockResolvedValue([
            { title: 'Tacos', content: 'Al pastor on Friday' },
        ]);
        const messages: BaseMessage[] = [
            { role: 'user', content: 'an older question' },
            { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'tacos' },
                    {
                        type: 'image',
                        image: new URL('https://example.com/a.png'),
                    },
                    { type: 'text', text: 'recipe' },
                ],
            },
        ];

        const context = await new NotesRetriever().retrieve(messages, options);

        expect(searchNotesByKeywords).toHaveBeenCalledWith({
            userId: 'u1',
            text: 'tacos recipe',
            take: RETRIEVER_NOTE_LIMIT,
        });
        expect(context).toBe('## Tacos\nAl pastor on Friday');
    });

    it('uses the latest user message even when an assistant message is last', async () => {
        await new NotesRetriever().retrieve(
            [
                { role: 'user', content: [{ type: 'text', text: 'weather' }] },
                { role: 'assistant', content: 'It is sunny.' },
            ],
            options,
        );

        expect(searchNotesByKeywords).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'weather' }),
        );
    });

    it('accepts string content and plain string input', async () => {
        const retriever = new NotesRetriever();

        await retriever.retrieve(
            [{ role: 'user', content: 'groceries' }],
            options,
        );
        await retriever.retrieve('budget', options);

        expect(
            searchNotesByKeywords.mock.calls.map(([args]) => args.text),
        ).toEqual(['groceries', 'budget']);
    });

    it('skips the query without a user, or without any user text', async () => {
        const retriever = new NotesRetriever();

        await retriever.retrieve('tacos', {} as RetrieveOptions);
        await retriever.retrieve(
            [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            image: new URL('https://example.com/a.png'),
                        },
                    ],
                },
            ],
            options,
        );

        expect(searchNotesByKeywords).not.toHaveBeenCalled();
    });
});
