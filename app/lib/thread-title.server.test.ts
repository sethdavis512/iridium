import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

const { generate, setTitleIfUntitled, logException } = vi.hoisted(() => ({
    generate: vi.fn(),
    setTitleIfUntitled: vi.fn(),
    logException: vi.fn(),
}));

vi.mock('@mastra/core/agent', () => ({
    Agent: class {
        generate = generate;
    },
}));

vi.mock('~/models/thread.server', () => ({
    setTitleIfUntitled: (...args: unknown[]) => setTitleIfUntitled(...args),
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
        generate.mockResolvedValue({ text: ' "Trip Planning" ' });

        await expect(generateAndSaveThreadTitle(payload)).resolves.toBe(
            'Trip Planning',
        );
        expect(setTitleIfUntitled).toHaveBeenCalledWith('t1', 'Trip Planning');
    });

    it('saves the fallback when the model returns nothing', async () => {
        generate.mockResolvedValue({ text: '   ' });

        await generateAndSaveThreadTitle(payload);

        expect(setTitleIfUntitled).toHaveBeenCalledWith('t1', 'hi');
    });

    it('saves the fallback and logs when the model call fails', async () => {
        generate.mockRejectedValue(new Error('provider down'));

        await expect(generateAndSaveThreadTitle(payload)).resolves.toBe('hi');
        expect(setTitleIfUntitled).toHaveBeenCalledWith('t1', 'hi');
        expect(logException).toHaveBeenCalledWith(
            'title_generation_failed',
            expect.any(Error),
            { threadId: 't1' },
        );
    });
});
