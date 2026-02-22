import { type UIMessage } from 'ai';

import { prisma } from '~/db.server';

export function createThread(createdById: string) {
    return prisma.thread.create({
        data: {
            createdById,
            title: 'Untitled',
        },
    });
}

export function getAllThreads() {
    return prisma.thread.findMany({
        include: {
            messages: {
                orderBy: { createdAt: 'asc' },
            },
        },
    });
}

export function getAllThreadsByUserId(userId: string) {
    return prisma.thread.findMany({
        where: { createdById: userId },
        include: {
            messages: {
                orderBy: { createdAt: 'asc' },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
}

export function getThreadById(threadId: string, messageCursor?: string) {
    return prisma.thread.findUnique({
        where: { id: threadId },
        include: {
            messages: {
                take: 50,
                ...(messageCursor
                    ? { cursor: { id: messageCursor }, skip: 1 }
                    : {}),
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
    const thread = await getThreadById(threadId);

    if (!thread) throw new Error('Thread not found');

    await prisma.thread.upsert({
        where: { id: threadId },
        update: {},
        create: { id: threadId, createdById: userId, title: 'Untitled' },
    });

    const lastTwoMessages = messages.slice(-2);

    for (const msg of lastTwoMessages) {
        const content = JSON.stringify(msg.parts);

        await prisma.message.upsert({
            where: { id: msg.id },
            update: {
                content,
            },
            create: {
                role: msg.role === 'user' ? 'USER' : 'ASSISTANT',
                content,
                threadId: thread.id,
                userId: msg.role === 'user' ? userId : null,
            },
        });
    }
}

export function updateThreadTitle(threadId: string, title: string) {
    return prisma.thread.update({
        where: { id: threadId },
        data: { title },
    });
}

export function deleteThread(threadId: string) {
    return prisma.thread.delete({
        where: { id: threadId },
    });
}
