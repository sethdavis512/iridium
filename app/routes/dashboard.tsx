import {
    NavLink,
    Outlet,
    redirect,
    useFetcher,
    useNavigate,
    useNavigation,
} from 'react-router';

import { Container } from '~/components/layout/Container';
import { Paths } from '~/constants';
import { getUserFromSession } from '~/lib/session.server';
import {
    createThread,
    deleteThread,
    getAllThreadsByUserId,
    updateThreadTitle,
} from '~/models/thread.server';
import type { Route } from './+types/dashboard';
import { Button } from '~/components/actions/Button';
import { useState } from 'react';
import {
    EllipsisIcon,
    PencilIcon,
    PlusIcon,
    SpoolIcon,
    XIcon,
} from 'lucide-react';
import { Select } from '~/components/data-input/Select';
import { Loading } from '~/components/feedback/Loading';
import { cx } from '~/cva.config';
import { TextInput } from '~/components/data-input/TextInput';

enum Intents {
    GET_THREAD = 'get-thread',
    CREATE_THREAD = 'create-thread',
    DELETE_THREAD = 'delete-thread',
    RENAME_THREAD = 'rename-thread',
}

const dashboardLayout = {
    container: 'px-4 pb-4 flex flex-col flex-1 min-h-0 overflow-hidden',
    grid: 'flex flex-col lg:grid lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] flex-1 min-h-0 gap-4',
    sidebar: 'flex-shrink-0 flex flex-col lg:min-h-0',
    sidebarDesktop: 'hidden lg:flex flex-1 min-h-0 flex-col',
    sidebarList: 'space-y-2 min-h-0 overflow-y-auto pr-1',
    main: 'flex flex-col flex-1 min-h-0 overflow-hidden',
} as const;

export async function loader({ request }: Route.LoaderArgs) {
    const user = await getUserFromSession(request);

    if (!user) {
        throw new Response('Unauthorized', { status: 401 });
    }

    try {
        const threads = await getAllThreadsByUserId(user.id);
        return { threads };
    } catch (error) {
        console.error('Failed to load threads:', error);
    }

    return { threads: [] };
}

export async function action({ request }: Route.ActionArgs) {
    const user = await getUserFromSession(request);
    const form = await request.formData();

    if (!user) {
        throw new Response('Unauthorized', { status: 401 });
    }

    if (request.method === 'POST') {
        const intent = String(form.get('intent'));

        if (intent === Intents.CREATE_THREAD) {
            const thread = await createThread(user.id);
            return redirect(thread?.id);
        }

        if (intent === Intents.DELETE_THREAD) {
            const threadId = String(form.get('threadId'));
            await deleteThread(threadId);
            return redirect(Paths.DASHBOARD);
        }

        if (intent === Intents.RENAME_THREAD) {
            const threadId = String(form.get('threadId'));
            const updatedThreadTitle = String(form.get('title'));
            await updateThreadTitle(threadId, updatedThreadTitle);
            return null;
        }
    }

    return null;
}

const Box = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <div
            className={cx(
                `bg-base-200 rounded-box p-4 border border-base-300 min-h-0`,
                className,
            )}
        >
            {children}
        </div>
    );
};

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
    const navigate = useNavigate();
    const newThreadFetcher = useFetcher();
    const renameThreadFetcher = useFetcher();
    const deleteThreadFetcher = useFetcher();
    const navigation = useNavigation();
    const isNavigating = Boolean(navigation.location);

    const [openThreadPanel, setOpenThreadPanel] = useState<string | null>(null);

    const isCreatingNewThread =
        newThreadFetcher.state !== 'idle' &&
        newThreadFetcher.formData?.get('intent') === Intents.CREATE_THREAD;

    const isRenaming =
        renameThreadFetcher.state !== 'idle' &&
        renameThreadFetcher.formData?.get('intent') === Intents.RENAME_THREAD;

    return (
        <>
            <title>Dashboard | Iridium</title>
            <meta
                name="description"
                content="Manage threads and chat with your data."
            />
            <Container className={dashboardLayout.container}>
                <div className={dashboardLayout.grid}>
                    <Box className={dashboardLayout.sidebar}>
                        <newThreadFetcher.Form method="POST">
                            <Button
                                type="submit"
                                name="intent"
                                value="create-thread"
                                disabled={isNavigating || isCreatingNewThread}
                                className="mb-4 w-full lg:w-auto"
                                status="primary"
                            >
                                {isCreatingNewThread ? (
                                    <Loading />
                                ) : (
                                    <PlusIcon />
                                )}{' '}
                                New Thread
                            </Button>
                        </newThreadFetcher.Form>
                        <Select
                            className="w-full lg:hidden"
                            placeholder="Choose a thread"
                            onChange={(event) => {
                                const threadId = event.target.value;
                                navigate(threadId);
                            }}
                            options={[
                                ...loaderData.threads.map(({ id, title }) => ({
                                    label: title!,
                                    value: id,
                                })),
                            ]}
                        />
                        <div className={dashboardLayout.sidebarDesktop}>
                            {loaderData.threads.length === 0 ? (
                                <div className="bg-base-100 p-4 rounded-box flex flex-1 flex-col items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-base-300 p-2 flex items-center justify-center mb-4">
                                        <SpoolIcon className="w-6 h-6 stroke-base-content" />
                                    </div>
                                    <p className="text-base-content text-center">
                                        No threads yet. Create a new thread to
                                        get started!
                                    </p>
                                </div>
                            ) : (
                                <ul className={dashboardLayout.sidebarList}>
                                    {loaderData.threads.map(({ id, title }) => (
                                        <li key={id}>
                                            <div className="flex gap-2">
                                                <NavLink
                                                    className={({ isActive }) =>
                                                        cx(
                                                            `grow px-3 py-2 rounded-field ${isActive ? 'bg-accent text-accent-content' : 'bg-base-100/50 hover:bg-base-100/25'}`,
                                                        )
                                                    }
                                                    to={id}
                                                >
                                                    {`${title?.substring(0, 20)}${title && title.length > 20 ? '...' : ''}`}
                                                </NavLink>
                                                <Button
                                                    onClick={() => {
                                                        if (
                                                            openThreadPanel ===
                                                            id
                                                        ) {
                                                            setOpenThreadPanel(
                                                                null,
                                                            );
                                                        } else {
                                                            setOpenThreadPanel(
                                                                id,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <EllipsisIcon className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            {openThreadPanel === id && (
                                                <div className="flex flex-col gap-2 mt-2 bg-base-100 rounded-box p-4">
                                                    <renameThreadFetcher.Form
                                                        method="POST"
                                                        className="flex gap-2"
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="threadId"
                                                            value={id}
                                                        />
                                                        <fieldset className="flex-1 flex flex-col gap-1">
                                                            <label
                                                                className="block font-bold"
                                                                htmlFor={`rename-title-${id}`}
                                                            >
                                                                New title
                                                            </label>
                                                            <TextInput
                                                                id={`rename-title-${id}`}
                                                                name="title"
                                                                type="text"
                                                                defaultValue={
                                                                    title as string
                                                                }
                                                            />
                                                        </fieldset>
                                                        <Button
                                                            className="px-3 self-end"
                                                            type="submit"
                                                            name="intent"
                                                            value="rename-thread"
                                                            status="warning"
                                                            disabled={
                                                                isNavigating ||
                                                                isRenaming
                                                            }
                                                        >
                                                            {isRenaming ? (
                                                                <Loading />
                                                            ) : (
                                                                <PencilIcon className="w-4 h-4" />
                                                            )}
                                                        </Button>
                                                    </renameThreadFetcher.Form>
                                                    <deleteThreadFetcher.Form
                                                        method="POST"
                                                        className="flex gap-2 justify-between items-center"
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="threadId"
                                                            value={id}
                                                        />
                                                        <div className="flex-1 py-2 px-4 bg-error/10 rounded-box">
                                                            Delete?
                                                        </div>
                                                        <Button
                                                            className="px-3"
                                                            type="submit"
                                                            name="intent"
                                                            value="delete-thread"
                                                            status="error"
                                                            disabled={
                                                                isNavigating
                                                            }
                                                        >
                                                            <XIcon className="w-4 h-4" />
                                                        </Button>
                                                    </deleteThreadFetcher.Form>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </Box>
                    <Box className={dashboardLayout.main}>
                        <Outlet />
                    </Box>
                </div>
            </Container>
        </>
    );
}
