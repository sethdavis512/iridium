import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type ToolOptions = Parameters<NonNullable<typeof listNotesTool.execute>>[1];
const options = { userId: 'u1' } as ToolOptions;

beforeEach(() => {
    vi.clearAllMocks();
    getNotesByUserId.mockResolvedValue([]);
    searchNotes.mockResolvedValue([]);
});

describe('notes tools', () => {
    it('list_notes returns at most NOTES_TOOL_LIMIT notes', async () => {
        await listNotesTool.execute!({}, options);

        expect(getNotesByUserId).toHaveBeenCalledWith('u1', {
            take: NOTES_TOOL_LIMIT,
        });
    });

    it('search_notes returns at most NOTES_TOOL_LIMIT notes', async () => {
        await searchNotesTool.execute!({ query: 'tacos' }, options);

        expect(searchNotes).toHaveBeenCalledWith({
            userId: 'u1',
            query: 'tacos',
            take: NOTES_TOOL_LIMIT,
        });
    });
});
