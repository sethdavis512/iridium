import { APP_NAME, APP_OWNER, APP_TAGLINE } from '~/config';

export function SiteFooter() {
    const rightsReserved = APP_OWNER
        ? `All rights reserved by ${APP_OWNER}`
        : 'All rights reserved';

    return (
        <footer className="bg-muted text-muted-foreground border-t p-4 text-center text-sm">
            <p className="text-foreground font-semibold">{`${APP_NAME}. ${APP_TAGLINE}`}</p>
            <p>{`Copyright © ${new Date().getFullYear()} - ${rightsReserved}`}</p>
        </footer>
    );
}
