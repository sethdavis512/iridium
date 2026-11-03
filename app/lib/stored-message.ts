import type { UIMessage } from 'ai';

/** A Message row as the app database stores it. */
type StoredMessage = {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    createdAt: Date;
};

/** The `content` column for a message: its UIMessage parts as JSON. */
export function serializeParts(parts: UIMessage['parts']): string {
    return JSON.stringify(parts);
}

/** Stored message content: JSON UIMessage parts, or plain text in old rows. */
export function parseStoredParts(content: string): UIMessage['parts'] {
    try {
        const parts = JSON.parse(content);
        if (Array.isArray(parts)) return parts;
    } catch {
        // Not JSON: plain-text content.
    }

    return [{ type: 'text', text: content }];
}

export function toStoredRole(role: UIMessage['role']): 'USER' | 'ASSISTANT' {
    return role === 'user' ? 'USER' : 'ASSISTANT';
}

/**
 * A stored row as the UIMessage the chat shows. SYSTEM rows render as the
 * assistant; callers that build model context skip them.
 */
export function toUIMessage(
    message: StoredMessage,
): UIMessage & { createdAt: Date } {
    return {
        id: message.id,
        role: message.role === 'USER' ? 'user' : 'assistant',
        parts: parseStoredParts(message.content),
        createdAt: message.createdAt,
    };
}
