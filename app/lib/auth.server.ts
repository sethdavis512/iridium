import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { AUTH_COOKIE_PREFIX } from '~/config';
import prisma from '~/lib/prisma';
import {
    shouldPromoteToAdmin,
    type PromotionCandidate,
} from '~/lib/admin-emails';
import { env } from '~/lib/env.server';
import { enqueueAuthEmail } from '~/lib/jobs.server';
import { log } from '~/lib/logger.server';
import { getUserById, updateUserRole } from '~/models/user.server';

const isProduction = env.NODE_ENV === 'production';

/**
 * First-admin bootstrap: promote a user listed in ADMIN_EMAILS once their
 * email is verified. The session cookie caches the old role for up to
 * cookieCache.maxAge, so the promoted user signs in again to see /admin.
 */
async function promoteIfAdminEmail(user: PromotionCandidate & { id: string }) {
    if (!shouldPromoteToAdmin(user, env.ADMIN_EMAILS)) return;
    await updateUserRole(user.id, 'ADMIN');
    log.info('admin_email_promoted', { userId: user.id });
}

export type SocialProvider = 'github' | 'google';

const socialProviders = {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
              github: {
                  clientId: env.GITHUB_CLIENT_ID,
                  clientSecret: env.GITHUB_CLIENT_SECRET,
              },
          }
        : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
              google: {
                  clientId: env.GOOGLE_CLIENT_ID,
                  clientSecret: env.GOOGLE_CLIENT_SECRET,
              },
          }
        : {}),
};

/** Providers with credentials configured; drives which login buttons render. */
export const enabledSocialProviders = Object.keys(
    socialProviders,
) as SocialProvider[];

export const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_BASE_URL,
    trustedOrigins: [
        env.BETTER_AUTH_BASE_URL,
        ...env.BETTER_AUTH_TRUSTED_ORIGINS,
    ],
    emailAndPassword: {
        enabled: true,
        // Better Auth defaults to 8; restating for visibility.
        minPasswordLength: 8,
        maxPasswordLength: 128,
        autoSignIn: true,
        sendResetPassword: async ({ user, url }) => {
            await enqueueAuthEmail({
                kind: 'reset-password',
                to: user.email,
                name: user.name,
                url,
            });
        },
    },
    // Soft verification: a verification email goes out on sign-up, but
    // unverified users may still sign in. Flip requireEmailVerification to
    // true to hard-gate (note: the E2E fixtures rely on sign-up auto-login,
    // so they would need a verification step added first).
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
            await enqueueAuthEmail({
                kind: 'verify-email',
                to: user.email,
                name: user.name,
                url,
            });
        },
        // The moment a listed address proves ownership.
        afterEmailVerification: promoteIfAdminEmail,
    },
    user: {
        deleteUser: {
            enabled: true,
            afterDelete: async (user) => {
                // Prisma cascades remove the user's rows in the app DB, but
                // VoltAgent conversation memory lives in a separate store.
                try {
                    const { getChat } = await import('~/voltagent');
                    const { memory } = await getChat();
                    // No conversationId: clears every conversation for the user.
                    await memory.clearMessages(user.id);
                } catch (error) {
                    log.exception('voltagent_memory_cleanup_failed', error, {
                        userId: user.id,
                    });
                }
            },
        },
    },
    socialProviders,
    database: prismaAdapter(prisma, {
        provider: 'postgresql',
    }),
    databaseHooks: {
        session: {
            create: {
                // Also check at sign-in: covers OAuth sign-ups (verified by the
                // provider) and users who verified before ADMIN_EMAILS was set.
                after: async (session) => {
                    if (env.ADMIN_EMAILS.length === 0) return;
                    const user = await getUserById(session.userId);
                    if (user) await promoteIfAdminEmail(user);
                },
            },
        },
    },
    session: {
        // Cache the session in a signed cookie so most requests skip the DB
        // session lookup. Revocations still take effect within cookieCache.maxAge.
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60,
        },
    },
    advanced: {
        cookiePrefix: AUTH_COOKIE_PREFIX,
        // Client IP for rate limiting and session records. Better Auth reads
        // X-Forwarded-For by default, which a client can forge to get a fresh
        // rate-limit bucket per request; Railway's edge sets X-Real-IP to the
        // connecting address. Without the header (local dev, E2E) Better Auth
        // uses 127.0.0.1 in development/test and one shared bucket in
        // production, so a host that doesn't set X-Real-IP must change this.
        ipAddress: {
            ipAddressHeaders: ['x-real-ip'],
        },
        defaultCookieAttributes: {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProduction,
        },
    },
    // The plugin's defaults are lowercase ('admin'/'user'); both adminRoles
    // and the permission map must be re-keyed to our uppercase Role enum or
    // every admin API call (ban, impersonate, ...) returns FORBIDDEN.
    plugins: [
        admin({
            defaultRole: 'USER',
            adminRoles: ['ADMIN'],
            roles: {
                USER: userAc,
                EDITOR: userAc,
                ADMIN: adminAc,
            },
        }),
    ],
    // Better Auth's built-in rate limiter. Defaults are off in non-prod;
    // explicitly enable so dev and CI exercise the same limits as prod. The
    // E2E test server opts out via DISABLE_AUTH_RATE_LIMIT so it can create
    // many sessions quickly.
    rateLimit: {
        enabled: !env.DISABLE_AUTH_RATE_LIMIT,
        // Counters live in the `RateLimit` table rather than process memory,
        // so limits hold across replicas and survive deploys.
        storage: 'database',
        // 10s sliding window, 100 req/window per IP across all auth endpoints.
        window: 10,
        max: 100,
        // Tighter limits on the abusable endpoints.
        customRules: {
            '/sign-in/email': { window: 60, max: 10 },
            '/sign-up/email': { window: 60, max: 5 },
            '/request-password-reset': { window: 60, max: 5 },
            '/reset-password': { window: 60, max: 5 },
        },
    },
});
