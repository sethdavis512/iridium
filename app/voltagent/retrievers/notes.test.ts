import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseMessage, RetrieveOptions } from '@voltagent/core';

const { searchNotes } = vi.hoisted(() => ({ searchNotes: vi.fn() }));

vi.mock('~/models/note.server', () => ({
    searchNotes: (...args: unknown[]) => searchNotes(...args),
}));

import { NotesRetriever, RETRIEVER_NOTE_LIMIT } from './notes';

const options = { userId: 'u1' } as RetrieveOptions;

beforeEach(() => {
    vi.clearAllMocks();
    searchNotes.mockResolvedValue([]);
});

describe('NotesRetriever', () => {
    it('searches with the text parts of array-shaped message content', async () => {
        searchNotes.mockResolvedValue([
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

        expect(searchNotes).toHaveBeenCalledWith({
            userId: 'u1',
            query: 'tacos recipe',
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

        expect(searchNotes).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'weather' }),
        );
    });

    it('accepts string content and plain string input', async () => {
        const retriever = new NotesRetriever();

        await retriever.retrieve(
            [{ role: 'user', content: 'groceries' }],
            options,
        );
        await retriever.retrieve('budget', options);

        expect(searchNotes.mock.calls.map(([args]) => args.query)).toEqual([
            'groceries',
            'budget',
        ]);
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

        expect(searchNotes).not.toHaveBeenCalled();
    });
});
