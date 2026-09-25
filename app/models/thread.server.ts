import { type UIMessage } from 'ai';

import { log } from '~/lib/logger.server';
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

    // Message ids come from the client. An id that already exists outside this
    // thread must never be upserted, or a request could overwrite (and move)
    // another thread's message.
    const foreignIds = new Set(
        (
            await prisma.message.findMany({
                where: {
                    id: { in: messages.map((m) => m.id) },
                    NOT: { threadId: thread.id },
                },
                select: { id: true },
            })
        ).map((m) => m.id),
    );

    if (foreignIds.size > 0) {
        log.warn('save_chat_foreign_message_ids', {
            threadId: thread.id,
            userId,
            count: foreignIds.size,
        });
    }

    // Always save the last 2 (latest exchange) plus any unsaved earlier messages.
    const messagesToSave = messages.filter(
        (msg, i) =>
            !foreignIds.has(msg.id) &&
            (i >= messages.length - 2 || !existingIds.has(msg.id)),
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

/** The title every thread starts with, until one is generated for it. */
const UNTITLED_TITLE = 'Untitled';

const TITLE_BACKFILL_BATCH_SIZE = 100;

/** Stored message content: JSON UIMessage parts, or plain text in old rows. */
function parseMessageParts(content: string): UIMessage['parts'] {
    try {
        const parts = JSON.parse(content);
        if (Array.isArray(parts)) return parts;
    } catch {
        // Not JSON: plain-text content.
    }

    return [{ type: 'text', text: content }];
}

/**
 * Title non-deleted threads still called "Untitled" from their first user
 * message, using `buildTitle` (the fallback title of failed title
 * generation). Idempotent: only "Untitled" threads are read or written, and
 * a thread whose first user message has no text stays untitled so its next
 * reply titles it. With `dryRun`, returns the titles without writing them.
 */
export async function backfillUntitledThreadTitles({
    buildTitle,
    dryRun = false,
}: {
    buildTitle: (messages: UIMessage[]) => string;
    dryRun?: boolean;
}) {
    const titled: Array<{ threadId: string; title: string }> = [];
    let skipped = 0;
    let afterId: string | undefined;

    for (;;) {
        // Keyset pagination by id: skipped (and, in a dry run, all) threads
        // stay "Untitled", so an offset or re-query would loop over them.
        const threads = await prisma.thread.findMany({
            where: {
                title: UNTITLED_TITLE,
                deletedAt: null,
                ...(afterId ? { id: { gt: afterId } } : {}),
            },
            select: {
                id: true,
                messages: {
                    where: { role: 'USER' },
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: { id: true, content: true },
                },
            },
            orderBy: { id: 'asc' },
            take: TITLE_BACKFILL_BATCH_SIZE,
        });

        for (const { id: threadId, messages } of threads) {
            const [first] = messages;
            const parts = first ? parseMessageParts(first.content) : [];
            const hasText = parts.some(
                (part) => part.type === 'text' && part.text.trim(),
            );

            if (!first || !hasText) {
                skipped++;
                continue;
            }

            const title = buildTitle([{ id: first.id, role: 'user', parts }]);

            if (!dryRun) {
                // Guarded on the title, so one generated meanwhile is kept.
                const { count } = await prisma.thread.updateMany({
                    where: {
                        id: threadId,
                        title: UNTITLED_TITLE,
                        deletedAt: null,
                    },
                    data: { title },
                });
                if (count === 0) continue;
            }

            titled.push({ threadId, title });
        }

        if (threads.length < TITLE_BACKFILL_BATCH_SIZE) break;
        afterId = threads[threads.length - 1].id;
    }

    return { titled, skipped };
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
