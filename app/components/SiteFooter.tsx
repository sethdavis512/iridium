import { APP_NAME, APP_TAGLINE } from '~/config';

export function SiteFooter() {
    return (
        <footer className="bg-muted text-muted-foreground border-t p-4 text-center text-sm">
            <p className="text-foreground font-semibold">{`${APP_NAME}. ${APP_TAGLINE}`}</p>
            <p>
                Copyright © {new Date().getFullYear()} - All right reserved by
                Tech with Seth
            </p>
        </footer>
    );
}
