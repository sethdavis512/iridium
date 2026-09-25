import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

const { generateText, updateThreadTitle, logException } = vi.hoisted(() => ({
    generateText: vi.fn(),
    updateThreadTitle: vi.fn(),
    logException: vi.fn(),
}));

vi.mock('@voltagent/core', () => ({
    Agent: class {
        generateText = generateText;
    },
}));

vi.mock('~/models/thread.server', () => ({
    updateThreadTitle: (...args: unknown[]) => updateThreadTitle(...args),
}));

vi.mock('~/lib/logger.server', () => ({
    log: { exception: logException, error: vi.fn(), warn: vi.fn() },
}));

import {
    buildFallbackTitle,
    generateAndSaveThreadTitle,
} from './thread-title.server';

beforeEach(() => {
    vi.clearAllMocks();
});

function textMessage(role: 'user' | 'assistant', text: string): UIMessage {
    return { id: `${role}-${text}`, role, parts: [{ type: 'text', text }] };
}

describe('buildFallbackTitle', () => {
    it('uses the first user message', () => {
        expect(
            buildFallbackTitle([
                textMessage('user', 'Plan my trip'),
                textMessage('assistant', 'Sure'),
            ]),
        ).toBe('Plan my trip');
    });

    it('truncates long messages to 30 characters', () => {
        expect(
            buildFallbackTitle([
                textMessage('user', 'a'.repeat(31)),
                textMessage('assistant', 'ok'),
            ]),
        ).toBe(`${'a'.repeat(30)}...`);
    });

    it('falls back to "New Thread" without user text', () => {
        expect(buildFallbackTitle([])).toBe('New Thread');
    });
});

describe('generateAndSaveThreadTitle', () => {
    const payload = {
        threadId: 't1',
        context: 'user: hi',
        fallbackTitle: 'hi',
    };

    it('saves the generated title without surrounding quotes', async () => {
        generateText.mockResolvedValue({ text: ' "Trip Planning" ' });

        await expect(generateAndSaveThreadTitle(payload)).resolves.toBe(
            'Trip Planning',
        );
        expect(updateThreadTitle).toHaveBeenCalledWith('t1', 'Trip Planning');
    });

    it('saves the fallback when the model returns nothing', async () => {
        generateText.mockResolvedValue({ text: '   ' });

        await generateAndSaveThreadTitle(payload);

        expect(updateThreadTitle).toHaveBeenCalledWith('t1', 'hi');
    });

    it('saves the fallback and logs when the model call fails', async () => {
        generateText.mockRejectedValue(new Error('provider down'));

        await expect(generateAndSaveThreadTitle(payload)).resolves.toBe('hi');
        expect(updateThreadTitle).toHaveBeenCalledWith('t1', 'hi');
        expect(logException).toHaveBeenCalledWith(
            'title_generation_failed',
            expect.any(Error),
            { threadId: 't1' },
        );
    });
});
