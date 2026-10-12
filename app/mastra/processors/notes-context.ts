import type { MastraDBMessage } from '@mastra/core/agent';
import type { ProcessInputArgs, Processor } from '@mastra/core/processors';

import { searchNotesByKeywords } from '~/models/note.server';

import { contextUserId } from '../context';

/** Notes injected into the prompt per turn; each can be up to 10k chars. */
export const RETRIEVER_NOTE_LIMIT = 5;

/**
 * Text of the latest user message. Mastra stores message content as parts,
 * so only the text parts are joined; a message of images alone yields ''.
 */
export function latestUserText(messages: MastraDBMessage[]): string {
    const message = [...messages].reverse().find((m) => m.role === 'user');
    if (!message) return '';

    return message.content.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' ');
}

/**
 * The notes that match a query, as a markdown block for the system prompt,
 * or '' when there is no user, no query text, or no matching note.
 */
export async function buildNotesContext(
    userId: string | undefined,
    query: string,
): Promise<string> {
    if (!userId || !query.trim()) return '';

    // Matches on the message's keywords, not the whole sentence; a message
    // with no keywords (only stop words) runs no query.
    const notes = await searchNotesByKeywords({
        userId,
        text: query,
        take: RETRIEVER_NOTE_LIMIT,
    });
    if (!notes.length) return '';

    return notes.map((n) => `## ${n.title}\n${n.content}`).join('\n\n');
}

/**
 * Input processor that searches the user's notes with the latest message and
 * adds the matches as a system message, so the model can answer from them
 * without a tool call. A processor sees the run's messages and request
 * context before the model does, which is where retrieval belongs.
 */
export const notesContext = {
    id: 'notes-context',

    async processInput({
        messages,
        systemMessages,
        requestContext,
    }: ProcessInputArgs) {
        const context = await buildNotesContext(
            contextUserId({ requestContext }),
            latestUserText(messages),
        );
        if (!context) return { messages, systemMessages };

        return {
            messages,
            systemMessages: [
                ...systemMessages,
                {
                    role: 'system' as const,
                    content: `Relevant notes from the user's notebook:\n\n${context}`,
                },
            ],
        };
    },
} satisfies Processor;
