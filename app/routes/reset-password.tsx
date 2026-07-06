import { data, Form, redirect } from 'react-router';
import { z } from 'zod';
import { auth } from '~/lib/auth.server';
import { redirectWithToast } from '~/lib/toast.server';
import { requireAnonymous } from '~/models/session.server';
import { APP_NAME } from '~/config';
import { Spinner } from '~/components/Spinner';
import { Field } from '~/components/forms/Field';
import { FormAlert } from '~/components/forms/FormAlert';
import { Input } from '~/components/forms/Input';
import { useIsSubmitting } from '~/hooks';
import type { Route } from './+types/reset-password';

const schema = z
    .object({
        token: z.string().min(1),
        password: z
            .string()
            .min(8, { message: 'Password must be at least 8 characters' })
            .max(128, { message: 'Password must be 128 characters or fewer' }),
        confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

export async function loader({ request }: Route.LoaderArgs) {
    await requireAnonymous(request);

    const token = new URL(request.url).searchParams.get('token');

    // No token (or Better Auth flagged the link invalid): start over.
    if (!token || token === 'INVALID_TOKEN') {
        throw redirect('/forgot-password');
    }

    return { token };
}

export async function action({ request }: Route.ActionArgs) {
    const form = await request.formData();
    const parsed = schema.safeParse(Object.fromEntries(form));

    if (!parsed.success) {
        return data(
            {
                errors: z.flattenError(parsed.error).fieldErrors,
                formError: null,
            },
            { status: 400 },
        );
    }

    try {
        await auth.api.resetPassword({
            body: {
                newPassword: parsed.data.password,
                token: parsed.data.token,
            },
        });
    } catch {
        return data(
            {
                errors: null,
                formError:
                    'This reset link is invalid or has expired. Request a new one.',
            },
            { status: 400 },
        );
    }

    return redirectWithToast('/login', {
        type: 'success',
        message: 'Password updated. Sign in with your new password.',
    });
}

export default function ResetPasswordRoute({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const isSubmitting = useIsSubmitting();

    return (
        <>
            <title>{`Reset Password | ${APP_NAME}`}</title>
            <meta
                name="description"
                content={`Choose a new password for your ${APP_NAME} account.`}
            />
            <div className="bg-base-300 flex h-full items-center justify-center p-4">
                <div className="card bg-base-100 w-full max-w-md shadow-lg">
                    <div className="card-body">
                        <h1 className="mb-2 text-2xl font-bold">
                            Choose a new password
                        </h1>
                        <FormAlert
                            message={actionData?.formError}
                            className="mb-2"
                        />
                        <Form method="POST" className="space-y-4">
                            <input
                                type="hidden"
                                name="token"
                                value={loaderData.token}
                            />
                            <Field
                                label="New password"
                                name="password"
                                error={actionData?.errors?.password?.[0]}
                                disabled={isSubmitting}
                            >
                                {(controlProps) => (
                                    <Input
                                        type="password"
                                        name="password"
                                        placeholder="At least 8 characters"
                                        required
                                        className="w-full"
                                        {...controlProps}
                                    />
                                )}
                            </Field>
                            <Field
                                label="Confirm new password"
                                name="confirmPassword"
                                error={actionData?.errors?.confirmPassword?.[0]}
                                disabled={isSubmitting}
                            >
                                {(controlProps) => (
                                    <Input
                                        type="password"
                                        name="confirmPassword"
                                        placeholder="Repeat the password"
                                        required
                                        className="w-full"
                                        {...controlProps}
                                    />
                                )}
                            </Field>
                            <button
                                className="btn btn-accent"
                                type="submit"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <Spinner /> : 'Reset password'}
                            </button>
                        </Form>
                    </div>
                </div>
            </div>
        </>
    );
}
