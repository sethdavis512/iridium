import { Form, Link } from 'react-router';
import {
    MessagesSquareIcon,
    NotebookPenIcon,
    PlusCircleIcon,
} from 'lucide-react';
import { requireUserFromContext } from '~/context';
import { authMiddleware } from '~/middleware/auth';
import {
    countThreadsByUserId,
    getAllThreadsByUserId,
} from '~/models/thread.server';
import { countNotesByUserId, getNotesByUserId } from '~/models/note.server';
import { APP_NAME } from '~/config';
import { Card } from '~/components/Card';
import { Container } from '~/components/Container';
import { EmptyState } from '~/components/EmptyState';
import { FormattedDate } from '~/components/FormattedDate';
import { PageHeader } from '~/components/PageHeader';
import { StatTile } from '~/components/StatTile';
import { Button } from '~/components/ui/button';
import type { Route } from './+types/dashboard';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);

    const [threadCount, noteCount, recentThreads, recentNotes] =
        await Promise.all([
            countThreadsByUserId(user.id),
            countNotesByUserId(user.id),
            getAllThreadsByUserId(user.id, { take: 5 }),
            getNotesByUserId(user.id, { take: 3 }),
        ]);

    return {
        name: user.name,
        memberSince: user.createdAt,
        threadCount,
        noteCount,
        recentThreads: recentThreads.map((thread) => ({
            id: thread.id,
            title: thread.title ?? 'Untitled',
            createdAt: thread.createdAt,
        })),
        recentNotes: recentNotes.map((note) => ({
            id: note.id,
            title: note.title,
            updatedAt: note.updatedAt,
        })),
    };
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
    const {
        name,
        memberSince,
        threadCount,
        noteCount,
        recentThreads,
        recentNotes,
    } = loaderData;

    return (
        <>
            <title>{`Dashboard | ${APP_NAME}`}</title>
            <meta
                name="description"
                content={`Your ${APP_NAME} activity at a glance.`}
            />
            <Container className="flex flex-col gap-6 p-4">
                <PageHeader title={`Hello ${name}!`}>
                    <p className="text-muted-foreground">
                        Here is what is happening in your workspace.
                    </p>
                </PageHeader>

                <div className="grid gap-4 md:grid-cols-3">
                    <StatTile title="Conversations">{threadCount}</StatTile>
                    <StatTile title="Notes">{noteCount}</StatTile>
                    <StatTile title="Member since">
                        <span className="text-lg">
                            <FormattedDate date={memberSince} />
                        </span>
                    </StatTile>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Form method="POST" action="/chat">
                        <input type="hidden" name="intent" value="new-thread" />
                        <Button type="submit">
                            <PlusCircleIcon aria-hidden="true" />
                            New Thread
                        </Button>
                    </Form>
                    <Button
                        variant="outline"
                        render={<Link to="/notes?new=1" />}
                    >
                        <NotebookPenIcon aria-hidden="true" />
                        New Note
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card title="Recent conversations" bordered>
                        {recentThreads.length === 0 ? (
                            <EmptyState
                                icon={MessagesSquareIcon}
                                title="No conversations yet"
                                description="Start a thread and chat with the agent."
                            />
                        ) : (
                            <ul className="divide-border divide-y">
                                {recentThreads.map((thread) => (
                                    <li key={thread.id}>
                                        <Link
                                            to={`/chat/${thread.id}`}
                                            className="hover:bg-accent flex items-center justify-between gap-4 rounded px-2 py-3"
                                        >
                                            <span className="truncate">
                                                {thread.title}
                                            </span>
                                            <span className="text-muted-foreground shrink-0 text-xs">
                                                <FormattedDate
                                                    date={thread.createdAt}
                                                />
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card title="Recent notes" bordered>
                        {recentNotes.length === 0 ? (
                            <EmptyState
                                icon={NotebookPenIcon}
                                title="No notes yet"
                                description="Create one here or ask the agent to save something."
                            />
                        ) : (
                            <>
                                <ul className="divide-border divide-y">
                                    {recentNotes.map((note) => (
                                        <li
                                            key={note.id}
                                            className="flex items-center justify-between gap-4 px-2 py-3"
                                        >
                                            <span className="truncate">
                                                {note.title}
                                            </span>
                                            <span className="text-muted-foreground shrink-0 text-xs">
                                                <FormattedDate
                                                    date={note.updatedAt}
                                                />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex justify-end">
                                    <Link
                                        to="/notes"
                                        className="text-sm underline underline-offset-4"
                                    >
                                        View all notes
                                    </Link>
                                </div>
                            </>
                        )}
                    </Card>
                </div>
            </Container>
        </>
    );
}
