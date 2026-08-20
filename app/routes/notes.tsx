import { useEffect, useState } from 'react';
import { data, Form, useSearchParams } from 'react-router';
import { NotebookPenIcon, PlusCircleIcon, SearchXIcon } from 'lucide-react';
import { z } from 'zod';
import { rateLimit } from '~/lib/rate-limit.server';
import { pageMeta, parsePage } from '~/lib/pagination';
import { APP_NAME } from '~/config';
import { redirectWithToast } from '~/lib/toast.server';
import { requireUserFromContext } from '~/context';
import { authMiddleware } from '~/middleware/auth';
import {
    countNotesByUserId,
    createNote,
    deleteNote,
    getNoteById,
    searchNotes,
    updateNote,
} from '~/models/note.server';
import { Card } from '~/components/Card';
import { Container } from '~/components/Container';
import { EmptyState } from '~/components/EmptyState';
import { FormattedDate } from '~/components/FormattedDate';
import { Button } from '~/components/ui/button';
import {
    AlertDialog,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogPopup,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {
    Dialog,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
} from '~/components/ui/dialog';
import { PageHeader } from '~/components/PageHeader';
import { Pagination } from '~/components/Pagination';
import { SearchForm } from '~/components/SearchForm';
import { Field } from '~/components/forms/Field';
import { Input } from '~/components/forms/Input';
import { Textarea } from '~/components/forms/Textarea';
import { useDialogState, usePendingIntent } from '~/hooks';
import type { Route } from './+types/notes';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

const PAGE_SIZE = 12;

type FieldErrors = Partial<Record<'title' | 'content', string[]>>;

const noteSchema = z.object({
    title: z
        .string()
        .trim()
        .min(1, { message: 'Title is required' })
        .max(200, { message: 'Title must be 200 characters or fewer' }),
    content: z
        .string()
        .trim()
        .min(1, { message: 'Content is required' })
        .max(10_000, {
            message: 'Content must be 10,000 characters or fewer',
        }),
});

export async function loader({ request, context }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const { page, pageSize, skip, take } = parsePage(url.searchParams, {
        defaultPageSize: PAGE_SIZE,
    });

    const [notes, totalCount] = await Promise.all([
        searchNotes({ userId: user.id, query, skip, take }),
        countNotesByUserId(user.id, query || undefined),
    ]);

    return {
        notes,
        query,
        page,
        ...pageMeta(totalCount, page, pageSize),
        totalCount,
    };
}

export async function action({ request, context }: Route.ActionArgs) {
    const user = requireUserFromContext(context);
    const form = await request.formData();
    const intent = String(form.get('intent'));

    if (intent === 'create-note' || intent === 'update-note') {
        const { success } = rateLimit({
            key: `note-write:${user.id}`,
            maxRequests: 30,
            windowMs: 60_000,
        });

        if (!success) {
            throw new Response('Too many requests. Please wait a moment.', {
                status: 429,
            });
        }

        const parsed = noteSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            return data(
                {
                    intent,
                    noteId: String(form.get('noteId') ?? '') || null,
                    errors: z.flattenError(parsed.error)
                        .fieldErrors as FieldErrors,
                },
                { status: 400 },
            );
        }

        if (intent === 'create-note') {
            await createNote({ ...parsed.data, userId: user.id });

            return redirectWithToast('/notes', {
                type: 'success',
                message: 'Note created.',
            });
        }

        const noteId = String(form.get('noteId'));
        const note = await getNoteById(noteId);

        if (!note) throw new Response('Note not found', { status: 404 });
        if (note.userId !== user.id) {
            throw new Response('Forbidden', { status: 403 });
        }

        await updateNote({ noteId, ...parsed.data });

        return redirectWithToast('/notes', {
            type: 'success',
            message: 'Note updated.',
        });
    }

    if (intent === 'delete-note') {
        const noteId = String(form.get('noteId'));
        const note = await getNoteById(noteId);

        if (!note) throw new Response('Note not found', { status: 404 });
        if (note.userId !== user.id) {
            throw new Response('Forbidden', { status: 403 });
        }

        await deleteNote(noteId);

        return redirectWithToast('/notes', {
            type: 'success',
            message: 'Note deleted.',
        });
    }

    throw new Response('Unknown intent', { status: 400 });
}

type EditorState =
    | { mode: 'create' }
    | { mode: 'edit'; note: { id: string; title: string; content: string } };

export default function NotesRoute({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const { notes, query, page, totalPages, totalCount } = loaderData;
    const [searchParams] = useSearchParams();
    const pendingIntent = usePendingIntent();

    const [editor, setEditor] = useState<EditorState>({ mode: 'create' });

    // Server-side validation errors reopen the editor with messages shown.
    const editorErrors =
        actionData?.intent === 'create-note' ||
        actionData?.intent === 'update-note'
            ? actionData.errors
            : null;

    const editorDialog = useDialogState({ reopenOnError: editorErrors });
    const deleteDialog = useDialogState<string>();

    // ?new=1 (e.g. the dashboard quick action) opens the create dialog.
    const openOnLoad = searchParams.get('new') === '1';
    const { openDialog: openEditor } = editorDialog;
    useEffect(() => {
        if (openOnLoad) openEditor();
    }, [openOnLoad, openEditor]);

    function openCreate() {
        setEditor({ mode: 'create' });
        editorDialog.openDialog();
    }

    function openEdit(note: { id: string; title: string; content: string }) {
        setEditor({ mode: 'edit', note });
        editorDialog.openDialog();
    }

    const isSearching = query.length > 0;

    return (
        <>
            <title>{`Notes | ${APP_NAME}`}</title>
            <meta
                name="description"
                content="Browse, search, and manage your notes."
            />
            <Container className="flex flex-col gap-4 p-4">
                <PageHeader
                    title="Notes"
                    action={
                        <Button type="button" onClick={openCreate}>
                            <PlusCircleIcon aria-hidden="true" />
                            New Note
                        </Button>
                    }
                />

                <SearchForm
                    query={query}
                    placeholder="Search notes"
                    inputLabel="Search notes"
                    submitLabel="Search"
                    groupClassName="max-w-md"
                />

                {notes.length === 0 ? (
                    isSearching ? (
                        <EmptyState
                            icon={SearchXIcon}
                            title="No notes match your search"
                            description={`Nothing found for "${query}".`}
                        >
                            <Form method="GET">
                                <Button
                                    type="submit"
                                    variant="outline"
                                    size="sm"
                                >
                                    Clear search
                                </Button>
                            </Form>
                        </EmptyState>
                    ) : (
                        <EmptyState
                            icon={NotebookPenIcon}
                            title="No notes yet"
                            description="Create your first note, or ask the chat agent to save one for you."
                        >
                            <Button
                                type="button"
                                size="sm"
                                onClick={openCreate}
                            >
                                New Note
                            </Button>
                        </EmptyState>
                    )
                ) : (
                    <>
                        <p className="text-muted-foreground text-sm">
                            {totalCount} note{totalCount === 1 ? '' : 's'}
                            {isSearching ? ` matching "${query}"` : ''}
                        </p>
                        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {notes.map((note) => (
                                <li key={note.id}>
                                    <Card title={note.title} bordered>
                                        <p className="line-clamp-3 whitespace-pre-wrap">
                                            {note.content}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            Updated{' '}
                                            <FormattedDate
                                                date={note.updatedAt}
                                            />
                                        </p>
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    openEdit({
                                                        id: note.id,
                                                        title: note.title,
                                                        content: note.content,
                                                    })
                                                }
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive"
                                                onClick={() =>
                                                    deleteDialog.openDialog(
                                                        note.id,
                                                    )
                                                }
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </Card>
                                </li>
                            ))}
                        </ul>
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            className="self-center"
                        />
                    </>
                )}
            </Container>

            <Dialog
                open={editorDialog.open}
                onOpenChange={editorDialog.onOpenChange}
            >
                <DialogPopup>
                    <DialogHeader>
                        <DialogTitle>
                            {editor.mode === 'edit' ? 'Edit note' : 'New note'}
                        </DialogTitle>
                    </DialogHeader>
                    <Form
                        method="POST"
                        className="contents"
                        onSubmit={editorDialog.close}
                    >
                        <DialogPanel className="space-y-4">
                            <input
                                type="hidden"
                                name="intent"
                                value={
                                    editor.mode === 'edit'
                                        ? 'update-note'
                                        : 'create-note'
                                }
                            />
                            {editor.mode === 'edit' && (
                                <input
                                    type="hidden"
                                    name="noteId"
                                    value={editor.note.id}
                                />
                            )}
                            <Field
                                label="Title"
                                name="title"
                                error={editorErrors?.title?.[0]}
                            >
                                {(controlProps) => (
                                    <Input
                                        key={
                                            editor.mode === 'edit'
                                                ? editor.note.id
                                                : 'create'
                                        }
                                        type="text"
                                        name="title"
                                        defaultValue={
                                            editor.mode === 'edit'
                                                ? editor.note.title
                                                : ''
                                        }
                                        placeholder="Note title"
                                        className="w-full"
                                        {...controlProps}
                                    />
                                )}
                            </Field>
                            <Field
                                label="Content"
                                name="content"
                                error={editorErrors?.content?.[0]}
                            >
                                {(controlProps) => (
                                    <Textarea
                                        key={
                                            editor.mode === 'edit'
                                                ? editor.note.id
                                                : 'create'
                                        }
                                        name="content"
                                        rows={6}
                                        defaultValue={
                                            editor.mode === 'edit'
                                                ? editor.note.content
                                                : ''
                                        }
                                        placeholder="Write something worth remembering"
                                        className="w-full"
                                        {...controlProps}
                                    />
                                )}
                            </Field>
                        </DialogPanel>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={editorDialog.close}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={pendingIntent !== null}
                            >
                                {editor.mode === 'edit'
                                    ? 'Save changes'
                                    : 'Create note'}
                            </Button>
                        </DialogFooter>
                    </Form>
                </DialogPopup>
            </Dialog>

            <AlertDialog
                open={deleteDialog.open}
                onOpenChange={deleteDialog.onOpenChange}
            >
                <AlertDialogPopup>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete note</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete the note.
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
                                value="delete-note"
                            />
                            <input
                                type="hidden"
                                name="noteId"
                                value={deleteDialog.target ?? ''}
                            />
                            <Button
                                type="submit"
                                variant="destructive"
                                loading={pendingIntent === 'delete-note'}
                            >
                                Delete
                            </Button>
                        </Form>
                    </AlertDialogFooter>
                </AlertDialogPopup>
            </AlertDialog>
        </>
    );
}
