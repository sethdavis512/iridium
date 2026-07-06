import { createElement } from 'react';
import { sendEmail } from '~/lib/email.server';
import { ResetPasswordEmail } from '~/emails/ResetPasswordEmail';
import { VerificationEmail } from '~/emails/VerificationEmail';
import { APP_NAME } from '~/config';

/**
 * Serializable payload for auth emails. React elements can't cross the
 * Trigger.dev payload boundary, so the worker (or the inline fallback)
 * renders the react-email component from this data instead.
 */
export type AuthEmailPayload = {
    kind: 'reset-password' | 'verify-email';
    to: string;
    name: string;
    url: string;
};

export async function deliverAuthEmail(payload: AuthEmailPayload) {
    const { kind, to, name, url } = payload;

    if (kind === 'reset-password') {
        await sendEmail({
            to,
            subject: `Reset your ${APP_NAME} password`,
            react: createElement(ResetPasswordEmail, { name, url }),
        });
        return;
    }

    await sendEmail({
        to,
        subject: 'Verify your email address',
        react: createElement(VerificationEmail, { name, url }),
    });
}
