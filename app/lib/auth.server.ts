import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';

import { prisma } from '~/db.server';
import { Paths } from '~/constants';
import {
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendWelcomeEmail,
} from '~/models/email.server';

export const auth = betterAuth({
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            prompt: 'select_account',
        },
    },
    database: prismaAdapter(prisma, {
        provider: 'postgresql',
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // Set to true to require email verification
        sendResetPassword: async ({ user, url }) => {
            void sendPasswordResetEmail({
                to: user.email,
                resetUrl: url,
            }).catch((error) =>
                console.error('Failed to send reset email', error),
            );
        },
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            void sendVerificationEmail({
                to: user.email,
                verificationUrl: url,
            }).catch((error) =>
                console.error('Failed to send verification email', error),
            );
        },
        sendOnSignUp: true, // Low-friction: send verification but do not require yet
        sendOnSignIn: false,
        autoSignInAfterVerification: true,
        afterEmailVerification: async (user) => {
            void sendWelcomeEmail({
                to: user.email,
                userName: user.name || 'there',
                dashboardUrl: process.env.BETTER_AUTH_URL
                    ? `${process.env.BETTER_AUTH_URL}${Paths.DASHBOARD}`
                    : Paths.DASHBOARD,
            }).catch((error) =>
                console.error('Failed to send welcome email', error),
            );
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
    },
    onAPIError: {
        throw: false, // Don't throw errors automatically
        onError: (error, ctx) => {
            // Log errors but don't crash the application
            console.error('Better Auth API Error:', {
                error: error instanceof Error ? error.message : String(error),
                context: ctx,
            });
        },
    },
    plugins: [
        admin({
            defaultRole: 'USER',
        }),
    ],
});
