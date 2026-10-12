import type { MastraDBMessage } from '@mastra/core/agent';
import type { ProcessInputArgs } from '@mastra/core/processors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userRequestContext } from '../context';

const { searchNotesByKeywords } = vi.hoisted(() => ({
    searchNotesByKeywords: vi.fn(),
}));

vi.mock('~/models/note.server', () => ({
    searchNotesByKeywords: (...args: unknown[]) =>
        searchNotesByKeywords(...args),
}));

import {
    buildNotesContext,
    latestUserText,
    notesContext,
    RETRIEVER_NOTE_LIMIT,
} from './notes-context';

function message(
    role: 'user' | 'assistant',
    parts: MastraDBMessage['content']['parts'],
): MastraDBMessage {
    return {
        id: `${role}-${Math.random()}`,
        role,
        createdAt: new Date(),
        content: { format: 2, parts },
    };
}

function text(role: 'user' | 'assistant', value: string) {
    return message(role, [{ type: 'text', text: value }]);
}

/** processInput's arguments, as far as the processor reads them. */
function inputArgs(
    messages: MastraDBMessage[],
    userId?: string,
): ProcessInputArgs {
    return {
        messages,
        systemMessages: [{ role: 'system', content: 'base instructions' }],
        requestContext: userId ? userRequestContext({ userId }) : undefined,
    } as unknown as ProcessInputArgs;
}

beforeEach(() => {
    vi.clearAllMocks();
    searchNotesByKeywords.mockResolvedValue([]);
});

describe('latestUserText', () => {
    it('joins the text parts of the latest user message', () => {
        const messages = [
            text('user', 'an older question'),
            text('assistant', 'reply'),
            message('user', [
                { type: 'text', text: 'tacos' },
                { type: 'file', mimeType: 'image/png', data: 'a' },
                { type: 'text', text: 'recipe' },
            ]),
        ];

        expect(latestUserText(messages)).toBe('tacos recipe');
    });

    it('uses the latest user message even when an assistant message is last', () => {
        expect(
            latestUserText([
                text('user', 'weather'),
                text('assistant', 'It is sunny.'),
            ]),
        ).toBe('weather');
    });

    it('is empty without a user message or without user text', () => {
        expect(latestUserText([text('assistant', 'hi')])).toBe('');
        expect(
            latestUserText([
                message('user', [
                    { type: 'file', mimeType: 'image/png', data: 'a' },
                ]),
            ]),
        ).toBe('');
    });
});

describe('buildNotesContext', () => {
    it('searches by keyword and formats the matches as markdown', async () => {
        searchNotesByKeywords.mockResolvedValue([
            { title: 'Tacos', content: 'Al pastor on Friday' },
        ]);

        await expect(buildNotesContext('u1', 'tacos recipe')).resolves.toBe(
            '## Tacos\nAl pastor on Friday',
        );
        expect(searchNotesByKeywords).toHaveBeenCalledWith({
            userId: 'u1',
            text: 'tacos recipe',
            take: RETRIEVER_NOTE_LIMIT,
        });
    });

    it('skips the query without a user, or without any text', async () => {
        await expect(buildNotesContext(undefined, 'tacos')).resolves.toBe('');
        await expect(buildNotesContext('u1', '   ')).resolves.toBe('');

        expect(searchNotesByKeywords).not.toHaveBeenCalled();
    });
});

describe('notesContext processor', () => {
    it('appends the matching notes as a system message', async () => {
        searchNotesByKeywords.mockResolvedValue([
            { title: 'Tacos', content: 'Al pastor on Friday' },
        ]);
        const args = inputArgs([text('user', 'tacos')], 'u1');

        const result = await notesContext.processInput(args);

        expect(result.messages).toBe(args.messages);
        expect(result.systemMessages).toEqual([
            { role: 'system', content: 'base instructions' },
            {
                role: 'system',
                content: expect.stringContaining(
                    '## Tacos\nAl pastor on Friday',
                ),
            },
        ]);
    });

    it('leaves the prompt alone when nothing matches', async () => {
        const args = inputArgs([text('user', 'tacos')], 'u1');

        const result = await notesContext.processInput(args);

        expect(result.systemMessages).toEqual(args.systemMessages);
    });

    it('runs no query without a signed-in user in the request context', async () => {
        await notesContext.processInput(inputArgs([text('user', 'tacos')]));

        expect(searchNotesByKeywords).not.toHaveBeenCalled();
    });
});
