import type { Route } from './+types/login';
import { Turnstile } from '~/components/Turnstile';
import { enabledSocialProviders } from '~/lib/auth.server';
import { OgMeta } from '~/lib/seo';
import { APP_NAME } from '~/config';
import { requireAnonymous } from '~/models/session.server';

export async function loader({ request }: Route.LoaderArgs) {
    await requireAnonymous(request);
    return { socialProviders: enabledSocialProviders };
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
            <div className="grid h-full grid-cols-2">
                <div className="bg-base-300 flex flex-col items-center justify-center gap-6 p-8">
                    <div className="bg-base-100 min-w-[500px] shadow-lg">
                        <Turnstile
                            socialProviders={loaderData.socialProviders}
                        />
                    </div>
                </div>
                <div>
                    <img
                        src="https://res.cloudinary.com/setholito/image/upload/v1779412504/replicate-generated/abstract-1779412503954.png"
                        alt="Login illustration"
                        className="h-full w-full object-cover"
                    />
                </div>
            </div>
        </>
    );
}
