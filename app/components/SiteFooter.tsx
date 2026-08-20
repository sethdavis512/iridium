export function SiteFooter() {
    return (
        <footer className="bg-muted text-muted-foreground border-t p-4 text-center text-sm">
            <p className="text-foreground font-semibold">
                Iridium. Go build. Be bold.
            </p>
            <p>
                Copyright © {new Date().getFullYear()} - All right reserved by
                Tech with Seth
            </p>
        </footer>
    );
}
