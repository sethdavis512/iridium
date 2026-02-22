import type { Route } from './+types/interest';
import { data } from 'react-router';
import { validateFormData } from '~/lib/form-validation.server';
import { interestFormSchema, type InterestFormData } from '~/lib/validations';
import { zodResolver } from '@hookform/resolvers/zod';
import { Prisma } from '~/generated/prisma/client';
import { createInterestSignup } from '~/models/interest.server';
import {
    sendInterestListConfirmationEmail,
    sendAdminInterestListNotification,
} from '~/models/email.server';

/**
 * Interest List Signup API Endpoint
 *
 * Allows anonymous users to sign up for the interest list/mailing list
 * from the landing page.
 *
 * POST /api/interest - Add email to interest list
 */

// POST - Add email to interest list
export async function action({ request }: Route.ActionArgs) {
    if (request.method !== 'POST') {
        return data({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const formData = await request.formData();

        const { data: validatedData, errors } =
            await validateFormData<InterestFormData>(
                formData,
                zodResolver(interestFormSchema),
            );

        if (errors) {
            return data({ errors }, { status: 400 });
        }

        // Create interest list signup
        await createInterestSignup(validatedData!);

        // Send confirmation email to user
        try {
            await sendInterestListConfirmationEmail({
                to: validatedData!.email,
                inquiryType: validatedData!.inquiryType,
                note: validatedData!.note,
            });
        } catch (emailError) {
            // Log email error but don't fail the signup
            console.error('Failed to send confirmation email:', emailError);
        }

        // Send notification email to admin
        const adminEmail =
            process.env.ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL;
        if (adminEmail) {
            try {
                await sendAdminInterestListNotification({
                    to: adminEmail,
                    userEmail: validatedData!.email,
                    inquiryType: validatedData!.inquiryType,
                    note: validatedData!.note,
                    timestamp: new Date().toISOString(),
                });
            } catch (emailError) {
                // Log email error but don't fail the signup
                console.error('Failed to send admin notification:', emailError);
            }
        }

        return data({
            success: true,
            message:
                'Thanks for your interest! Check your email for confirmation.',
        });
    } catch (error) {
        // Handle duplicate email error
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            return data(
                {
                    error: 'This email is already on our interest list.',
                },
                { status: 409 },
            );
        }

        console.error('Failed to add email to interest list:', error);

        return data(
            {
                error: 'Failed to sign up. Please try again.',
                details:
                    import.meta.env.DEV && error instanceof Error
                        ? error.message
                        : undefined,
            },
            { status: 500 },
        );
    }
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    if (error instanceof Error) {
        return data(
            {
                error: 'An unexpected error occurred while signing up',
                message: import.meta.env.DEV ? error.message : undefined,
                stack: import.meta.env.DEV ? error.stack : undefined,
            },
            { status: 500 },
        );
    }

    return data({ error: 'Unknown error occurred' }, { status: 500 });
}
