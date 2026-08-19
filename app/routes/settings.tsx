import { data, Form } from 'react-router';
import { TriangleAlertIcon } from 'lucide-react';
import { z } from 'zod';
import { APIError } from 'better-auth';
import { auth } from '~/lib/auth.server';
import { rateLimit } from '~/lib/rate-limit.server';
import { redirectWithToast } from '~/lib/toast.server';
import { requireUserFromContext } from '~/context';
import { authMiddleware } from '~/middleware/auth';
import { getUserById, updateUserProfile } from '~/models/user.server';
import { APP_NAME } from '~/config';
import { Card } from '~/components/Card';
import { Container } from '~/components/Container';
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
import { Field } from '~/components/forms/Field';
import { FormAlert } from '~/components/forms/FormAlert';
import { Input } from '~/components/forms/Input';
import { Textarea } from '~/components/forms/Textarea';
import { useDialogState, usePendingIntent } from '~/hooks';
import type { Route } from './+types/settings';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

type FieldErrors = Partial<
    Record<
        'name' | 'bio' | 'currentPassword' | 'newPassword' | 'password',
        string[]
    >
>;

const profileSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, { message: 'Name is required' })
        .max(100, { message: 'Name must be 100 characters or fewer' }),
    bio: z
        .string()
        .trim()
        .max(1000, { message: 'Bio must be 1,000 characters or fewer' }),
});

const passwordSchema = z.object({
    currentPassword: z
        .string()
        .min(1, { message: 'Current password is required' }),
    newPassword: z
        .string()
        .min(8, { message: 'Password must be at least 8 characters' })
        .max(128, { message: 'Password must be 128 characters or fewer' }),
});

const deleteSchema = z.object({
    password: z.string().min(1, { message: 'Password is required' }),
});

export async function loader({ context }: Route.LoaderArgs) {
    const sessionUser = requireUserFromContext(context);
    // Read from the DB, not the session: the session cookie cache can lag
    // profile edits by up to five minutes.
    const user = await getUserById(sessionUser.id);

    if (!user) throw new Response('Not found', { status: 404 });

    return {
        user: {
            name: user.name,
            email: user.email,
            bio: user.bio,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
        },
    };
}

export async function action({ request, context }: Route.ActionArgs) {
    const user = requireUserFromContext(context);

    const { success } = rateLimit({
        key: `settings:${user.id}`,
        maxRequests: 10,
        windowMs: 60_000,
    });

    if (!success) {
        throw new Response('Too many requests. Please wait a moment.', {
            status: 429,
        });
    }

    const form = await request.formData();
    const intent = String(form.get('intent'));

    if (intent === 'update-profile') {
        const parsed = profileSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            return data(
                {
                    intent,
                    errors: z.flattenError(parsed.error)
                        .fieldErrors as FieldErrors,
                    formError: null,
                },
                { status: 400 },
            );
        }

        await updateUserProfile(user.id, {
            name: parsed.data.name,
            bio: parsed.data.bio || null,
        });

        return redirectWithToast('/settings', {
            type: 'success',
            message: 'Profile updated.',
        });
    }

    if (intent === 'change-password') {
        const parsed = passwordSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            return data(
                {
                    intent,
                    errors: z.flattenError(parsed.error)
                        .fieldErrors as FieldErrors,
                    formError: null,
                },
                { status: 400 },
            );
        }

        try {
            await auth.api.changePassword({
                body: {
                    currentPassword: parsed.data.currentPassword,
                    newPassword: parsed.data.newPassword,
                    revokeOtherSessions: true,
                },
                headers: request.headers,
            });
        } catch (error) {
            const message =
                error instanceof APIError
                    ? 'Current password is incorrect.'
                    : 'Failed to change password. Try again.';

            return data(
                { intent, errors: null, formError: message },
                { status: 400 },
            );
        }

        return redirectWithToast('/settings', {
            type: 'success',
            message: 'Password changed. Other sessions were signed out.',
        });
    }

    if (intent === 'delete-account') {
        const parsed = deleteSchema.safeParse(Object.fromEntries(form));

        if (!parsed.success) {
            return data(
                {
                    intent,
                    errors: z.flattenError(parsed.error)
                        .fieldErrors as FieldErrors,
                    formError: null,
                },
                { status: 400 },
            );
        }

        try {
            // returnHeaders forwards the session-clearing Set-Cookie.
            const { headers } = await auth.api.deleteUser({
                body: { password: parsed.data.password },
                headers: request.headers,
                returnHeaders: true,
            });

            headers.set('Location', '/');

            return new Response(null, { status: 302, headers });
        } catch {
            return data(
                {
                    intent,
                    errors: null,
                    formError: 'Incorrect password. Account not deleted.',
                },
                { status: 400 },
            );
        }
    }

    throw new Response('Unknown intent', { status: 400 });
}

export default function SettingsRoute({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const { user } = loaderData;
    const pendingIntent = usePendingIntent();

    const errorsFor = (intent: string) =>
        actionData?.intent === intent ? actionData : null;

    // Keep the delete dialog open when the password was wrong.
    const deleteError = errorsFor('delete-account')?.formError ?? null;
    const deleteDialog = useDialogState({ reopenOnError: deleteError });

    return (
        <>
            <title>{`Settings | ${APP_NAME}`}</title>
            <meta
                name="description"
                content={`Manage your ${APP_NAME} profile, password, and account.`}
            />
            <Container className="flex flex-col gap-6 p-4">
                <PageHeader title="Settings" />

                <Card title="Profile" bordered>
                    <p className="text-base-content/60 text-sm">
                        Signed in as {user.email}
                        {user.emailVerified ? (
                            <span className="badge badge-success badge-sm ml-2">
                                Verified
                            </span>
                        ) : (
                            <span className="badge badge-ghost badge-sm ml-2">
                                Unverified
                            </span>
                        )}
                    </p>
                    <Form method="POST" className="space-y-4">
                        <input
                            type="hidden"
                            name="intent"
                            value="update-profile"
                        />
                        <Field
                            label="Name"
                            name="name"
                            error={
                                errorsFor('update-profile')?.errors?.name?.[0]
                            }
                            disabled={pendingIntent === 'update-profile'}
                        >
                            {(controlProps) => (
                                <Input
                                    type="text"
                                    name="name"
                                    defaultValue={user.name}
                                    className="w-full"
                                    {...controlProps}
                                />
                            )}
                        </Field>
                        <Field
                            label="Bio"
                            name="bio"
                            error={
                                errorsFor('update-profile')?.errors?.bio?.[0]
                            }
                            disabled={pendingIntent === 'update-profile'}
                        >
                            {(controlProps) => (
                                <Textarea
                                    name="bio"
                                    rows={3}
                                    defaultValue={user.bio ?? ''}
                                    placeholder="A line or two about you"
                                    className="w-full"
                                    {...controlProps}
                                />
                            )}
                        </Field>
                        <button
                            className="btn btn-accent"
                            type="submit"
                            disabled={pendingIntent === 'update-profile'}
                        >
                            {pendingIntent === 'update-profile'
                                ? 'Saving…'
                                : 'Save profile'}
                        </button>
                    </Form>
                </Card>

                <Card title="Password" bordered>
                    <FormAlert
                        message={errorsFor('change-password')?.formError}
                    />
                    <Form method="POST" className="space-y-4">
                        <input
                            type="hidden"
                            name="intent"
                            value="change-password"
                        />
                        <Field
                            label="Current password"
                            name="currentPassword"
                            error={
                                errorsFor('change-password')?.errors
                                    ?.currentPassword?.[0]
                            }
                            disabled={pendingIntent === 'change-password'}
                        >
                            {(controlProps) => (
                                <Input
                                    type="password"
                                    name="currentPassword"
                                    autoComplete="current-password"
                                    required
                                    className="w-full"
                                    {...controlProps}
                                />
                            )}
                        </Field>
                        <Field
                            label="New password"
                            name="newPassword"
                            error={
                                errorsFor('change-password')?.errors
                                    ?.newPassword?.[0]
                            }
                            disabled={pendingIntent === 'change-password'}
                        >
                            {(controlProps) => (
                                <Input
                                    type="password"
                                    name="newPassword"
                                    autoComplete="new-password"
                                    placeholder="At least 8 characters"
                                    required
                                    className="w-full"
                                    {...controlProps}
                                />
                            )}
                        </Field>
                        <button
                            className="btn"
                            type="submit"
                            disabled={pendingIntent === 'change-password'}
                        >
                            {pendingIntent === 'change-password'
                                ? 'Changing…'
                                : 'Change password'}
                        </button>
                    </Form>
                </Card>

                <Card title="Danger zone" bordered className="border-error">
                    <p>
                        Deleting your account removes your profile, threads,
                        messages, and notes. There is no way back.
                    </p>
                    <div className="card-actions">
                        <button
                            type="button"
                            className="btn btn-error btn-outline"
                            onClick={() => deleteDialog.openDialog()}
                        >
                            Delete account
                        </button>
                    </div>
                </Card>
            </Container>

            <Dialog
                open={deleteDialog.open}
                onOpenChange={deleteDialog.onOpenChange}
            >
                <DialogPopup>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <TriangleAlertIcon
                                aria-hidden="true"
                                className="text-destructive h-5 w-5"
                            />
                            Delete account
                        </DialogTitle>
                        <DialogDescription>
                            This permanently deletes your account and everything
                            in it. Enter your password to confirm.
                        </DialogDescription>
                    </DialogHeader>
                    <Form method="POST" className="contents">
                        <DialogPanel className="space-y-4">
                            <FormAlert message={deleteError} />
                            <input
                                type="hidden"
                                name="intent"
                                value="delete-account"
                            />
                            <Field
                                label="Password"
                                name="password"
                                error={
                                    errorsFor('delete-account')?.errors
                                        ?.password?.[0]
                                }
                                disabled={pendingIntent === 'delete-account'}
                            >
                                {(controlProps) => (
                                    <Input
                                        type="password"
                                        name="password"
                                        autoComplete="current-password"
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
                                onClick={deleteDialog.close}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="destructive"
                                loading={pendingIntent === 'delete-account'}
                            >
                                Delete my account
                            </Button>
                        </DialogFooter>
                    </Form>
                </DialogPopup>
            </Dialog>
        </>
    );
}
