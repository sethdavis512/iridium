import { SpoolIcon } from 'lucide-react';

export default function ChatIndexRoute() {
    return (
        <div className="bg-muted flex grow items-center justify-center rounded-xl">
            <div>
                <SpoolIcon className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                <p className="text-foreground text-lg">Pick a thread!</p>
            </div>
        </div>
    );
}
