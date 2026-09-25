import { type UIMessage } from 'ai';

import prisma from '~/lib/prisma';

export function createThread(createdById: string) {
    return prisma.thread.create({
        data: {
            createdById,
            title: 'Untitled',
        },
    });
}

/** Default cap on thread lists (the chat sidebar and its search). */
export const THREAD_LIST_LIMIT = 50;

/** Fields a thread list needs: no messages, which can be arbitrarily large. */
const threadListSelect = { id: true, title: true, createdAt: true } as const;

export function getAllThreadsByUserId(
    userId: string,
    { take }: { take?: number } = {},
) {
    return prisma.thread.findMany({
        where: { createdById: userId, deletedAt: null },
        select: threadListSelect,
        orderBy: { createdAt: 'desc' },
        take,
    });
}

export function countThreadsByUserId(userId: string) {
    return prisma.thread.count({
        where: { createdById: userId, deletedAt: null },
    });
}

/**
 * Lean lookup for ownership checks and thread settings. Never loads messages;
 * use getThreadById only when the conversation itself is needed.
 */
export function getThreadMeta(threadId: string) {
    // findFirst, not findUnique: soft-deleted threads must behave as missing.
    return prisma.thread.findFirst({
        where: { id: threadId, deletedAt: null },
        select: { id: true, createdById: true, title: true, model: true },
    });
}

export function getThreadById(threadId: string) {
    // findFirst, not findUnique: soft-deleted threads must behave as missing.
    return prisma.thread.findFirst({
        where: { id: threadId, deletedAt: null },
        include: {
            messages: {
                orderBy: { createdAt: 'asc' },
            },
        },
    });
}

export async function saveChat({
    messages,
    threadId,
    userId,
}: {
    messages: UIMessage[];
    threadId: string;
    userId: string;
}) {
    const thread = await prisma.thread.findFirst({
        where: { id: threadId, deletedAt: null },
        select: {
            id: true,
            createdById: true,
            // Only the ids of incoming messages that are already stored.
            messages: {
                where: { id: { in: messages.map((m) => m.id) } },
                select: { id: true },
            },
        },
    });

    if (!thread) throw new Error('Thread not found');

    if (thread.createdById !== userId) {
        throw new Error('Forbidden: thread does not belong to user');
    }

    const existingIds = new Set(thread.messages.map((m) => m.id));

    // Always save the last 2 (latest exchange) plus any unsaved earlier messages.
    const messagesToSave = messages.filter(
        (msg, i) => i >= messages.length - 2 || !existingIds.has(msg.id),
    );

    if (messagesToSave.length === 0) return;

    // Wrap upserts in a transaction so a mid-loop failure rolls back partial writes.
    await prisma.$transaction(
        messagesToSave.map((msg) => {
            const content = JSON.stringify(msg.parts);

            return prisma.message.upsert({
                where: { id: msg.id },
                update: {
                    content,
                },
                create: {
                    id: msg.id,
                    role: msg.role === 'user' ? 'USER' : 'ASSISTANT',
                    content,
                    threadId: thread.id,
                    userId: msg.role === 'user' ? userId : null,
                },
            });
        }),
    );
}

export function updateThreadTitle(threadId: string, title: string) {
    return prisma.thread.update({
        where: { id: threadId },
        data: { title },
    });
}

export function updateThreadModel(threadId: string, model: string) {
    return prisma.thread.update({
        where: { id: threadId },
        data: { model },
    });
}

/**
 * Search a user's threads by title or message content. Message content is a
 * JSON string of UIMessage parts, so `contains` can false-positive on JSON
 * keys or tool payloads; acceptable for sidebar search.
 */
export function searchThreads(
    userId: string,
    query: string,
    { take = THREAD_LIST_LIMIT }: { take?: number } = {},
) {
    return prisma.thread.findMany({
        where: {
            createdById: userId,
            deletedAt: null,
            OR: [
                { title: { contains: query, mode: 'insensitive' } },
                {
                    messages: {
                        some: {
                            content: { contains: query, mode: 'insensitive' },
                        },
                    },
                },
            ],
        },
        select: threadListSelect,
        orderBy: { createdAt: 'desc' },
        take,
    });
}

/**
 * Hard-delete assistant messages that follow the thread's last user message.
 * Used by regeneration: the deleted rows are immediately replaced by the
 * regenerated response.
 */
export async function deleteTrailingAssistantMessages(threadId: string) {
    const lastUserMessage = await prisma.message.findFirst({
        where: { threadId, role: 'USER' },
        orderBy: { createdAt: 'desc' },
    });

    return prisma.message.deleteMany({
        where: {
            threadId,
            role: 'ASSISTANT',
            ...(lastUserMessage
                ? { createdAt: { gt: lastUserMessage.createdAt } }
                : {}),
        },
    });
}

export function deleteThread(threadId: string) {
    // Soft delete: the row (and its messages) stays for recovery/audit, but
    // every read in this module filters deletedAt: null.
    return prisma.thread.update({
        where: { id: threadId },
        data: { deletedAt: new Date() },
    });
}

/**
 * Hard-delete threads that were soft-deleted more than `olderThanDays` days
 * ago. Messages cascade at the DB level. Called by the purge background job.
 */
export function purgeSoftDeletedThreads(olderThanDays: number) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    return prisma.thread.deleteMany({
        where: { deletedAt: { lt: cutoff } },
    });
}
