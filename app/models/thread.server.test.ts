import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UIMessage } from 'ai';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        thread: {
            create: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        message: {
            upsert: vi.fn(),
            findFirst: vi.fn(),
            deleteMany: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock('~/lib/prisma', () => ({
    default: mockPrisma,
}));

import {
    createThread,
    deleteThread,
    deleteTrailingAssistantMessages,
    getAllThreadsByUserId,
    getThreadById,
    getThreadMeta,
    saveChat,
    searchThreads,
    updateThreadModel,
    updateThreadTitle,
} from './thread.server';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('createThread', () => {
    it('creates with Untitled title', async () => {
        mockPrisma.thread.create.mockResolvedValue({ id: 't1' });

        await createThread('user-1');

        expect(mockPrisma.thread.create).toHaveBeenCalledWith({
            data: { createdById: 'user-1', title: 'Untitled' },
        });
    });
});

describe('getAllThreadsByUserId', () => {
    it('lists non-deleted threads desc by createdAt without loading messages', async () => {
        mockPrisma.thread.findMany.mockResolvedValue([]);

        await getAllThreadsByUserId('user-1', { take: 51 });

        expect(mockPrisma.thread.findMany).toHaveBeenCalledWith({
            where: { createdById: 'user-1', deletedAt: null },
            select: { id: true, title: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 51,
        });
    });
});

describe('getThreadMeta', () => {
    it('selects only ownership and settings fields, excluding soft-deleted threads', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue(null);

        await getThreadMeta('t1');

        expect(mockPrisma.thread.findFirst).toHaveBeenCalledWith({
            where: { id: 't1', deletedAt: null },
            select: { id: true, createdById: true, title: true, model: true },
        });
    });
});

describe('getThreadById', () => {
    it('queries by id excluding soft-deleted threads', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue(null);

        await getThreadById('t1');

        expect(mockPrisma.thread.findFirst).toHaveBeenCalledWith({
            where: { id: 't1', deletedAt: null },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
    });
});

describe('updateThreadTitle', () => {
    it('updates the title', async () => {
        mockPrisma.thread.update.mockResolvedValue({});

        await updateThreadTitle('t1', 'New Title');

        expect(mockPrisma.thread.update).toHaveBeenCalledWith({
            where: { id: 't1' },
            data: { title: 'New Title' },
        });
    });
});

describe('updateThreadModel', () => {
    it('stores the model on the thread', async () => {
        mockPrisma.thread.update.mockResolvedValue({});

        await updateThreadModel('t1', 'anthropic/claude-sonnet-4-6');

        expect(mockPrisma.thread.update).toHaveBeenCalledWith({
            where: { id: 't1' },
            data: { model: 'anthropic/claude-sonnet-4-6' },
        });
    });
});

describe('searchThreads', () => {
    it('matches title or message content, excluding deleted threads', async () => {
        mockPrisma.thread.findMany.mockResolvedValue([]);

        await searchThreads('u1', 'tacos');

        const args = mockPrisma.thread.findMany.mock.calls[0][0];
        expect(args.where.createdById).toBe('u1');
        expect(args.where.deletedAt).toBeNull();
        expect(args.where.OR).toEqual([
            { title: { contains: 'tacos', mode: 'insensitive' } },
            {
                messages: {
                    some: {
                        content: { contains: 'tacos', mode: 'insensitive' },
                    },
                },
            },
        ]);
        expect(args.select).toEqual({ id: true, title: true, createdAt: true });
        expect(args.take).toBe(50);
    });

    it('honors a custom limit', async () => {
        mockPrisma.thread.findMany.mockResolvedValue([]);

        await searchThreads('u1', 'tacos', { take: 5 });

        expect(mockPrisma.thread.findMany.mock.calls[0][0].take).toBe(5);
    });
});

describe('deleteTrailingAssistantMessages', () => {
    it('deletes assistant messages newer than the last user message', async () => {
        const lastUserAt = new Date('2026-01-01T00:00:00Z');
        mockPrisma.message.findFirst.mockResolvedValue({
            id: 'mu',
            createdAt: lastUserAt,
        });
        mockPrisma.message.deleteMany.mockResolvedValue({ count: 1 });

        await deleteTrailingAssistantMessages('t1');

        expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
            where: {
                threadId: 't1',
                role: 'ASSISTANT',
                createdAt: { gt: lastUserAt },
            },
        });
    });

    it('deletes all assistant messages when no user message exists', async () => {
        mockPrisma.message.findFirst.mockResolvedValue(null);
        mockPrisma.message.deleteMany.mockResolvedValue({ count: 0 });

        await deleteTrailingAssistantMessages('t1');

        expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
            where: { threadId: 't1', role: 'ASSISTANT' },
        });
    });
});

describe('deleteThread', () => {
    it('soft deletes by setting deletedAt', async () => {
        mockPrisma.thread.update.mockResolvedValue({});

        await deleteThread('t1');

        expect(mockPrisma.thread.update).toHaveBeenCalledWith({
            where: { id: 't1' },
            data: { deletedAt: expect.any(Date) },
        });
    });
});

describe('saveChat', () => {
    function makeMessages(): UIMessage[] {
        return [
            {
                id: 'm1',
                role: 'user',
                parts: [{ type: 'text', text: 'hi' }],
            } as UIMessage,
            {
                id: 'm2',
                role: 'assistant',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
        ];
    }

    it('throws when thread does not exist', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue(null);

        await expect(
            saveChat({
                messages: makeMessages(),
                threadId: 't-missing',
                userId: 'u1',
            }),
        ).rejects.toThrow('Thread not found');

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when thread belongs to another user', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'other-user',
            messages: [],
        });

        await expect(
            saveChat({
                messages: makeMessages(),
                threadId: 't1',
                userId: 'u1',
            }),
        ).rejects.toThrow('Forbidden');

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when there are no messages to save', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'u1',
            messages: [],
        });

        await saveChat({ messages: [], threadId: 't1', userId: 'u1' });

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('wraps upserts in a single transaction', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'u1',
            messages: [],
        });
        mockPrisma.$transaction.mockResolvedValue([]);
        mockPrisma.message.upsert.mockReturnValue('upsert-promise');

        await saveChat({
            messages: makeMessages(),
            threadId: 't1',
            userId: 'u1',
        });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        // The argument must be an array of upsert calls (one per message).
        const calls = mockPrisma.$transaction.mock.calls[0][0];
        expect(Array.isArray(calls)).toBe(true);
        expect(calls).toHaveLength(2);
    });

    it('rolls back when the transaction rejects', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'u1',
            messages: [],
        });
        mockPrisma.$transaction.mockRejectedValue(new Error('db down'));

        await expect(
            saveChat({
                messages: makeMessages(),
                threadId: 't1',
                userId: 'u1',
            }),
        ).rejects.toThrow('db down');
    });

    it('serializes parts as JSON in upsert payloads', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'u1',
            messages: [],
        });
        mockPrisma.$transaction.mockResolvedValue([]);
        mockPrisma.message.upsert.mockImplementation((args) => args);

        await saveChat({
            messages: makeMessages(),
            threadId: 't1',
            userId: 'u1',
        });

        const upsertCalls = mockPrisma.message.upsert.mock.calls;
        const userMessageArgs = upsertCalls[0][0];

        expect(userMessageArgs.where).toEqual({ id: 'm1' });
        expect(userMessageArgs.create.role).toBe('USER');
        expect(userMessageArgs.create.userId).toBe('u1');
        expect(JSON.parse(userMessageArgs.create.content)).toEqual([
            { type: 'text', text: 'hi' },
        ]);

        const assistantMessageArgs = upsertCalls[1][0];
        expect(assistantMessageArgs.create.role).toBe('ASSISTANT');
        expect(assistantMessageArgs.create.userId).toBeNull();
    });

    it('looks up only the ids of incoming messages, not the whole thread', async () => {
        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'u1',
            messages: [],
        });
        mockPrisma.$transaction.mockResolvedValue([]);

        await saveChat({
            messages: makeMessages(),
            threadId: 't1',
            userId: 'u1',
        });

        expect(mockPrisma.thread.findFirst).toHaveBeenCalledWith({
            where: { id: 't1', deletedAt: null },
            select: {
                id: true,
                createdById: true,
                messages: {
                    where: { id: { in: ['m1', 'm2'] } },
                    select: { id: true },
                },
            },
        });
    });

    it('does not re-save messages already in the thread (older than the last 2)', async () => {
        const messages: UIMessage[] = [
            {
                id: 'old1',
                role: 'user',
                parts: [{ type: 'text', text: 'old' }],
            } as UIMessage,
            {
                id: 'm1',
                role: 'user',
                parts: [{ type: 'text', text: 'hi' }],
            } as UIMessage,
            {
                id: 'm2',
                role: 'assistant',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
        ];

        mockPrisma.thread.findFirst.mockResolvedValue({
            id: 't1',
            createdById: 'u1',
            // 'old1' already exists in DB.
            messages: [{ id: 'old1' }],
        });
        mockPrisma.$transaction.mockResolvedValue([]);
        mockPrisma.message.upsert.mockImplementation((args) => args);

        await saveChat({ messages, threadId: 't1', userId: 'u1' });

        // Should only upsert the last 2 (m1, m2), not the existing old1.
        expect(mockPrisma.message.upsert).toHaveBeenCalledTimes(2);
        const ids = mockPrisma.message.upsert.mock.calls.map(
            (c) => c[0].where.id,
        );
        expect(ids).toEqual(['m1', 'm2']);
    });
});
