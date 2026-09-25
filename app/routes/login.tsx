import { redirect } from 'react-router';
import type { Route } from './+types/login';
import { AuthIllustration } from '~/components/AuthIllustration';
import { Turnstile } from '~/components/Turnstile';
import { enabledSocialProviders } from '~/lib/auth.server';
import { OgMeta } from '~/lib/seo';
import { APP_NAME } from '~/config';
import { requireAnonymous } from '~/models/session.server';

export async function loader({ request }: Route.LoaderArgs) {
    await requireAnonymous(request);
    return { socialProviders: enabledSocialProviders };
}

// Sign-in runs client-side through Better Auth. A native submit (before
// hydration, or with JavaScript off) posts here; send the browser back to the
// form so the credentials never reach the URL or access logs.
export async function action() {
    return redirect('/login', 303);
}

export default function LoginRoute({ loaderData }: Route.ComponentProps) {
    return (
        <>
            <title>{`Login | ${APP_NAME}`}</title>
            <meta
                name="description"
                content="Login or sign up to access your account"
            />
            <OgMeta
                title={`Login | ${APP_NAME}`}
                description={`Login or sign up to access your ${APP_NAME} account.`}
            />
            <div className="grid h-full lg:grid-cols-2">
                <div className="bg-muted flex flex-col items-center justify-center gap-6 p-4 sm:p-8">
                    <div className="bg-card border-border w-full max-w-lg rounded-xl border shadow-lg">
                        <Turnstile
                            socialProviders={loaderData.socialProviders}
                        />
                    </div>
                </div>
                <div className="bg-background border-border hidden border-l lg:block">
                    <AuthIllustration className="block size-full" />
                </div>
            </div>
        </>
    );
}
