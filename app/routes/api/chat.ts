import {
    streamText,
    convertToModelMessages,
    stepCountIs,
    generateText,
} from 'ai';
import type { UIMessage } from 'ai';
import z from 'zod';

import { getAIModel } from '~/lib/ai';
import { getUserFromSession } from '~/lib/session.server';
import {
    getAllThreadsByUserId,
    getThreadById,
    saveChat,
    updateThreadTitle,
} from '~/models/thread.server';
import type { Route } from './+types/chat';
import { chatTools } from '~/lib/chat-tools.server';

interface UIMessagesRequestJson {
    messages: UIMessage[];
    id: string;
}

export async function loader({ request }: Route.LoaderArgs) {
    const user = await getUserFromSession(request);

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const threads = await getAllThreadsByUserId(user.id);

    return {
        threads,
    };
}

export async function action({ request }: Route.ActionArgs) {
    if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let parsed: UIMessagesRequestJson;
    try {
        parsed = z
            .object({
                id: z.string().min(1),
                messages: z.array(z.unknown()),
            })
            .parse(await request.json()) as UIMessagesRequestJson;
    } catch (error) {
        return Response.json(
            { error: 'Invalid request body' },
            { status: 400 },
        );
    }

    const { messages, id: threadId } = parsed;
    const user = await getUserFromSession(request);

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const model = getAIModel();
    const thread = await getThreadById(threadId);

    if (messages.length > 3 && (thread?.title === 'Untitled' || !thread)) {
        try {
            const conversationContext = messages
                .slice(0, 4)
                .map((msg) => {
                    const textParts = msg.parts
                        .filter((part) => part.type === 'text')
                        .map((part) => ('text' in part ? part.text : ''))
                        .join(' ');

                    return `${msg.role}: ${textParts}`;
                })
                .join('\n');

            const titleResult = await generateText({
                model,
                prompt: `Generate a concise, descriptive title (max 6 words) for this conversation. Return only the title, no quotes.\n\n${conversationContext}`,
            });

            const title = titleResult.text
                .trim()
                .replace(/^["']|["']$/g, '')
                .slice(0, 100);

            if (thread) {
                await updateThreadTitle(threadId, title);
            }
        } catch {
            // Non-critical — continue without updating title
        }
    }

    const result = streamText({
        model,
        system: "You are a data analyst AI assistant. Help analyze user and engagement metrics for this application. Provide clear, actionable insights based on the tools available to you.\n\nBe direct and data-driven. Report concrete numbers, trends, and metrics. Avoid vague or generic statements—focus on specific insights based on actual data.\n\nIf the user's query is unrelated to data analysis, politely inform them that you can only assist with data-related questions.",
        messages: convertToModelMessages(messages),
        stopWhen: stepCountIs(5),
        tools: chatTools,
    });

    return result.toUIMessageStreamResponse({
        originalMessages: messages,
        onFinish: async ({ messages }) => {
            await saveChat({
                messages,
                threadId,
                userId: user.id,
            });
        },
    });
}
