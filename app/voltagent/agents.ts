import { Agent, Memory } from '@voltagent/core';
import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { z } from 'zod';
import { renderCardTool } from './tools/cards';
import { createNoteTool, listNotesTool, searchNotesTool } from './tools/notes';
import { getCurrentDatetimeTool, getWeatherTool } from './tools/weather';
import { NotesRetriever } from './retrievers/notes';
import { env } from '~/lib/env.server';
import { DEFAULT_MODEL_ID, isAllowedModel } from '~/lib/ai-models';
import { onShutdown } from '~/lib/shutdown.server';

const memoryStorage = new PostgreSQLMemoryAdapter({
    connection: env.VOLTAGENT_DATABASE_URL,
});
onShutdown(() => memoryStorage.close());

export const memory = new Memory({
    storage: memoryStorage,
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

const notesRetriever = new NotesRetriever();

export const agent = new Agent({
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
