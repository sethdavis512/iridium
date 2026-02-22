import { useNavigate } from 'react-router';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '~/components/actions/Button';
import { TextInput } from '~/components/data-input/TextInput';
import { Alert } from '~/components/feedback/Alert';
import { useValidatedForm } from '~/lib/form-hooks';
import {
    signInSchema,
    signUpSchema,
    type SignInData,
    type SignUpData,
} from '~/lib/validations';
import { authClient } from '~/lib/auth-client';
import { Paths } from '~/constants';
import { TabRadio, Tabs } from '~/components/navigation/Tabs';
import { Container } from '~/components/layout/Container';

type AuthMode = 'signIn' | 'signUp';

export function Turnstile({
    onSuccessfulLogin,
}: {
    onSuccessfulLogin: () => void;
}) {
    const navigate = useNavigate();

    const [mode, setMode] = useState<AuthMode>('signIn');
    const [isLoading, setIsLoading] = useState<
        'email' | 'github' | 'google' | null
    >(null);
    const [serverError, setServerError] = useState<string | null>(null);

    const isSignIn = mode === 'signIn';
    const schema = isSignIn ? signInSchema : signUpSchema;

    const {
        getValues,
        register,
        handleSubmit,
        formState: { errors },
    } = useValidatedForm<SignInData | SignUpData>({
        defaultValues: {
            email: '',
            password: '',
            name: '',
        },
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: SignInData | SignUpData) => {
        setIsLoading('email');
        setServerError(null);

        try {
            if (isSignIn) {
                await authClient.signIn.email(
                    {
                        email: data.email,
                        password: data.password,
                    },
                    {
                        onSuccess: () => {
                            onSuccessfulLogin();
                        },
                        onError: (ctx) => {
                            setServerError(
                                ctx.error.message ||
                                    'Invalid credentials. Please try again.',
                            );
                        },
                    },
                );
            } else {
                const signUpData = data as SignUpData;
                await authClient.signUp.email(
                    {
                        email: signUpData.email,
                        password: signUpData.password,
                        name: signUpData.name,
                    },
                    {
                        onSuccess: () => {
                            onSuccessfulLogin();
                        },
                        onError: (ctx) => {
                            setServerError(
                                ctx.error.message ||
                                    'Account creation failed. Please try again.',
                            );
                        },
                    },
                );
            }
        } catch {
            setServerError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(null);
        }
    };

    const onSocialSignIn =
        (provider: 'google' | 'github') =>
        async (event: React.MouseEvent<HTMLButtonElement>) => {
            setIsLoading(provider);
            setServerError(null);

            try {
                await authClient.signIn.social({
                    provider,
                });

                navigate(Paths.DASHBOARD);
            } catch {
                setServerError(
                    `An unexpected error occurred during ${provider === 'google' ? 'Google' : 'GitHub'} sign-in. Please try again.`,
                );
            } finally {
                setIsLoading(null);
            }
        };

    const handleToggleMode = () => {
        const newMode: AuthMode = isSignIn ? 'signUp' : 'signIn';
        setMode(newMode);
    };

    return (
        <>
            <title>{`${isSignIn ? 'Sign In' : 'Sign Up'} | Iridium`}</title>
            <meta
                name="description"
                content={
                    isSignIn
                        ? 'Access your Iridium account with your email and password.'
                        : 'Create your Iridium account to explore the SaaS starter kit.'
                }
            />
            <Container>
                {/* TODO: Figure out why tabs are toggling incorrectly */}
                <Tabs variant="box" className="mb-8">
                    <TabRadio
                        checked={mode === 'signIn'}
                        label="Sign In"
                        name="loginMethod"
                        onChange={handleToggleMode}
                        value="signIn"
                    />
                    <TabRadio
                        checked={mode === 'signUp'}
                        label="Sign Up"
                        name="loginMethod"
                        onChange={handleToggleMode}
                        value="signUp"
                    />
                </Tabs>
                {serverError && (
                    <Alert status="error" className="mb-4">
                        {serverError}
                    </Alert>
                )}
                <h2 className="text-xl font-bold mb-8">Social</h2>
                <div className="flex flex-col gap-4 mb-8">
                    {/* https://daisyui.com/components/button/#login-buttons */}
                    <Button
                        type="button"
                        onClick={onSocialSignIn('google')}
                        loading={isLoading === 'google'}
                        className="w-full bg-white text-black border-[#e5e5e5]"
                    >
                        <svg
                            aria-label="Google logo"
                            width="16"
                            height="16"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 512 512"
                        >
                            <g>
                                <path d="m0 0H512V512H0" fill="#fff"></path>
                                <path
                                    fill="#34a853"
                                    d="M153 292c30 82 118 95 171 60h62v48A192 192 0 0190 341"
                                ></path>
                                <path
                                    fill="#4285f4"
                                    d="m386 400a140 175 0 0053-179H260v74h102q-7 37-38 57"
                                ></path>
                                <path
                                    fill="#fbbc02"
                                    d="m90 341a208 200 0 010-171l63 49q-12 37 0 73"
                                ></path>
                                <path
                                    fill="#ea4335"
                                    d="m153 219c22-69 116-109 179-50l55-54c-78-75-230-72-297 55"
                                ></path>
                            </g>
                        </svg>
                        {`Sign ${isSignIn ? 'in' : 'up'} with Google`}
                    </Button>
                    <Button
                        type="button"
                        onClick={onSocialSignIn('github')}
                        loading={isLoading === 'github'}
                        className="w-full bg-black text-white border-black"
                    >
                        <svg
                            aria-label="GitHub logo"
                            width="16"
                            height="16"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                        >
                            <path
                                fill="white"
                                d="M12,2A10,10 0 0,0 2,12C2,16.42 4.87,20.17 8.84,21.5C9.34,21.58 9.5,21.27 9.5,21C9.5,20.77 9.5,20.14 9.5,19.31C6.73,19.91 6.14,17.97 6.14,17.97C5.68,16.81 5.03,16.5 5.03,16.5C4.12,15.88 5.1,15.9 5.1,15.9C6.1,15.97 6.63,16.93 6.63,16.93C7.5,18.45 8.97,18 9.54,17.76C9.63,17.11 9.89,16.67 10.17,16.42C7.95,16.17 5.62,15.31 5.62,11.5C5.62,10.39 6,9.5 6.65,8.79C6.55,8.54 6.2,7.5 6.75,6.15C6.75,6.15 7.59,5.88 9.5,7.17C10.29,6.95 11.15,6.84 12,6.84C12.85,6.84 13.71,6.95 14.5,7.17C16.41,5.88 17.25,6.15 17.25,6.15C17.8,7.5 17.45,8.54 17.35,8.79C18,9.5 18.38,10.39 18.38,11.5C18.38,15.32 16.04,16.16 13.81,16.41C14.17,16.72 14.5,17.33 14.5,18.26C14.5,19.6 14.5,20.68 14.5,21C14.5,21.27 14.66,21.59 15.17,21.5C19.14,20.16 22,16.42 22,12A10,10 0 0,0 12,2Z"
                            ></path>
                        </svg>
                        {`Sign ${isSignIn ? 'in' : 'up'} with GitHub`}
                    </Button>
                </div>
                <hr className="border-base-300 my-4" />
                <h2 className="text-xl font-bold mb-8">Email</h2>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {!isSignIn && (
                        <TextInput
                            {...register('name')}
                            label="Name"
                            type="text"
                            error={
                                'name' in errors
                                    ? errors.name?.message
                                    : undefined
                            }
                            required
                        />
                    )}
                    <TextInput
                        {...register('email')}
                        label="Email"
                        type="email"
                        error={errors.email?.message}
                        required
                    />
                    <TextInput
                        {...register('password')}
                        label="Password"
                        type="password"
                        error={errors.password?.message}
                        helperText={
                            isSignIn
                                ? undefined
                                : 'Must be at least 8 characters with letters and numbers'
                        }
                        required
                    />
                    <Button
                        type="submit"
                        loading={isLoading === 'email'}
                        status="primary"
                    >
                        {`Sign ${isSignIn ? 'In' : 'Up'}`}
                    </Button>
                </form>
            </Container>
        </>
    );
}
