import { useReducer, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '~/lib/auth.client';
import type { SocialProvider } from '~/lib/auth.server';
import { Field } from '~/components/forms/Field';
import { FormAlert } from '~/components/forms/FormAlert';
import { Input } from '~/components/forms/Input';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';

const formSchema = z.object({
    name: z.string().optional(),
    email: z.email({ message: 'Enter a valid email address' }),
    password: z
        .string()
        .min(8, { message: 'Password must be at least 8 characters' }),
});

type FormValues = z.infer<typeof formSchema>;

const REDIRECT_PATH = '/dashboard';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
    github: 'GitHub',
    google: 'Google',
};

// Lucide dropped brand icons, so the provider marks are inline SVGs.
function GitHubMark() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
        >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    );
}

function GoogleMark() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
            <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
            />
            <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
            />
            <path
                fill="#FBBC05"
                d="M5.27 14.29A7.16 7.16 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z"
            />
            <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
            />
        </svg>
    );
}

type Props = {
    socialProviders?: SocialProvider[];
};

export function Turnstile({ socialProviders = [] }: Props) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isSignIn, toggleSignIn] = useReducer((s) => !s, true);
    const [formError, setFormError] = useState<string | null>(null);
    const [pendingProvider, setPendingProvider] =
        useState<SocialProvider | null>(null);

    // Better Auth lands back here with ?error=... when the OAuth flow fails.
    const socialError =
        searchParams.get('error') !== null
            ? 'Social sign-in failed. Please try again.'
            : null;

    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
    });

    const handleSocialSignIn = async (provider: SocialProvider) => {
        setFormError(null);
        setPendingProvider(provider);

        await authClient.signIn.social(
            {
                provider,
                callbackURL: `${window.location.origin}${REDIRECT_PATH}`,
                errorCallbackURL: `${window.location.origin}/login`,
            },
            {
                onError: (ctx) => {
                    setPendingProvider(null);
                    setFormError(ctx.error.message ?? 'Social sign-in failed.');
                },
            },
        );
    };

    const onSubmit = async (data: FormValues) => {
        setFormError(null);

        if (!isSignIn && !data.name?.trim()) {
            setError('name', { message: 'Name is required' });
            return;
        }

        const callbackURL = `${window.location.origin}${REDIRECT_PATH}`;

        if (isSignIn) {
            await authClient.signIn.email(
                { email: data.email, password: data.password, callbackURL },
                {
                    onSuccess: () => navigate(REDIRECT_PATH),
                    onError: (ctx) =>
                        setFormError(ctx.error.message ?? 'Sign in failed.'),
                },
            );
        } else {
            await authClient.signUp.email(
                {
                    email: data.email,
                    password: data.password,
                    name: data.name!,
                    callbackURL,
                },
                {
                    onSuccess: () => navigate(REDIRECT_PATH),
                    onError: (ctx) =>
                        setFormError(
                            ctx.error.message ?? 'Registration failed.',
                        ),
                },
            );
        }
    };

    return (
        <div className="p-8">
            <h2 className="mb-8 text-3xl font-bold">Authenticate</h2>
            <FormAlert message={formError ?? socialError} className="mb-4" />
            {socialProviders.length > 0 && (
                <>
                    <div className="space-y-2">
                        {socialProviders.map((provider) => (
                            <Button
                                key={provider}
                                type="button"
                                variant="outline"
                                className="w-full"
                                loading={pendingProvider === provider}
                                disabled={
                                    isSubmitting || pendingProvider !== null
                                }
                                onClick={() => handleSocialSignIn(provider)}
                            >
                                {provider === 'github' ? (
                                    <GitHubMark />
                                ) : (
                                    <GoogleMark />
                                )}
                                Continue with {PROVIDER_LABELS[provider]}
                            </Button>
                        ))}
                    </div>
                    <div className="my-4 flex items-center gap-3">
                        <Separator className="flex-1" />
                        <span className="text-muted-foreground text-xs">
                            or
                        </span>
                        <Separator className="flex-1" />
                    </div>
                </>
            )}
            <div>
                {/* Native radios (tests .check() them) styled as a
                    segmented control; the visible text comes from the
                    aria-label via after:content. */}
                <div className="border-input bg-muted mb-4 inline-flex gap-0.5 rounded-lg border p-0.5">
                    <input
                        className="text-muted-foreground checked:bg-background checked:text-foreground focus-visible:ring-ring flex h-7 cursor-pointer appearance-none items-center rounded-md px-4 text-sm outline-none after:content-[attr(aria-label)] checked:font-medium checked:shadow-sm focus-visible:ring-2 disabled:opacity-64"
                        type="radio"
                        name="loginOptions"
                        aria-label="Login"
                        onChange={toggleSignIn}
                        disabled={isSubmitting}
                        defaultChecked
                    />
                    <input
                        className="text-muted-foreground checked:bg-background checked:text-foreground focus-visible:ring-ring flex h-7 cursor-pointer appearance-none items-center rounded-md px-4 text-sm outline-none after:content-[attr(aria-label)] checked:font-medium checked:shadow-sm focus-visible:ring-2 disabled:opacity-64"
                        type="radio"
                        name="loginOptions"
                        aria-label="Register"
                        onChange={toggleSignIn}
                        disabled={isSubmitting}
                    />
                </div>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {!isSignIn && (
                        <Field
                            label="Name"
                            name="name"
                            error={errors.name?.message}
                            disabled={isSubmitting}
                        >
                            {(controlProps) => (
                                <Input
                                    type="text"
                                    placeholder="Your name"
                                    {...controlProps}
                                    {...register('name')}
                                />
                            )}
                        </Field>
                    )}
                    <Field
                        label="Email address"
                        name="email"
                        error={errors.email?.message}
                        disabled={isSubmitting}
                    >
                        {(controlProps) => (
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                {...controlProps}
                                {...register('email')}
                            />
                        )}
                    </Field>
                    <Field
                        label="Password"
                        name="password"
                        error={errors.password?.message}
                        disabled={isSubmitting}
                    >
                        {(controlProps) => (
                            <Input
                                type="password"
                                placeholder="Your password"
                                {...controlProps}
                                {...register('password')}
                            />
                        )}
                    </Field>
                    <div className="flex items-center justify-between">
                        <Button type="submit" loading={isSubmitting}>
                            {isSignIn ? 'Login' : 'Register'}
                        </Button>
                        {isSignIn && (
                            <Link
                                to="/forgot-password"
                                className="text-sm underline underline-offset-4"
                            >
                                Forgot password?
                            </Link>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
