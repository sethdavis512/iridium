import { Agent, Memory } from '@voltagent/core';
import {
    PostgreSQLMemoryAdapter,
    type PostgreSQLMemoryOptions,
} from '@voltagent/postgres';
import { z } from 'zod';
import './observability';
import { renderCardTool } from './tools/cards';
import { createNoteTool, listNotesTool, searchNotesTool } from './tools/notes';
import { getCurrentDatetimeTool, getWeatherTool } from './tools/weather';
import { NotesRetriever } from './retrievers/notes';
import { env } from '~/lib/env.server';
import { pgPoolConfig, POOL_MAX } from '~/lib/db-pool.server';
import { DEFAULT_MODEL_ID, isAllowedModel } from '~/lib/ai-models';
import { onShutdown } from '~/lib/shutdown.server';

const memoryStorage = new PostgreSQLMemoryAdapter({
    // The adapter spreads an object `connection` into `new pg.Pool()`
    // (verified in @voltagent/postgres 2.1.3), so the shared pg pool
    // options pass through; its type only lists host/port/user fields,
    // hence the cast. maxConnections sets the pool's `max`.
    connection: pgPoolConfig(
        env.VOLTAGENT_DATABASE_URL,
        POOL_MAX.voltagent,
    ) as PostgreSQLMemoryOptions['connection'],
    maxConnections: POOL_MAX.voltagent,
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
