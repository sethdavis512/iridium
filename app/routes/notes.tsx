import { useEffect, useRef, useState } from 'react';
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
import { Modal, ModalActions } from '~/components/Modal';
import { PageHeader } from '~/components/PageHeader';
import { Pagination } from '~/components/Pagination';
import { SearchForm } from '~/components/SearchForm';
import { Field } from '~/components/forms/Field';
import { Input } from '~/components/forms/Input';
import { Textarea } from '~/components/forms/Textarea';
import { useDialog, usePendingIntent } from '~/hooks';
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

    const editorRef = useRef<HTMLDialogElement>(null);
    const editorDialog = useDialog(editorRef, { reopenOnError: editorErrors });
    const deleteRef = useRef<HTMLDialogElement>(null);
    const deleteDialog = useDialog<string>(deleteRef);

    // ?new=1 (e.g. the dashboard quick action) opens the create dialog.
    const openOnLoad = searchParams.get('new') === '1';
    const { open: openEditor } = editorDialog;
    useEffect(() => {
        if (openOnLoad) openEditor();
    }, [openOnLoad, openEditor]);

    function openCreate() {
        setEditor({ mode: 'create' });
        editorDialog.open();
    }

    function openEdit(note: { id: string; title: string; content: string }) {
        setEditor({ mode: 'edit', note });
        editorDialog.open();
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
                        <button
                            type="button"
                            className="btn btn-accent"
                            onClick={openCreate}
                        >
                            <PlusCircleIcon
                                aria-hidden="true"
                                className="mr-2 h-6 w-6"
                            />
                            New Note
                        </button>
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
                                <button type="submit" className="btn btn-sm">
                                    Clear search
                                </button>
                            </Form>
                        </EmptyState>
                    ) : (
                        <EmptyState
                            icon={NotebookPenIcon}
                            title="No notes yet"
                            description="Create your first note, or ask the chat agent to save one for you."
                        >
                            <button
                                type="button"
                                className="btn btn-accent btn-sm"
                                onClick={openCreate}
                            >
                                New Note
                            </button>
                        </EmptyState>
                    )
                ) : (
                    <>
                        <p className="text-base-content/60 text-sm">
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
                                        <p className="text-base-content/50 text-xs">
                                            Updated{' '}
                                            <FormattedDate
                                                date={note.updatedAt}
                                            />
                                        </p>
                                        <div className="card-actions justify-end">
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() =>
                                                    openEdit({
                                                        id: note.id,
                                                        title: note.title,
                                                        content: note.content,
                                                    })
                                                }
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm text-error"
                                                onClick={() =>
                                                    deleteDialog.open(note.id)
                                                }
                                            >
                                                Delete
                                            </button>
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

            <Modal
                ref={editorRef}
                title={editor.mode === 'edit' ? 'Edit note' : 'New note'}
            >
                <Form
                    method="POST"
                    className="space-y-4 pt-4"
                    onSubmit={editorDialog.close}
                >
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
                    <ModalActions>
                        <button
                            type="button"
                            className="btn"
                            onClick={editorDialog.close}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-accent"
                            disabled={pendingIntent !== null}
                        >
                            {editor.mode === 'edit'
                                ? 'Save changes'
                                : 'Create note'}
                        </button>
                    </ModalActions>
                </Form>
            </Modal>

            <Modal
                ref={deleteRef}
                title="Delete note"
                onClose={deleteDialog.clearTarget}
            >
                <p className="py-4">This will delete the note.</p>
                <ModalActions>
                    <button
                        type="button"
                        className="btn"
                        onClick={deleteDialog.close}
                    >
                        Cancel
                    </button>
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
                        <button
                            type="submit"
                            className="btn btn-error"
                            disabled={pendingIntent === 'delete-note'}
                        >
                            Delete
                        </button>
                    </Form>
                </ModalActions>
            </Modal>
        </>
    );
}
