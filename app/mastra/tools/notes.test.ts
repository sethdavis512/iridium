import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userRequestContext } from '../context';

const { getNotesByUserId, searchNotes } = vi.hoisted(() => ({
    getNotesByUserId: vi.fn(),
    searchNotes: vi.fn(),
}));

vi.mock('~/models/note.server', () => ({
    createNote: vi.fn(),
    getNotesByUserId: (...args: unknown[]) => getNotesByUserId(...args),
    searchNotes: (...args: unknown[]) => searchNotes(...args),
}));

import { NOTES_TOOL_LIMIT, listNotesTool, searchNotesTool } from './notes';

type ToolContext = Parameters<NonNullable<typeof listNotesTool.execute>>[1];
/** The run context /api/chat gives every tool call: the signed-in user. */
const context = {
    requestContext: userRequestContext({ userId: 'u1' }),
} as ToolContext;

beforeEach(() => {
    vi.clearAllMocks();
    getNotesByUserId.mockResolvedValue([]);
    searchNotes.mockResolvedValue([]);
});

describe('notes tools', () => {
    it('list_notes returns at most NOTES_TOOL_LIMIT notes', async () => {
        await listNotesTool.execute!({}, context);

        expect(getNotesByUserId).toHaveBeenCalledWith('u1', {
            take: NOTES_TOOL_LIMIT,
        });
    });

    it('search_notes returns at most NOTES_TOOL_LIMIT notes', async () => {
        await searchNotesTool.execute!({ query: 'tacos' }, context);

        expect(searchNotes).toHaveBeenCalledWith({
            userId: 'u1',
            query: 'tacos',
            take: NOTES_TOOL_LIMIT,
        });
    });

    it('refuses to run without a user in the request context', async () => {
        await expect(
            listNotesTool.execute!({}, {} as ToolContext),
        ).rejects.toThrow(/not authenticated/);

        expect(getNotesByUserId).not.toHaveBeenCalled();
    });
});
