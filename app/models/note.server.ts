import { countKeywordMatches, extractKeywords } from '~/lib/keywords';
import prisma from '~/lib/prisma';

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 10_000;

type PageOptions = {
    skip?: number;
    take?: number;
};

export function createNote({
    title,
    content,
    userId,
}: {
    title: string;
    content: string;
    userId: string;
}) {
    return prisma.note.create({
        data: {
            title: title.slice(0, MAX_TITLE_LENGTH),
            content: content.slice(0, MAX_CONTENT_LENGTH),
            userId,
        },
    });
}

export function getNotesByUserId(
    userId: string,
    { skip, take }: PageOptions = {},
) {
    return prisma.note.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
    });
}

export function getNoteById(noteId: string) {
    // findFirst, not findUnique: soft-deleted notes must behave as missing.
    return prisma.note.findFirst({
        where: { id: noteId, deletedAt: null },
    });
}

export function countNotesByUserId(userId: string, query?: string) {
    return prisma.note.count({
        where: noteSearchWhere(userId, query),
    });
}

export function updateNote({
    noteId,
    title,
    content,
}: {
    noteId: string;
    title: string;
    content: string;
}) {
    return prisma.note.update({
        where: { id: noteId },
        data: {
            title: title.slice(0, MAX_TITLE_LENGTH),
            content: content.slice(0, MAX_CONTENT_LENGTH),
        },
    });
}

export function deleteNote(noteId: string) {
    // Soft delete: every read in this module filters deletedAt: null.
    return prisma.note.update({
        where: { id: noteId },
        data: { deletedAt: new Date() },
    });
}

/**
 * Hard-delete notes that were soft-deleted more than `olderThanDays` days
 * ago. Called by the purge background job.
 */
export function purgeSoftDeletedNotes(olderThanDays: number) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    return prisma.note.deleteMany({
        where: { deletedAt: { lt: cutoff } },
    });
}

function noteSearchWhere(userId: string, query?: string) {
    return {
        userId,
        deletedAt: null,
        ...(query
            ? {
                  OR: [
                      {
                          title: {
                              contains: query,
                              mode: 'insensitive' as const,
                          },
                      },
                      {
                          content: {
                              contains: query,
                              mode: 'insensitive' as const,
                          },
                      },
                  ],
              }
            : {}),
    };
}

export function searchNotes({
    userId,
    query,
    skip,
    take,
}: {
    userId: string;
    query: string;
} & PageOptions) {
    return prisma.note.findMany({
        where: noteSearchWhere(userId, query),
        orderBy: { createdAt: 'desc' },
        skip,
        take,
    });
}

/**
 * Most recent keyword matches ranked in memory. Bounds the rows (each up to
 * 10k chars) read per search, so ranking covers the newest matches only.
 */
export const KEYWORD_CANDIDATE_LIMIT = 25;

/**
 * Notes relevant to free text such as a chat message: matches notes whose
 * title or content contains any of the text's keywords, ranked by how many
 * distinct keywords they contain, then by recency. Text with no keywords
 * (only stop words or short tokens) returns nothing without a query.
 */
export async function searchNotesByKeywords({
    userId,
    text,
    take,
}: {
    userId: string;
    text: string;
    take: number;
}) {
    const keywords = extractKeywords(text);
    if (keywords.length === 0) return [];

    const candidates = await prisma.note.findMany({
        where: {
            userId,
            deletedAt: null,
            OR: keywords.flatMap((keyword) => [
                { title: { contains: keyword, mode: 'insensitive' as const } },
                {
                    content: {
                        contains: keyword,
                        mode: 'insensitive' as const,
                    },
                },
            ]),
        },
        orderBy: { createdAt: 'desc' },
        take: KEYWORD_CANDIDATE_LIMIT,
    });

    // The query matches substrings; scoring keeps word-start matches only,
    // so "art" in a message does not pull in every note mentioning "start".
    return candidates
        .map((note) => ({
            note,
            score: countKeywordMatches(
                `${note.title}\n${note.content}`,
                keywords,
            ),
        }))
        .filter(({ score }) => score > 0)
        .sort(
            (a, b) =>
                b.score - a.score ||
                b.note.createdAt.getTime() - a.note.createdAt.getTime(),
        )
        .slice(0, take)
        .map(({ note }) => note);
}
