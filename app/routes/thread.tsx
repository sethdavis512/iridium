import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
    BotIcon,
    MessageCircleDashedIcon,
    SendHorizontalIcon,
    StopCircleIcon,
    UserIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { data, useNavigation } from 'react-router';
import { Button } from '~/components/actions/Button';
import {
    ChatBubble,
    ChatBubbleAvatar,
    ChatBubbleMessage,
} from '~/components/data-display/ChatBubble';
import { TextInput } from '~/components/data-input/TextInput';
import { Loading } from '~/components/feedback/Loading';
import { cx } from '~/cva.config';
import type { Route } from './+types/thread';
import { getUserFromSession } from '~/lib/session.server';
import { getThreadById } from '~/models/thread.server';
import invariant from 'tiny-invariant';
import type { UserAnalyticsOutput } from '~/lib/chat-tools.types';
import { UserAnalyticsToolCard } from '~/components/data-display/features/UserAnalyticsToolCard';

type ToolState =
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error';

interface NormalizedToolPart {
    toolName: string;
    state: ToolState;
    input?: unknown;
    output?: unknown;
    errorText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}

function isNonNullable<T>(value: T): value is NonNullable<T> {
    return value != null;
}

function isTextPart(part: unknown): part is { type: 'text'; text: string } {
    if (!isRecord(part)) return false;
    return part.type === 'text' && typeof part.text === 'string';
}

function isStepStartPart(part: unknown): part is { type: 'step-start' } {
    if (!isRecord(part)) return false;
    return part.type === 'step-start';
}

function normalizeToolPart(part: unknown): NormalizedToolPart | null {
    if (!isRecord(part)) return null;

    if (
        part.type === 'dynamic-tool' &&
        typeof part.toolName === 'string' &&
        typeof part.state === 'string'
    ) {
        return {
            toolName: part.toolName,
            state: part.state as ToolState,
            input: part.input,
            output: part.output,
            errorText:
                typeof part.errorText === 'string' ? part.errorText : undefined,
        };
    }

    if (
        typeof part.type === 'string' &&
        part.type.startsWith('tool-') &&
        typeof part.state === 'string'
    ) {
        return {
            toolName: part.type.slice('tool-'.length),
            state: part.state as ToolState,
            input: part.input,
            output: part.output,
            errorText:
                typeof part.errorText === 'string' ? part.errorText : undefined,
        };
    }

    return null;
}

function isUserAnalyticsOutput(value: unknown): value is UserAnalyticsOutput {
    if (!isRecord(value)) return false;
    return (
        isRecord(value.dateRange) &&
        typeof value.dateRange.startDate === 'string' &&
        typeof value.dateRange.endDate === 'string' &&
        isRecord(value.overview) &&
        typeof value.overview.totalUsers === 'number' &&
        typeof value.overview.newUsersInRange === 'number' &&
        typeof value.overview.activeUsers === 'number' &&
        typeof value.overview.bannedUsers === 'number' &&
        isRecord(value.growth) &&
        isRecord(value.roleDistribution) &&
        isRecord(value.accountHealth) &&
        Array.isArray(value.trend)
    );
}

type ChatPlacement = 'start' | 'end';
type ChatBubbleColor =
    | 'neutral'
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';

interface MessagePartBubbleProps {
    placement: ChatPlacement;
    color?: ChatBubbleColor;
    isUser: boolean;
    children: ReactNode;
}

function MessagePartBubble({
    placement,
    color,
    isUser,
    children,
}: MessagePartBubbleProps) {
    return (
        <ChatBubble placement={placement}>
            <ChatBubbleAvatar className="avatar">
                <div
                    className={cx(
                        `w-10 rounded-full ring ring-base-content ring-offset-base-100 ring-offset-2 flex items-center justify-center bg-base-300`,
                    )}
                >
                    {isUser ? (
                        <UserIcon className="w-6 h-6 stroke-base-content" />
                    ) : (
                        <BotIcon className="w-6 h-6 stroke-base-content" />
                    )}
                </div>
            </ChatBubbleAvatar>
            <ChatBubbleMessage className="w-full" color={color}>
                {children}
            </ChatBubbleMessage>
        </ChatBubble>
    );
}

function ToolCallPart({ tool }: { tool: NormalizedToolPart }) {
    return (
        <details className="collapse collapse-arrow border border-base-200">
            <summary className="collapse-title px-2 py-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono opacity-70">
                        tool: {tool.toolName}
                    </span>
                    <span className="badge badge-ghost badge-xs">
                        {tool.state}
                    </span>
                </div>
            </summary>
            <div className="collapse-content px-2 pb-2">
                <div className="flex flex-col gap-2">
                    {(tool.state === 'input-streaming' ||
                        tool.state === 'input-available') && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="loading loading-spinner loading-sm" />
                            <span>
                                Running{' '}
                                <span className="font-mono">
                                    {tool.toolName}
                                </span>
                                …
                            </span>
                        </div>
                    )}

                    {tool.state === 'output-available' && (
                        <div className="alert alert-info">
                            <span>
                                Received results from{' '}
                                <span className="font-mono">
                                    {tool.toolName}
                                </span>
                                . The assistant will incorporate them into the
                                reply.
                            </span>
                        </div>
                    )}

                    {tool.state === 'output-error' && (
                        <div className="alert alert-error">
                            <span>
                                Something went wrong while running{' '}
                                <span className="font-mono">
                                    {tool.toolName}
                                </span>
                                {tool.errorText ? `: ${tool.errorText}` : '.'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </details>
    );
}

export async function loader({ request, params }: Route.LoaderArgs) {
    const user = await getUserFromSession(request);

    if (!user) {
        throw new Response('Unauthorized', { status: 401 });
    }

    const thread = await getThreadById(params.threadId);
    invariant(thread, 'Thread not found');

    const uiMessages: UIMessage[] = thread?.messages.map((msg) => ({
        id: msg.id,
        role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
        parts: JSON.parse(msg.content),
    }));

    return data({
        threadId: thread?.id,
        messages: uiMessages,
    });
}

const threadLayout = {
    root: 'flex flex-col flex-1 min-h-0 h-full gap-2',
    messages:
        'flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 bg-base-100 rounded-box p-4 lg:p-8',
    composer:
        'flex-shrink-0 bg-base-100 p-2 rounded-box sticky bottom-0 z-10 pb-[env(safe-area-inset-bottom)]',
} as const;

export default function ThreadRoute({
    loaderData,
    params,
}: Route.ComponentProps) {
    const navigation = useNavigation();
    const [chatInput, setChatInput] = useState('');
    const messageRef = useRef<HTMLDivElement>(null);

    const transport = useMemo(() => {
        return new DefaultChatTransport({
            api: '/api/chat',
        });
    }, []);

    const { messages, sendMessage, error, status, stop } = useChat({
        id: params.threadId,
        messages: loaderData?.messages,
        transport,
    });

    useEffect(() => {
        if (messageRef.current) {
            messageRef.current.scrollTop = messageRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (params.threadId) {
            stop();
        }
    }, [params.threadId]);

    const hasNoMessages = messages.length === 0;
    const isLoadingMessages = navigation.state === 'loading';
    const threadChosenZeroMessages = !isLoadingMessages && hasNoMessages;
    const isStreaming = status === 'streaming' && !isLoadingMessages;

    const PresetButton = ({ label, text }: { label: string; text: string }) => {
        return (
            <Button
                onClick={() => {
                    sendMessage({
                        text,
                    });
                }}
            >
                {label}
            </Button>
        );
    };

    const presentQuestions = [
        {
            label: 'User growth (30 days)',
            text: 'Show me user growth over the last 30 days. Use the getUserAnalytics tool and highlight total users, new users, growth rate, and active users.',
        },
        {
            label: 'User analytics overview',
            text: "What's my current user analytics and role distribution? Use getUserAnalytics and summarize the user base breakdown and account health.",
        },
    ];

    return (
        <>
            <title>Thread | Iridium</title>
            <meta
                name="description"
                content="Chat with your data using Iridium's AI-powered assistant."
            />
            <div className={threadLayout.root}>
                {error && (
                    <div className="alert alert-error">
                        <span>Error: {error.message}</span>
                    </div>
                )}
                <div ref={messageRef} className={threadLayout.messages}>
                    {isLoadingMessages ? (
                        <div className="flex flex-col gap-8 justify-center items-center h-full">
                            <Loading size="lg" />
                        </div>
                    ) : (
                        <>
                            {threadChosenZeroMessages ? (
                                <div className="flex flex-col gap-8 justify-center items-center h-full">
                                    <MessageCircleDashedIcon className="w-16 h-16 stroke-base-300" />
                                    <p className="text-base-content">
                                        No messages yet. Start a conversation!
                                    </p>
                                </div>
                            ) : (
                                messages.flatMap((message) => {
                                    const isUser = message.role === 'user';
                                    const placement = isUser ? 'end' : 'start';
                                    const color = isUser
                                        ? 'secondary'
                                        : undefined;

                                    return message.parts
                                        .map((part, partIndex) => {
                                            if (isStepStartPart(part)) {
                                                return partIndex > 0 ? (
                                                    <div
                                                        key={`${message.id}-step-${partIndex}`}
                                                        className="my-2"
                                                    >
                                                        <hr className="border border-base-300" />
                                                    </div>
                                                ) : null;
                                            }

                                            if (isTextPart(part)) {
                                                return (
                                                    <MessagePartBubble
                                                        key={`${message.id}-${partIndex}`}
                                                        placement={placement}
                                                        color={color}
                                                        isUser={isUser}
                                                    >
                                                        <span>{part.text}</span>
                                                    </MessagePartBubble>
                                                );
                                            }

                                            const tool =
                                                normalizeToolPart(part);
                                            if (tool) {
                                                if (
                                                    tool.toolName ===
                                                        'getUserAnalytics' &&
                                                    tool.state ===
                                                        'output-available' &&
                                                    isUserAnalyticsOutput(
                                                        tool.output,
                                                    )
                                                ) {
                                                    return (
                                                        <MessagePartBubble
                                                            key={`${message.id}-${partIndex}`}
                                                            placement={
                                                                placement
                                                            }
                                                            color={color}
                                                            isUser={isUser}
                                                        >
                                                            <UserAnalyticsToolCard
                                                                output={
                                                                    tool.output
                                                                }
                                                            />
                                                        </MessagePartBubble>
                                                    );
                                                }

                                                return (
                                                    <MessagePartBubble
                                                        key={`${message.id}-${partIndex}`}
                                                        placement={placement}
                                                        color={color}
                                                        isUser={isUser}
                                                    >
                                                        <ToolCallPart
                                                            tool={tool}
                                                        />
                                                    </MessagePartBubble>
                                                );
                                            }

                                            return null;
                                        })
                                        .filter(isNonNullable);
                                })
                            )}
                            {isStreaming && !hasNoMessages && (
                                <span className="italic">
                                    Assistant is typing...
                                </span>
                            )}
                        </>
                    )}
                </div>
                <div className={threadLayout.composer}>
                    <div className="mb-2 overflow-x-auto flex gap-2">
                        {presentQuestions.map((question) => (
                            <PresetButton
                                key={question.label}
                                label={question.label}
                                text={question.text}
                            />
                        ))}
                    </div>
                    <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage({ text: chatInput });
                            setChatInput('');
                        }}
                    >
                        <TextInput
                            className="w-full"
                            labelClassName="w-full"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            disabled={isStreaming}
                            placeholder="Type your message..."
                        />
                        {isStreaming ? (
                            <Button
                                type="button"
                                status="primary"
                                onClick={stop}
                            >
                                <span className="flex items-center gap-2">
                                    <StopCircleIcon />
                                </span>
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                disabled={!chatInput.trim()}
                                status="primary"
                            >
                                <span className="flex items-center gap-2">
                                    Send <SendHorizontalIcon />
                                </span>
                            </Button>
                        )}
                    </form>
                </div>
            </div>
        </>
    );
}
