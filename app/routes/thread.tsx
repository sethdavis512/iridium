import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import {
    LoaderCircleIcon,
    RefreshCwIcon,
    SendHorizonalIcon,
    StopCircleIcon,
    WrenchIcon,
    XIcon,
} from 'lucide-react';
import { CardToolPart } from '~/components/CardToolPart';
import { ChatBubble } from '~/components/ChatBubble';
import { Markdown } from '~/components/Markdown';
import { NoteToolPart } from '~/components/NoteToolPart';
import { isToolDone, isToolLoading } from '~/components/ToolPartShell';
import { FormAlert } from '~/components/forms/FormAlert';
import { Select } from '~/components/forms/Select';
import { Button } from '~/components/ui/button';
import type { CardData } from '~/voltagent/tools/cards';
import type { Route } from './+types/thread';
import { getThreadById } from '~/models/thread.server';
import { authMiddleware } from '~/middleware/auth';
import { requireUserFromContext } from '~/context';
import {
    data,
    isRouteErrorResponse,
    useFetcher,
    useRouteError,
} from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { ALLOWED_MODELS, DEFAULT_MODEL_ID } from '~/lib/ai-models';

const transport = new DefaultChatTransport({
    api: '/api/chat',
    credentials: 'include',
});

const PRESET_MESSAGES = [
    {
        label: 'Summarize',
        value: 'Summarize our conversation so far as a concise bullet-point list.',
    },
    {
        label: 'Explain',
        value: 'Explain your last response in simpler terms and include a concrete real-world example.',
    },
    {
        label: 'Pros & Cons',
        value: 'Give me a structured pros and cons list for the main topic we have been discussing.',
    },
    {
        label: 'Next Steps',
        value: 'Based on everything we have discussed, what are the most important next steps I should take?',
    },
    {
        label: 'My Notes',
        value: 'List all of my saved notes and give me a brief summary of what each one contains.',
    },
    {
        label: 'Save Note',
        value: 'Create a note capturing the key insights and action items from our conversation so far.',
    },
];

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ context, params }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);

    const thread = await getThreadById(params.threadId);
    if (!thread) throw data('Thread not found', { status: 404 });

    if (thread.createdById !== user.id) {
        throw data('Forbidden', { status: 403 });
    }

    const messages: UIMessage[] = thread.messages.flatMap((msg) => {
        let parts: UIMessage['parts'];
        try {
            parts = JSON.parse(msg.content);
        } catch {
            parts = [{ type: 'text' as const, text: msg.content }];
        }

        if (!Array.isArray(parts)) {
            parts = [{ type: 'text' as const, text: msg.content }];
        }

        return {
            id: msg.id,
            role:
                msg.role === 'USER'
                    ? ('user' as const)
                    : ('assistant' as const),
            content: '',
            parts,
            createdAt: msg.createdAt,
        };
    });

    return {
        thread: { ...thread, messages },
    };
}

type ToolPartState = 'input-available' | 'input-streaming' | 'output-available';

interface ToolPart {
    toolCallId: string;
    toolName: string;
    state: ToolPartState;
}

function isToolPart(part: {
    type: string;
}): part is ToolPart & { type: string } {
    return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
}

const NOTE_TOOLS = new Set(['create_note', 'list_notes', 'search_notes']);
function ToolPartFallback({ part }: { part: ToolPart }) {
    return (
        <div className="mt-1 flex items-center gap-1 text-xs opacity-70">
            <WrenchIcon aria-hidden="true" className="h-3 w-3" />
            <span>
                {part.toolName}
                {isToolDone(part.state) && ' \u2713'}
                {isToolLoading(part.state) && ' \u2026'}
            </span>
        </div>
    );
}

export default function ThreadRoute({
    loaderData,
    params,
}: Route.ComponentProps) {
    const [chatInput, setChatInput] = useState('');
    const messageRef = useRef<HTMLDivElement>(null);
    const modelFetcher = useFetcher();

    // Optimistic: show the submitted model while the fetcher is in flight.
    const currentModel =
        modelFetcher.formData?.get('model')?.toString() ??
        loaderData.thread.model ??
        DEFAULT_MODEL_ID;

    const {
        messages,
        sendMessage,
        error,
        clearError,
        regenerate,
        status,
        stop,
    } = useChat({
        id: params.threadId,
        messages: loaderData?.thread.messages,
        transport,
        onError: (error) => {
            console.error('Chat error:', error);
        },
    });

    useEffect(() => {
        if (messageRef.current) {
            messageRef.current.scrollTop = messageRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = () => {
        if (!chatInput.trim()) return;
        sendMessage({ text: chatInput });
        setChatInput('');
    };

    return (
        <>
            <div className="flex items-center justify-end gap-2 px-1">
                <label
                    htmlFor="thread-model"
                    className="text-muted-foreground text-xs"
                >
                    Model
                </label>
                <Select
                    id="thread-model"
                    selectSize="sm"
                    className="w-auto"
                    value={currentModel}
                    disabled={status === 'streaming' || status === 'submitted'}
                    onChange={(event) =>
                        modelFetcher.submit(
                            {
                                intent: 'set-model',
                                threadId: params.threadId,
                                model: event.target.value,
                            },
                            { method: 'POST', action: '/chat' },
                        )
                    }
                >
                    {ALLOWED_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                            {model.label}
                        </option>
                    ))}
                </Select>
            </div>
            {error && (
                <FormAlert message="Something went wrong.">
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => regenerate()}
                        >
                            <RefreshCwIcon aria-hidden="true" />
                            Retry
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => clearError()}
                        >
                            <XIcon aria-hidden="true" />
                            Dismiss
                        </Button>
                    </div>
                </FormAlert>
            )}
            <div
                ref={messageRef}
                aria-live="polite"
                aria-busy={status === 'streaming'}
                className="bg-card border-border flex min-h-0 grow flex-col gap-4 overflow-y-auto rounded-xl border p-4"
            >
                {/* Spacer pushes messages to the bottom. Using justify-end with
                   overflow-y-auto causes upward overflow that is unreachable
                   by scrolling, so we use a grow spacer instead. */}
                <div className="grow" />
                {messages.length > 0 ? (
                    messages.map((message) => {
                        const isUser = message.role === 'user';

                        const textContent = message.parts
                            .filter(
                                (part) =>
                                    part.type === 'text' && 'text' in part,
                            )
                            .map((part) => part.text)
                            .join('\n\n');

                        const toolParts = message.parts.filter((part) =>
                            isToolPart(part),
                        ) as unknown as ToolPart[];

                        const content = (
                            <>
                                {textContent && (
                                    <Markdown>{textContent}</Markdown>
                                )}
                                {toolParts.map((part) => {
                                    const output =
                                        part.state === 'output-available'
                                            ? (
                                                  part as unknown as {
                                                      output: Record<
                                                          string,
                                                          unknown
                                                      >;
                                                  }
                                              ).output
                                            : undefined;

                                    if (NOTE_TOOLS.has(part.toolName)) {
                                        return (
                                            <NoteToolPart
                                                key={part.toolCallId}
                                                toolName={part.toolName}
                                                state={part.state}
                                                output={output}
                                            />
                                        );
                                    }

                                    if (part.toolName === 'render_card') {
                                        return (
                                            <CardToolPart
                                                key={part.toolCallId}
                                                state={part.state}
                                                output={
                                                    output as unknown as CardData
                                                }
                                            />
                                        );
                                    }

                                    return (
                                        <ToolPartFallback
                                            key={part.toolCallId}
                                            part={part}
                                        />
                                    );
                                })}
                                {!textContent &&
                                    toolParts.length === 0 &&
                                    !isUser &&
                                    status !== 'ready' &&
                                    message ===
                                        messages[messages.length - 1] && (
                                        <span
                                            role="status"
                                            aria-label="Loading response"
                                        >
                                            <LoaderCircleIcon
                                                aria-hidden="true"
                                                className="h-5 w-5 animate-spin"
                                            />
                                        </span>
                                    )}
                            </>
                        );

                        const isLastMessage =
                            message === messages[messages.length - 1];

                        return (
                            <div key={message.id}>
                                <ChatBubble
                                    variant={isUser ? 'primary' : 'default'}
                                    placement={isUser ? 'end' : 'start'}
                                >
                                    {content}
                                </ChatBubble>
                                {!isUser &&
                                    isLastMessage &&
                                    status === 'ready' && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            className="mt-1"
                                            onClick={() => regenerate()}
                                        >
                                            <RefreshCwIcon
                                                aria-hidden="true"
                                                className="size-3"
                                            />
                                            Regenerate
                                        </Button>
                                    )}
                            </div>
                        );
                    })
                ) : (
                    <div className="text-muted-foreground text-center">
                        No messages yet
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5 px-1">
                    {PRESET_MESSAGES.map(({ label, value }) => (
                        <Button
                            key={label}
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => sendMessage({ text: value })}
                            disabled={status !== 'ready'}
                            title={value}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                <div className="border-border bg-card flex items-center gap-2 rounded-xl border p-2">
                    <input
                        id="chat-message-input"
                        type="text"
                        aria-label="Message"
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/24 h-9 min-w-0 grow rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-64"
                        placeholder="Your message here..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={status !== 'ready'}
                    />
                    <Button
                        variant="outline"
                        onClick={stop}
                        disabled={
                            status !== 'streaming' && status !== 'submitted'
                        }
                    >
                        <StopCircleIcon aria-hidden="true" />
                        <span className="max-sm:sr-only">Stop</span>
                    </Button>
                    <Button onClick={handleSend} disabled={status !== 'ready'}>
                        <SendHorizonalIcon aria-hidden="true" />
                        <span className="max-sm:sr-only">Send</span>
                    </Button>
                </div>
            </div>
        </>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();

    const message = isRouteErrorResponse(error)
        ? `${error.status} ${
              typeof error.data === 'string' ? error.data : error.statusText
          }`
        : 'Experiencing technical difficulties. Please try again later.';

    return <FormAlert message={message} />;
}
