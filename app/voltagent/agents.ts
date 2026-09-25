import { Agent, Memory } from '@voltagent/core';
import type { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { z } from 'zod';
import './observability';
import { createLazyResource } from './lazy-resource';
import { openMemoryStorage } from './memory-storage';
import { renderCardTool } from './tools/cards';
import { createNoteTool, listNotesTool, searchNotesTool } from './tools/notes';
import { getCurrentDatetimeTool, getWeatherTool } from './tools/weather';
import { NotesRetriever } from './retrievers/notes';
import { env } from '~/lib/env.server';
import { DEFAULT_MODEL_ID, isAllowedModel } from '~/lib/ai-models';
import { onShutdown } from '~/lib/shutdown.server';

const notesRetriever = new NotesRetriever();

function createChat(storage: PostgreSQLMemoryAdapter) {
    const memory = new Memory({
        storage,
        workingMemory: {
            enabled: true,
            scope: 'user',
            schema: z.object({
                name: z.string().optional(),
                preferences: z.array(z.string()).optional(),
                topics: z.array(z.string()).optional(),
            }),
        },
    });

    const agent = new Agent({
        name: 'Iris',
        instructions:
            'Your name is Iris. You are a helpful assistant. You can create, list, and search notes, look up current weather, and tell the current date and time. Only call tools when the user explicitly asks you to (e.g. "save this", "list my notes", "what is the weather in"). Never call create_note unprompted.',
        // Dynamic model: /api/chat puts the thread's (allowlist-validated) model
        // into the call context; anything else falls back to the default.
        model: ({ context }) => {
            const requested = context.get('model');
            return isAllowedModel(requested) ? requested : DEFAULT_MODEL_ID;
        },
        tools: [
            createNoteTool,
            listNotesTool,
            searchNotesTool,
            renderCardTool,
            getWeatherTool,
            getCurrentDatetimeTool,
        ],
        retriever: notesRetriever,
        memory,
        // Cap tool-call iterations and per-call output to bound cost/abuse.
        maxSteps: 10,
        maxOutputTokens: 2048,
    });

    return { storage, memory, agent };
}

/**
 * The agent and its memory are built on first use, not at import: a VoltAgent
 * database that is down or slow at boot then costs chat alone instead of
 * crashing the process. A failed open is retried on demand with backoff (1s
 * doubling to 30s); until one succeeds, getChat() rejects with
 * ResourceUnavailableError, which /api/chat answers with a 503.
 */
const chat = createLazyResource({
    name: 'voltagent_memory',
    open: async () =>
        createChat(await openMemoryStorage(env.VOLTAGENT_DATABASE_URL)),
    close: ({ storage }) => storage.close(),
});
onShutdown(() => chat.close());

export function getChat() {
    return chat.get();
}
