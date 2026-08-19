import { useEffect } from 'react';
import {
    data,
    Form,
    isRouteErrorResponse,
    useFetcher,
    useRouteError,
} from 'react-router';
import { ShieldIcon } from 'lucide-react';
import { z } from 'zod';
import { APIError } from 'better-auth';
import { auth } from '~/lib/auth.server';
import { pageMeta, parsePage } from '~/lib/pagination';
import { rateLimit } from '~/lib/rate-limit.server';
import { redirectWithToast } from '~/lib/toast.server';
import { authMiddleware } from '~/middleware/auth';
import { requireAdmin } from '~/models/session.server';
import { countUsers, listUsers, updateUserRole } from '~/models/user.server';
import { Container } from '~/components/Container';
import { EmptyState } from '~/components/EmptyState';
import { FormattedDate } from '~/components/FormattedDate';
import { Button } from '~/components/ui/button';
import {
    Dialog,
    DialogDescription,
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
import { FormAlert } from '~/components/forms/FormAlert';
import { Input } from '~/components/forms/Input';
import { Select } from '~/components/forms/Select';
import { useDialogState } from '~/hooks';
import type { Route } from './+types/admin';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

const PAGE_SIZE = 20;

// Literal strings, not the Prisma Role enum: this array renders in the
// component, and importing the generated client into browser code pulls
// Prisma's Node runtime into the bundle and breaks hydration.
const ROLES = ['USER', 'EDITOR', 'ADMIN'] as const;

const setRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.enum(ROLES),
});

const banSchema = z.object({
    userId: z.string().min(1),
    banReason: z
        .string()
        .trim()
        .min(1, { message: 'A ban reason is required' })
        .max(500, { message: 'Reason must be 500 characters or fewer' }),
});

const userIdSchema = z.object({
    userId: z.string().min(1),
});

const STATUSES = ['active', 'banned'] as const;

// Invalid values fall back to "no filter" rather than erroring.
const filterSchema = z.object({
    role: z.enum(ROLES).optional().catch(undefined),
    status: z.enum(STATUSES).optional().catch(undefined),
});

export async function loader({ request }: Route.LoaderArgs) {
    const admin = await requireAdmin(request);

    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const { role, status } = filterSchema.parse({
        role: url.searchParams.get('role') || undefined,
        status: url.searchParams.get('status') || undefined,
    });
    const { page, pageSize, skip, take } = parsePage(url.searchParams, {
        defaultPageSize: PAGE_SIZE,
    });

    const filters = {
        query: query || undefined,
        role,
        banned: status === undefined ? undefined : status === 'banned',
    };

    const [users, totalCount] = await Promise.all([
        listUsers({ ...filters, skip, take }),
        countUsers(filters),
    ]);

    return {
        adminId: admin.id,
        users,
        query,
        role: role ?? '',
        status: status ?? '',
        page,
        totalCount,
        ...pageMeta(totalCount, page, pageSize),
    };
}

export async function action({ request }: Route.ActionArgs) {
    const admin = await requireAdmin(request);

    const { success } = rateLimit({
        key: `admin:${admin.id}`,
        maxRequests: 30,
        windowMs: 60_000,
    });

    if (!success) {
        throw new Response('Too many requests. Please wait a moment.', {
            status: 429,
        });
    }

    const form = await request.formData();
    const intent = String(form.get('intent'));
    const isSelf = String(form.get('userId')) === admin.id;

    if (intent === 'set-role') {
        const parsed = setRoleSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            throw new Response('Invalid role change', { status: 400 });
        }
        if (isSelf) {
            return data(
                { formError: 'You cannot change your own role.' },
                { status: 400 },
            );
        }

        await updateUserRole(parsed.data.userId, parsed.data.role);

        return redirectWithToast('/admin', {
            type: 'success',
            message: `Role updated to ${parsed.data.role}.`,
        });
    }

    if (intent === 'ban-user') {
        const parsed = banSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            return data(
                {
                    formError:
                        z.flattenError(parsed.error).fieldErrors
                            .banReason?.[0] ?? 'Invalid ban request',
                },
                { status: 400 },
            );
        }
        if (isSelf) {
            return data(
                { formError: 'You cannot ban yourself.' },
                { status: 400 },
            );
        }

        // Better Auth's banUser also revokes the user's sessions.
        await auth.api.banUser({
            body: {
                userId: parsed.data.userId,
                banReason: parsed.data.banReason,
            },
            headers: request.headers,
        });

        return redirectWithToast('/admin', {
            type: 'success',
            message: 'User banned.',
        });
    }

    if (intent === 'unban-user') {
        const parsed = userIdSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            throw new Response('Invalid request', { status: 400 });
        }

        await auth.api.unbanUser({
            body: { userId: parsed.data.userId },
            headers: request.headers,
        });

        return redirectWithToast('/admin', {
            type: 'success',
            message: 'User unbanned.',
        });
    }

    if (intent === 'impersonate-user') {
        const parsed = userIdSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            throw new Response('Invalid request', { status: 400 });
        }
        if (isSelf) {
            return data(
                { formError: 'You cannot impersonate yourself.' },
                { status: 400 },
            );
        }

        try {
            // returnHeaders forwards the impersonation session cookie.
            const { headers } = await auth.api.impersonateUser({
                body: { userId: parsed.data.userId },
                headers: request.headers,
                returnHeaders: true,
            });

            headers.set('Location', '/dashboard');

            return new Response(null, { status: 302, headers });
        } catch (error) {
            const message =
                error instanceof APIError
                    ? `Impersonation failed: ${error.message}`
                    : 'Impersonation failed.';

            return data({ formError: message }, { status: 400 });
        }
    }

    throw new Response('Unknown intent', { status: 400 });
}

export default function AdminRoute({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const {
        adminId,
        users,
        query,
        role,
        status,
        page,
        totalPages,
        totalCount,
    } = loaderData;
    const roleFetcher = useFetcher();
    const banDialog = useDialogState<{ id: string; email: string }>();

    const formError = actionData?.formError ?? null;
    const banTarget = banDialog.target;
    const { openDialog: openBanDialog } = banDialog;

    // Reopen the ban dialog when the server rejected the ban form. Only
    // while a target is set: other action errors have no row context.
    useEffect(() => {
        if (formError && banTarget) openBanDialog();
    }, [formError, banTarget, openBanDialog]);

    return (
        <>
            <title>Admin | Iridium</title>
            <meta name="description" content="Manage users and roles." />
            <Container className="flex flex-col gap-4 p-4">
                <PageHeader title="Admin" />
                <FormAlert message={formError} />

                <SearchForm
                    query={query}
                    placeholder="Search by name or email"
                    inputLabel="Search users"
                    submitLabel="Search"
                    groupClassName="max-w-md grow"
                    className="flex flex-wrap items-center gap-2"
                >
                    <Select
                        name="role"
                        aria-label="Filter by role"
                        defaultValue={role}
                        className="w-auto"
                        onChange={(event) =>
                            event.currentTarget.form?.requestSubmit()
                        }
                    >
                        <option value="">All roles</option>
                        {ROLES.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                                {roleOption}
                            </option>
                        ))}
                    </Select>
                    <Select
                        name="status"
                        aria-label="Filter by status"
                        defaultValue={status}
                        className="w-auto"
                        onChange={(event) =>
                            event.currentTarget.form?.requestSubmit()
                        }
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="banned">Banned</option>
                    </Select>
                </SearchForm>

                <p className="text-base-content/60 text-sm">
                    {totalCount} user{totalCount === 1 ? '' : 's'}
                    {query ? ` matching "${query}"` : ''}
                    {role ? ` with role ${role}` : ''}
                    {status ? ` (${status})` : ''}
                </p>

                {users.length === 0 ? (
                    <EmptyState
                        icon={ShieldIcon}
                        title="No users found"
                        description={
                            query ? `Nothing found for "${query}".` : undefined
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    const isSelf = user.id === adminId;

                                    return (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="font-semibold">
                                                    {user.name}
                                                    {isSelf && (
                                                        <span className="badge badge-ghost badge-sm ml-2">
                                                            You
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-base-content/60 text-sm">
                                                    {user.email}
                                                </div>
                                            </td>
                                            <td>
                                                {isSelf ? (
                                                    <span className="badge">
                                                        {user.role}
                                                    </span>
                                                ) : (
                                                    <roleFetcher.Form method="POST">
                                                        <input
                                                            type="hidden"
                                                            name="intent"
                                                            value="set-role"
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="userId"
                                                            value={user.id}
                                                        />
                                                        <Select
                                                            name="role"
                                                            selectSize="sm"
                                                            aria-label={`Role for ${user.email}`}
                                                            defaultValue={
                                                                user.role ??
                                                                'USER'
                                                            }
                                                            onChange={(event) =>
                                                                roleFetcher.submit(
                                                                    event
                                                                        .currentTarget
                                                                        .form,
                                                                )
                                                            }
                                                        >
                                                            {ROLES.map(
                                                                (role) => (
                                                                    <option
                                                                        key={
                                                                            role
                                                                        }
                                                                        value={
                                                                            role
                                                                        }
                                                                    >
                                                                        {role}
                                                                    </option>
                                                                ),
                                                            )}
                                                        </Select>
                                                    </roleFetcher.Form>
                                                )}
                                            </td>
                                            <td>
                                                {user.banned ? (
                                                    <span
                                                        className="badge badge-error"
                                                        title={
                                                            user.banReason ??
                                                            undefined
                                                        }
                                                    >
                                                        Banned
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-success badge-outline">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-base-content/60 text-sm">
                                                <FormattedDate
                                                    date={user.createdAt}
                                                />
                                            </td>
                                            <td>
                                                {!isSelf && (
                                                    <div className="flex justify-end gap-1">
                                                        <Form method="POST">
                                                            <input
                                                                type="hidden"
                                                                name="intent"
                                                                value="impersonate-user"
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="userId"
                                                                value={user.id}
                                                            />
                                                            <button
                                                                type="submit"
                                                                className="btn btn-ghost btn-xs pointer-coarse:btn-sm"
                                                            >
                                                                Impersonate
                                                            </button>
                                                        </Form>
                                                        {user.banned ? (
                                                            <Form method="POST">
                                                                <input
                                                                    type="hidden"
                                                                    name="intent"
                                                                    value="unban-user"
                                                                />
                                                                <input
                                                                    type="hidden"
                                                                    name="userId"
                                                                    value={
                                                                        user.id
                                                                    }
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    className="btn btn-ghost btn-xs pointer-coarse:btn-sm"
                                                                >
                                                                    Unban
                                                                </button>
                                                            </Form>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-xs text-error pointer-coarse:btn-sm"
                                                                onClick={() =>
                                                                    banDialog.openDialog(
                                                                        user,
                                                                    )
                                                                }
                                                            >
                                                                Ban
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination
                    page={page}
                    totalPages={totalPages}
                    className="self-center"
                />
            </Container>

            <Dialog open={banDialog.open} onOpenChange={banDialog.onOpenChange}>
                <DialogPopup>
                    <DialogHeader>
                        <DialogTitle>Ban {banTarget?.email ?? ''}</DialogTitle>
                        <DialogDescription>
                            Banning revokes the user&apos;s sessions and blocks
                            sign-in until they are unbanned.
                        </DialogDescription>
                    </DialogHeader>
                    <Form
                        method="POST"
                        className="contents"
                        onSubmit={banDialog.close}
                    >
                        <DialogPanel className="space-y-4">
                            <input
                                type="hidden"
                                name="intent"
                                value="ban-user"
                            />
                            <input
                                type="hidden"
                                name="userId"
                                value={banTarget?.id ?? ''}
                            />
                            <Field label="Reason" name="banReason">
                                {(controlProps) => (
                                    <Input
                                        type="text"
                                        name="banReason"
                                        placeholder="Why is this user being banned?"
                                        required
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
                                onClick={banDialog.close}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" variant="destructive">
                                Ban user
                            </Button>
                        </DialogFooter>
                    </Form>
                </DialogPopup>
            </Dialog>
        </>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();

    const message = isRouteErrorResponse(error)
        ? `${error.status} ${
              typeof error.data === 'string' ? error.data : error.statusText
          }`
        : 'Something went wrong loading the admin panel.';

    return (
        <Container className="p-4">
            <FormAlert message={message} />
        </Container>
    );
}
