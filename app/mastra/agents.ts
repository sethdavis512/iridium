import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { z } from 'zod';

import { DEFAULT_MODEL_ID, isAllowedModel } from '~/lib/ai-models';
import { env } from '~/lib/env.server';
import { onShutdown } from '~/lib/shutdown.server';

import { contextModel } from './context';
import { createLazyResource } from './lazy-resource';
import { openMemoryStorage, type MemoryStorage } from './memory-storage';
import { notesContext } from './processors/notes-context';
import { renderCardTool } from './tools/cards';
import { createNoteTool, listNotesTool, searchNotesTool } from './tools/notes';
import { getCurrentDatetimeTool, getWeatherTool } from './tools/weather';

/** Cap tool-call iterations and per-call output to bound cost and abuse. */
export const CHAT_LIMITS = { maxSteps: 10, maxOutputTokens: 2048 } as const;

// Mastra names a tool after its key on the agent, and the chat UI picks a
// renderer by that name, so key every tool by its own id.
function byId<T extends { id: string }>(tools: T[]): Record<string, T> {
    return Object.fromEntries(tools.map((tool) => [tool.id, tool]));
}

function createChat(storage: MemoryStorage) {
    const memory = new Memory({
        storage: storage.store,
        options: {
            workingMemory: {
                enabled: true,
                // Per user, shared across threads ('thread' scopes it to one).
                scope: 'resource',
                schema: z.object({
                    name: z.string().optional(),
                    preferences: z.array(z.string()).optional(),
                    topics: z.array(z.string()).optional(),
                }),
            },
        },
    });

    const agent = new Agent({
        id: 'iris',
        name: 'Iris',
        instructions:
            'Your name is Iris. You are a helpful assistant. You can create, list, and search notes, look up current weather, and tell the current date and time. Only call tools when the user explicitly asks you to (e.g. "save this", "list my notes", "what is the weather in"). Never call create_note unprompted.',
        // Dynamic model: /api/chat puts the thread's model into the request
        // context; anything outside the allowlist falls back to the default.
        model: ({ requestContext }) => {
            const requested = contextModel({ requestContext });
            return isAllowedModel(requested) ? requested : DEFAULT_MODEL_ID;
        },
        tools: byId([
            createNoteTool,
            listNotesTool,
            searchNotesTool,
            renderCardTool,
            getWeatherTool,
            getCurrentDatetimeTool,
        ]),
        inputProcessors: [notesContext],
        memory,
        defaultOptions: {
            maxSteps: CHAT_LIMITS.maxSteps,
            modelSettings: { maxOutputTokens: CHAT_LIMITS.maxOutputTokens },
        },
    });

    return { storage, memory, agent };
}

/**
 * The agent and its memory are built on first use, not at import: a Mastra
 * database that is down or slow at boot then costs chat alone instead of
 * crashing the process. A failed open is retried on demand with backoff (1s
 * doubling to 30s); until one succeeds, getChat() rejects with
 * ResourceUnavailableError, which /api/chat answers with a 503.
 */
const chat = createLazyResource({
    name: 'mastra_memory',
    open: async () =>
        createChat(await openMemoryStorage(env.MASTRA_DATABASE_URL)),
    close: ({ storage }) => storage.close(),
});
onShutdown(() => chat.close());

export function getChat() {
    return chat.get();
}
