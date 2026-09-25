import { createTool } from '@voltagent/core';
import invariant from 'tiny-invariant';
import z from 'zod';
import type { Note } from '~/generated/prisma/browser';
import { rateLimit } from '~/lib/rate-limit.server';
import {
    createNote,
    getNotesByUserId,
    searchNotes,
} from '~/models/note.server';

function serializeNote(n: Note) {
    return {
        id: n.id,
        title: n.title,
        content: n.content,
        createdAt: n.createdAt,
    };
}

export const createNoteTool = createTool({
    name: 'create_note',
    description:
        'Create a new note for the user. Use when the user asks to save, remember, or jot down something.',
    parameters: z.object({
        title: z
            .string()
            .max(200, 'Title must be 200 characters or fewer')
            .describe('A short title for the note'),
        content: z
            .string()
            .max(10_000, 'Content must be 10,000 characters or fewer')
            .describe('The body content of the note'),
    }),
    execute: async (args, options) => {
        const userId = options?.userId;
        invariant(userId, 'User not authenticated');

        const { success } = await rateLimit({
            key: `note-create:${userId}`,
            maxRequests: 10,
            windowMs: 3_600_000, // 1 hour
        });

        if (!success) {
            return { error: 'Rate limit exceeded. Try again later.' };
        }

        const note = await createNote({ ...args, userId });

        return serializeNote(note);
    },
});

export const listNotesTool = createTool({
    name: 'list_notes',
    description:
        'List all notes for the current user. Use when the user wants to see their notes.',
    parameters: z.object({}),
    execute: async (_args, options) => {
        const userId = options?.userId;
        invariant(userId, 'User not authenticated');

        const notes = await getNotesByUserId(userId);

        return { notes: notes.map(serializeNote) };
    },
});

export const searchNotesTool = createTool({
    name: 'search_notes',
    description:
        "Search the user's notes by keyword. Use when the user wants to find a specific note.",
    parameters: z.object({
        query: z
            .string()
            .max(500, 'Search query must be 500 characters or fewer')
            .describe('Search term to match against note titles and content'),
    }),
    execute: async (args, options) => {
        const userId = options?.userId;
        invariant(userId, 'User not authenticated');

        const notes = await searchNotes({ userId, query: args.query });

        return { notes: notes.map(serializeNote) };
    },
});
