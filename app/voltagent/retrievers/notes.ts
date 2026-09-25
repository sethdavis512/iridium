import {
    BaseRetriever,
    type BaseMessage,
    type RetrieveOptions,
} from '@voltagent/core';
import type { TextPart, UserModelMessage } from 'ai';
import { searchNotesByKeywords } from '~/models/note.server';

/** Notes injected into the prompt per turn; each can be up to 10k chars. */
export const RETRIEVER_NOTE_LIMIT = 5;

/**
 * Text of the latest user message. Model messages usually carry `content` as
 * an array of parts, not a string, so only the text parts are joined.
 */
function latestUserText(messages: BaseMessage[]): string {
    const message = [...messages]
        .reverse()
        .find((m): m is UserModelMessage => m.role === 'user');

    if (!message) return '';
    if (typeof message.content === 'string') return message.content;

    return message.content
        .filter((part): part is TextPart => part.type === 'text')
        .map((part) => part.text)
        .join(' ');
}

export class NotesRetriever extends BaseRetriever {
    constructor() {
        super({
            toolName: 'search_notes_context',
            toolDescription: "Search the user's notes for relevant context.",
        });
    }

    async retrieve(
        input: string | BaseMessage[],
        options: RetrieveOptions,
    ): Promise<string> {
        const { userId } = options;
        if (!userId) return '';

        const query = typeof input === 'string' ? input : latestUserText(input);

        if (!query.trim()) return '';

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
}
