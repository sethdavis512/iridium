import {
    BotIcon,
    DatabaseIcon,
    LockIcon,
    NotebookPenIcon,
    PaletteIcon,
    TestTubesIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '~/components/Card';
import { Container } from '~/components/Container';
import { Button } from '~/components/ui/button';
import { OgMeta } from '~/lib/seo';
import { APP_NAME } from '~/config';

const FEATURES = [
    {
        icon: LockIcon,
        title: 'Authentication',
        description:
            'Better Auth with email/password, role hierarchy, session caching, and rate limiting wired in.',
    },
    {
        icon: BotIcon,
        title: 'AI chat with agent tools',
        description:
            'Streaming chat built on the Vercel AI SDK and VoltAgent, with tool calling and persistent memory.',
    },
    {
        icon: NotebookPenIcon,
        title: 'Notes',
        description:
            'A complete CRUD example the agent can also drive: create, search, and manage notes by chat.',
    },
    {
        icon: PaletteIcon,
        title: 'Theming and UX patterns',
        description:
            'COSS UI light/dark/system themes, flash toasts, reusable form components, and pagination.',
    },
    {
        icon: TestTubesIcon,
        title: 'Testing',
        description:
            'Vitest unit tests beside the code and Playwright E2E coverage with isolated per-test users.',
    },
    {
        icon: DatabaseIcon,
        title: 'Production patterns',
        description:
            'Prisma with soft deletes, Zod-validated env, structured logging, Docker, and CI out of the box.',
    },
];

const STACK = [
    ['React Router v7', 'Full-stack SSR framework mode'],
    ['Better Auth', 'Authentication with admin plugin'],
    ['Prisma + PostgreSQL', 'Type-safe data layer'],
    ['Vercel AI SDK + VoltAgent', 'Streaming agents with memory'],
    ['Tailwind CSS v4 + COSS UI', 'Utility styling with components'],
    ['Bun', 'Fast runtime and tooling'],
];

export default function LandingPage() {
    return (
        <>
            <title>{`Home | ${APP_NAME}`}</title>
            <meta
                name="description"
                content={`${APP_NAME} is a full-stack React starter kit with authentication, AI chat, agent tools, and production-ready patterns.`}
            />
            <OgMeta
                title={APP_NAME}
                description="A full-stack starter kit built for shipping AI-powered products."
            />
            <Container className="p-4">
                <section className="py-12 text-center md:py-20">
                    <h1 className="mb-4 text-5xl font-bold">{APP_NAME}</h1>
                    <p className="mx-auto mb-8 max-w-2xl text-lg">
                        A full-stack starter kit built for shipping AI-powered
                        products. Clone the repo, configure your environment,
                        and have a working application with authentication, AI
                        chat, and agent tools in minutes.
                    </p>
                    <div className="flex justify-center gap-4">
                        <Button size="lg" render={<Link to="/login" />}>
                            Get started
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            render={
                                <a href="https://github.com/sethdavis512/iridium" />
                            }
                        >
                            View source
                        </Button>
                    </div>
                </section>

                <section className="py-8">
                    <h2 className="mb-6 text-3xl font-bold">
                        What is included
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map(({ icon: Icon, title, description }) => (
                            <Card key={title} bordered>
                                <Icon
                                    aria-hidden="true"
                                    className="text-primary h-8 w-8"
                                />
                                <h3 className="font-heading text-lg font-semibold">
                                    {title}
                                </h3>
                                <p className="text-muted-foreground text-sm">
                                    {description}
                                </p>
                            </Card>
                        ))}
                    </div>
                </section>

                <section className="py-8">
                    <h2 className="mb-6 text-3xl font-bold">The stack</h2>
                    <ul className="grid gap-2 md:grid-cols-2">
                        {STACK.map(([name, blurb]) => (
                            <li
                                key={name}
                                className="bg-card border-border flex items-baseline justify-between gap-4 rounded-lg border px-4 py-3"
                            >
                                <span className="font-semibold">{name}</span>
                                <span className="text-muted-foreground text-sm">
                                    {blurb}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            </Container>
        </>
    );
}
