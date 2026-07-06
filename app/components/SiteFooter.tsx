import { APP_NAME, APP_TAGLINE } from '~/config';

export function SiteFooter() {
    return (
        <footer className="footer sm:footer-horizontal footer-center bg-base-300 text-base-content p-4">
            <aside>
                <p className="font-semibold">{`${APP_NAME}. ${APP_TAGLINE}`}</p>
                <p>
                    Copyright © {new Date().getFullYear()} - All right reserved
                    by Tech with Seth
                </p>
            </aside>
        </footer>
    );
}
