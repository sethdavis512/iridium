import type { UIMessage } from 'ai';
import { Agent } from '@voltagent/core';
import { DEFAULT_MODEL_ID } from '~/lib/ai-models';
import { log } from '~/lib/logger.server';
import { updateThreadTitle } from '~/models/thread.server';

/**
 * A minimal agent for one-shot title generation: no memory, no tools, so the
 * Trigger.dev worker doesn't drag in the VoltAgent Postgres store.
 */
const titleAgent = new Agent({
    name: 'Thread Titler',
    instructions: 'You generate short, descriptive conversation titles.',
    model: DEFAULT_MODEL_ID,
    maxOutputTokens: 64,
});

/** Flatten the first few messages into a prompt-ready transcript. */
export function buildTitleContext(messages: UIMessage[]) {
    return messages
        .slice(0, 4)
        .map((msg) => {
            const textParts = msg.parts
                .filter((part) => part.type === 'text')
                .map((part) => ('text' in part ? part.text : ''))
                .join(' ');

            return `${msg.role}: ${textParts}`;
        })
        .join('\n');
}

const FALLBACK_TITLE_LENGTH = 30;

/**
 * The title stored when the model call fails or returns nothing: the opening
 * user message, truncated. It matches the label the sidebar derived for
 * untitled threads before every thread got a stored title.
 */
export function buildFallbackTitle(messages: UIMessage[]) {
    const text = (messages.find((msg) => msg.role === 'user')?.parts ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('');

    return text.length > FALLBACK_TITLE_LENGTH
        ? `${text.slice(0, FALLBACK_TITLE_LENGTH)}...`
        : text || 'New Thread';
}

/**
 * Generate a title and save it. A title is always stored (the fallback when
 * the model call fails or returns nothing), so each thread is titled once and
 * a failed attempt is never retried, and paid for, on later turns.
 */
export async function generateAndSaveThreadTitle({
    threadId,
    context,
    fallbackTitle,
}: {
    threadId: string;
    context: string;
    fallbackTitle: string;
}) {
    let generated = '';

    try {
        const result = await titleAgent.generateText(
            `Generate a concise, descriptive title (max 6 words) for this conversation. The title should capture the main topic or question being discussed.\n\nConversation:\n${context}\n\nGenerate only the title, no quotes or extra text.`,
        );

        generated = (result?.text ?? '')
            .trim()
            .replace(/^["']|["']$/g, '')
            .slice(0, 100);
    } catch (error) {
        log.exception('title_generation_failed', error, { threadId });
    }

    const title = generated || fallbackTitle;
    await updateThreadTitle(threadId, title);

    return title;
}
