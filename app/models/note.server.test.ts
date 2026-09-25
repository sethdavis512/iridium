import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        note: {
            create: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            count: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('~/lib/prisma', () => ({
    default: mockPrisma,
}));

import {
    countNotesByUserId,
    createNote,
    deleteNote,
    getNoteById,
    getNotesByUserId,
    KEYWORD_CANDIDATE_LIMIT,
    searchNotes,
    searchNotesByKeywords,
    updateNote,
} from './note.server';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('createNote', () => {
    it('creates a note with title/content/userId', async () => {
        mockPrisma.note.create.mockResolvedValue({ id: 'n1' });

        await createNote({ title: 'T', content: 'C', userId: 'u1' });

        expect(mockPrisma.note.create).toHaveBeenCalledWith({
            data: { title: 'T', content: 'C', userId: 'u1' },
        });
    });

    it('truncates title to 200 characters', async () => {
        mockPrisma.note.create.mockResolvedValue({});

        const longTitle = 'a'.repeat(500);
        await createNote({ title: longTitle, content: 'C', userId: 'u1' });

        const args = mockPrisma.note.create.mock.calls[0][0];
        expect(args.data.title.length).toBe(200);
    });

    it('truncates content to 10_000 characters', async () => {
        mockPrisma.note.create.mockResolvedValue({});

        const longContent = 'a'.repeat(20_000);
        await createNote({ title: 'T', content: longContent, userId: 'u1' });

        const args = mockPrisma.note.create.mock.calls[0][0];
        expect(args.data.content.length).toBe(10_000);
    });
});

describe('getNotesByUserId', () => {
    it('queries non-deleted notes by userId desc by createdAt', async () => {
        mockPrisma.note.findMany.mockResolvedValue([]);

        await getNotesByUserId('u1');

        expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
            where: { userId: 'u1', deletedAt: null },
            orderBy: { createdAt: 'desc' },
            skip: undefined,
            take: undefined,
        });
    });

    it('passes skip/take for pagination', async () => {
        mockPrisma.note.findMany.mockResolvedValue([]);

        await getNotesByUserId('u1', { skip: 20, take: 10 });

        const args = mockPrisma.note.findMany.mock.calls[0][0];
        expect(args.skip).toBe(20);
        expect(args.take).toBe(10);
    });
});

describe('getNoteById', () => {
    it('excludes soft-deleted notes', async () => {
        mockPrisma.note.findFirst.mockResolvedValue(null);

        await getNoteById('n1');

        expect(mockPrisma.note.findFirst).toHaveBeenCalledWith({
            where: { id: 'n1', deletedAt: null },
        });
    });
});

describe('countNotesByUserId', () => {
    it('counts non-deleted notes for the user', async () => {
        mockPrisma.note.count.mockResolvedValue(0);

        await countNotesByUserId('u1');

        expect(mockPrisma.note.count).toHaveBeenCalledWith({
            where: { userId: 'u1', deletedAt: null },
        });
    });

    it('applies the search filter when a query is given', async () => {
        mockPrisma.note.count.mockResolvedValue(0);

        await countNotesByUserId('u1', 'hello');

        const args = mockPrisma.note.count.mock.calls[0][0];
        expect(args.where.OR).toHaveLength(2);
    });
});

describe('updateNote', () => {
    it('updates title and content with truncation', async () => {
        mockPrisma.note.update.mockResolvedValue({});

        await updateNote({
            noteId: 'n1',
            title: 'a'.repeat(500),
            content: 'C',
        });

        const args = mockPrisma.note.update.mock.calls[0][0];
        expect(args.where).toEqual({ id: 'n1' });
        expect(args.data.title.length).toBe(200);
        expect(args.data.content).toBe('C');
    });
});

describe('deleteNote', () => {
    it('soft deletes by setting deletedAt', async () => {
        mockPrisma.note.update.mockResolvedValue({});

        await deleteNote('n1');

        expect(mockPrisma.note.update).toHaveBeenCalledWith({
            where: { id: 'n1' },
            data: { deletedAt: expect.any(Date) },
        });
    });
});

describe('searchNotes', () => {
    it('searches title and content with case-insensitive contains, scoped to user, excluding deleted', async () => {
        mockPrisma.note.findMany.mockResolvedValue([]);

        await searchNotes({ userId: 'u1', query: 'hello' });

        expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'u1',
                deletedAt: null,
                OR: [
                    { title: { contains: 'hello', mode: 'insensitive' } },
                    { content: { contains: 'hello', mode: 'insensitive' } },
                ],
            },
            orderBy: { createdAt: 'desc' },
            skip: undefined,
            take: undefined,
        });
    });
});

describe('searchNotesByKeywords', () => {
    function note(id: string, title: string, content: string, day: number) {
        return { id, title, content, createdAt: new Date(2026, 0, day) };
    }

    it('queries any keyword in title or content, scoped to the user, excluding deleted', async () => {
        mockPrisma.note.findMany.mockResolvedValue([]);

        await searchNotesByKeywords({
            userId: 'u1',
            text: 'What was that taco recipe?',
            take: 5,
        });

        expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'u1',
                deletedAt: null,
                OR: [
                    { title: { contains: 'taco', mode: 'insensitive' } },
                    { content: { contains: 'taco', mode: 'insensitive' } },
                    { title: { contains: 'recipe', mode: 'insensitive' } },
                    { content: { contains: 'recipe', mode: 'insensitive' } },
                ],
            },
            orderBy: { createdAt: 'desc' },
            take: KEYWORD_CANDIDATE_LIMIT,
        });
    });

    it('matches a note sharing key words but not the full sentence', async () => {
        const tacos = note(
            'n1',
            'Weeknight Tacos',
            'Al pastor recipe with pineapple.',
            1,
        );
        mockPrisma.note.findMany.mockResolvedValue([tacos]);

        const notes = await searchNotesByKeywords({
            userId: 'u1',
            text: 'Can you remind me of the taco recipe I saved last week?',
            take: 5,
        });

        expect(notes).toEqual([tacos]);
    });

    it('drops candidates that only contain a keyword inside another word', async () => {
        const parking = note(
            'n1',
            'Parking spot',
            'Level 3, row C, by the car wash.',
            1,
        );
        const scarf = note('n2', 'Scarf shopping', 'Wool, not cashmere.', 2);
        mockPrisma.note.findMany.mockResolvedValue([scarf, parking]);

        const notes = await searchNotesByKeywords({
            userId: 'u1',
            text: 'Where did I park the car?',
            take: 5,
        });

        expect(notes).toEqual([parking]);
    });

    it('ranks by matched keyword count, then by recency, and applies take', async () => {
        const oldBoth = note('n1', 'Taco night', 'Recipe from Mom', 1);
        const newBoth = note('n2', 'Tacos', 'Fish taco recipe', 3);
        const newest = note('n3', 'Recipe box', 'Soup, bread, pie', 9);
        mockPrisma.note.findMany.mockResolvedValue([newest, newBoth, oldBoth]);

        const notes = await searchNotesByKeywords({
            userId: 'u1',
            text: 'taco recipe',
            take: 2,
        });

        expect(notes.map((n) => n.id)).toEqual(['n2', 'n1']);
    });

    it('runs no query for a message of only stop words', async () => {
        const notes = await searchNotesByKeywords({
            userId: 'u1',
            text: 'Can you tell me what that was about?',
            take: 5,
        });

        expect(notes).toEqual([]);
        expect(mockPrisma.note.findMany).not.toHaveBeenCalled();
    });
});
