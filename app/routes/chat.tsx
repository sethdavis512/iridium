import { Container } from '~/components/Container';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { SearchForm } from '~/components/SearchForm';
import { Button } from '~/components/ui/button';
import {
    AlertDialog,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogPopup,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { useDialogState, usePendingIntent } from '~/hooks';
import { authMiddleware } from '~/middleware/auth';
import { rateLimit } from '~/lib/rate-limit.server';
import { navLinkClassName } from '~/shared';
import { APP_NAME } from '~/config';
import type { Route } from './+types/chat';
import {
    createThread,
    deleteThread,
    getAllThreadsByUserId,
    getThreadById,
    searchThreads,
    updateThreadModel,
} from '~/models/thread.server';
import { modelIdSchema } from '~/lib/ai-models';
import { requireUserFromContext } from '~/context';
import {
    data,
    Form,
    NavLink,
    Outlet,
    redirect,
    useNavigation,
} from 'react-router';
import {
    LoaderCircleIcon,
    MessagesSquareIcon,
    PlusCircleIcon,
    Trash2Icon,
} from 'lucide-react';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const threads = query
        ? await searchThreads(user.id, query)
        : await getAllThreadsByUserId(user.id);

    return { threads, query };
}

export async function action({ request, context }: Route.ActionArgs) {
    if (request.method !== 'POST') {
        throw new Response('Method not allowed', { status: 405 });
    }

    const user = requireUserFromContext(context);
    const form = await request.formData();
    const intent = String(form.get('intent'));

    if (intent === 'new-thread') {
        const { success } = rateLimit({
            key: `thread-create:${user.id}`,
            maxRequests: 30,
            windowMs: 60_000,
        });

        if (!success) {
            throw new Response(
                'Too many threads created. Please wait a moment.',
                { status: 429 },
            );
        }

        try {
            const thread = await createThread(user.id);
            return redirect(thread.id);
        } catch {
            throw new Response('Failed to create thread', { status: 500 });
        }
    }

    if (intent === 'set-model') {
        const threadId = String(form.get('threadId'));
        const parsedModel = modelIdSchema.safeParse(form.get('model'));

        if (!parsedModel.success) {
            throw new Response('Invalid model', { status: 400 });
        }

        const thread = await getThreadById(threadId);

        if (!thread) {
            throw new Response('Thread not found', { status: 404 });
        }
        if (thread.createdById !== user.id) {
            throw new Response('Forbidden', { status: 403 });
        }

        await updateThreadModel(threadId, parsedModel.data);

        return data({ ok: true });
    }

    if (intent === 'delete-thread') {
        const { success } = rateLimit({
            key: `thread-delete:${user.id}`,
            maxRequests: 60,
            windowMs: 60_000,
        });

        if (!success) {
            throw new Response('Too many requests. Please wait a moment.', {
                status: 429,
            });
        }

        const threadId = String(form.get('threadId'));
        const thread = await getThreadById(threadId);

        if (!thread) {
            throw new Response('Thread not found', { status: 404 });
        }
        if (thread.createdById !== user.id) {
            throw new Response('Forbidden', { status: 403 });
        }

        await deleteThread(threadId);

        return redirect('/chat');
    }

    throw new Response('Unknown intent', { status: 400 });
}

function getThreadLabel(thread: {
    title?: string | null;
    messages: { content: string }[];
}): string {
    if (thread.title && thread.title !== 'Untitled') return thread.title;

    try {
        const parts = JSON.parse(thread.messages[0]?.content ?? '[]');
        const text = parts
            .filter((p: { type: string }) => p.type === 'text')
            .map((p: { text: string }) => p.text)
            .join('');

        return text.length > 30
            ? `${text.slice(0, 30)}...`
            : text || 'New Thread';
    } catch {
        return 'New Thread';
    }
}

export default function ChatRoute({ loaderData }: Route.ComponentProps) {
    const navigation = useNavigation();
    const pendingIntent = usePendingIntent();
    const deleteDialog = useDialogState<string>();

    const isCreating = pendingIntent === 'new-thread';
    const deletingThreadId =
        pendingIntent === 'delete-thread'
            ? String(navigation.formData?.get('threadId'))
            : null;

    return (
        <>
            <title>{`Chat | ${APP_NAME}`}</title>
            <meta name="description" content="This is the chat page" />
            <Container className="flex min-h-0 grow flex-col gap-4 p-4">
                <PageHeader
                    title="Chat"
                    action={
                        <Form method="POST">
                            <input
                                type="hidden"
                                name="intent"
                                value="new-thread"
                            />
                            <button
                                className="btn btn-accent"
                                type="submit"
                                disabled={isCreating}
                            >
                                {isCreating ? (
                                    <LoaderCircleIcon
                                        aria-hidden="true"
                                        className="mr-2 h-6 w-6 animate-spin"
                                    />
                                ) : (
                                    <PlusCircleIcon
                                        aria-hidden="true"
                                        className="mr-2 h-6 w-6"
                                    />
                                )}
                                New Thread
                            </button>
                        </Form>
                    }
                />
                <div className="grid min-h-0 grow grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4 md:grid-cols-12 md:grid-rows-1">
                    <div className="col-span-1 max-h-48 overflow-y-auto md:col-span-5 md:max-h-none lg:col-span-3">
                        <SearchForm
                            query={loaderData.query}
                            placeholder="Search conversations"
                            inputLabel="Search conversations"
                            inputSize="sm"
                            className="mb-3"
                        />
                        <nav aria-label="Conversations">
                            <ul className="flex flex-col gap-4">
                                {loaderData.threads &&
                                loaderData.threads.length > 0 ? (
                                    loaderData.threads.map((thread) => (
                                        <li
                                            key={thread.id}
                                            className="group relative"
                                        >
                                            <NavLink
                                                to={thread.id}
                                                className={navLinkClassName}
                                            >
                                                <span className="truncate pr-6 pointer-coarse:pr-10">
                                                    {getThreadLabel(thread)}
                                                </span>
                                            </NavLink>
                                            <button
                                                type="button"
                                                aria-label="Delete thread"
                                                className="btn btn-ghost btn-xs text-error pointer-coarse:btn-sm absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                                                disabled={
                                                    deletingThreadId ===
                                                    thread.id
                                                }
                                                onClick={() =>
                                                    deleteDialog.openDialog(
                                                        thread.id,
                                                    )
                                                }
                                            >
                                                {deletingThreadId ===
                                                thread.id ? (
                                                    <LoaderCircleIcon className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2Icon className="h-4 w-4" />
                                                )}
                                            </button>
                                        </li>
                                    ))
                                ) : loaderData.query ? (
                                    <li>
                                        <EmptyState
                                            icon={MessagesSquareIcon}
                                            title="No matches"
                                            description={`Nothing found for "${loaderData.query}".`}
                                            className="p-4"
                                        />
                                    </li>
                                ) : (
                                    <li>
                                        <EmptyState
                                            icon={MessagesSquareIcon}
                                            title="No conversations yet"
                                            description='Start one with "New Thread".'
                                            className="p-4"
                                        />
                                    </li>
                                )}
                            </ul>
                        </nav>
                    </div>
                    <div className="col-span-1 flex min-h-0 flex-col gap-4 overflow-hidden md:col-span-7 lg:col-span-9">
                        <Outlet />
                    </div>
                </div>
            </Container>

            <AlertDialog
                open={deleteDialog.open}
                onOpenChange={deleteDialog.onOpenChange}
            >
                <AlertDialogPopup>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete thread</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete this conversation and all its
                            messages.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={deleteDialog.close}
                        >
                            Cancel
                        </Button>
                        <Form method="POST" onSubmit={deleteDialog.close}>
                            <input
                                type="hidden"
                                name="intent"
                                value="delete-thread"
                            />
                            <input
                                type="hidden"
                                name="threadId"
                                value={deleteDialog.target ?? ''}
                            />
                            <Button type="submit" variant="destructive">
                                Delete
                            </Button>
                        </Form>
                    </AlertDialogFooter>
                </AlertDialogPopup>
            </AlertDialog>
        </>
    );
}
