# Iridium

A full-stack starter kit for shipping AI-powered products. Clone the repo, configure your environment, and have a working application with authentication, AI chat, and agent tools in minutes.

## Features

- **Authentication** — Email/password sign-up and sign-in via Better Auth with secure HTTP-only sessions, password reset, and email verification
- **Account management** — A `/settings` page with profile editing, password change (revokes other sessions), and account deletion behind a password confirm
- **Email** — Resend + react-email templates behind a pluggable `sendEmail()`; without an API key, emails render to the console so local dev needs no provider
- **Role-based access control** — USER, EDITOR, and ADMIN roles baked into the schema and session helpers, with an `/admin` panel for role changes, ban/unban, and user impersonation
- **AI chat** — Conversational interface powered by VoltAgent and the Vercel AI SDK. Messages persist to PostgreSQL and are organized into searchable threads with per-thread model selection and response regeneration
- **Agent tools** — The AI assistant can manage notes, fetch live weather, and report the current time, with tool invocations rendered inline in the chat
- **Generative UI** — The `render_card` tool lets the agent produce rich visual cards (info, steps, pros/cons) inline in the chat, demonstrating VoltAgent's tool-driven approach to generative UI
- **Notes** — A full CRUD notes page at `/notes` with search and pagination; the agent writes to the same store
- **Working memory** — VoltAgent remembers user preferences and context across conversations via PostgreSQL-backed working memory
- **UX patterns** — Light/dark/system theme switching (cookie-based, no flash), flash toast notifications, empty states, reusable form components, offset pagination
- **Component library** — [COSS UI](https://coss.com/ui) (Base UI primitives styled with Tailwind v4), installed as copy-owned source in `app/components/ui/` via the shadcn CLI: `bunx shadcn@latest add @coss/<name>`
- **Production patterns** — Soft deletes, Zod-validated env, structured logging, rate limiting, SEO (robots/sitemap/OG tags), husky + lint-staged pre-commit hooks
- **Type-safe end to end** — Prisma generates types from the schema, Zod validates runtime data, React Router 8 types routes and loaders, CVA ensures type-safe component variants

## Tech Stack

| Layer      | Technology                                   |
| ---------- | -------------------------------------------- |
| Framework  | React Router v8 (SSR, config-based routing)  |
| UI         | React 19, Tailwind CSS v4, COSS UI (Base UI) |
| Database   | PostgreSQL via Prisma ORM                    |
| Auth       | Better Auth                                  |
| AI         | VoltAgent, Vercel AI SDK, Anthropic Claude   |
| Validation | Zod, React Hook Form                         |
| Runtime    | Bun (dev), Node 24 Alpine (production)       |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed
- [Node.js](https://nodejs.org/) 22.22 or newer (React Router 8 requires it; production runs Node 24)
- [Docker](https://docs.docker.com/get-docker/) installed (for local PostgreSQL)
- Anthropic API key

### Quick start

```bash
bun install
bun run setup   # interactive: names the app, writes .env, starts Docker,
                # migrates, and seeds demo users in one shot
bun run dev
```

`bun run setup` asks for an app name and derives a slug from it (`My App` →
`my-app`). It writes both to `app/config.ts` (`APP_NAME`, `APP_SLUG`) and uses
the slug for the package name, the Docker Compose project, the local database
(`my_app`), the cookie names, and the demo users' emails, so a copy never
shares containers, data, or sessions with another copy on the same machine.
Every copy still uses ports 5432 and 5433, so stop one project's databases
before starting another's. When it finishes, it lists what is left to rebrand
by hand (favicon, landing copy, README).

It also takes `--non-interactive` (and `--name "<App Name>"`) for scripted
use. Prefer manual control? The steps below do the same thing by hand. To
stand up production on Railway, see [Railway](#railway).

### Installation

```bash
bun install
```

### Environment

Copy `.env.example` to `.env` and fill in:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/iridium"
VOLTAGENT_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/voltagent"
BETTER_AUTH_SECRET="<openssl rand -base64 32>"
BETTER_AUTH_BASE_URL="http://localhost:5173"
ANTHROPIC_API_KEY="sk-ant-..."

# Optional: real email sending (otherwise emails log to the console)
RESEND_API_KEY="re_..."
EMAIL_FROM="Iridium <onboarding@resend.dev>"

# Optional: OAuth login buttons (each renders only when both vars are set).
# Callback URLs: <BETTER_AUTH_BASE_URL>/api/auth/callback/<provider>
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Optional: first admin. Listed emails become ADMIN once verified.
ADMIN_EMAILS="you@example.com"
```

### Two-Database Setup

The app runs two PostgreSQL instances via `docker-compose.dev.yml`:

| Database    | Port | Env Var                  | Purpose                          |
| ----------- | ---- | ------------------------ | -------------------------------- |
| `iridium`   | 5432 | `DATABASE_URL`           | Prisma (app data, auth, threads) |
| `voltagent` | 5433 | `VOLTAGENT_DATABASE_URL` | VoltAgent memory and state       |

VoltAgent creates its own tables automatically on first connection -- no migration needed.

| Command               | Purpose                            |
| --------------------- | ---------------------------------- |
| `bun run docker:up`   | Start both Postgres containers     |
| `bun run docker:down` | Stop containers (data preserved)   |
| `bun run docker:nuke` | Stop containers and delete volumes |

### Database

```bash
bun run docker:up              # Start both Postgres containers
bun run db:migrate              # Apply migrations
bun run db:seed                 # Seed with demo users
```

Seeded demo users (password `password123` for all): `alice@iridium.dev`,
`bob@iridium.dev`, and `admin@iridium.dev` (ADMIN role). Because those
passwords are public, the seed refuses to run when `NODE_ENV=production` or
the `DATABASE_URL` host isn't `localhost`/`127.0.0.1`. Override with
`bun prisma/seed.ts --force` only for a throwaway database.

### Development

```bash
bun run dev
```

The app will be available at `http://localhost:5173`.

### Testing

```bash
bun run test          # Vitest unit tests
bun run test:e2e      # Playwright E2E suite on Chromium, as CI (port 7778)
bun run test:e2e:cross # Same suite on Chromium, Firefox and WebKit
bun run test:visual   # Visual inventory: screenshot gallery of every surface
```

The visual inventory writes PNGs to `test-results/visual-inventory/` and
attaches them to the Playwright HTML report, giving a browsable gallery of
every page and state (light/dark, mobile, populated/empty). CI uploads it as
an artifact on every PR.

### Background Jobs (optional)

Background work runs through [Trigger.dev](https://trigger.dev) when
configured, and inline otherwise, so nothing is required for local dev.
Tasks live in `trigger/`:

| Task                    | Trigger              | Purpose                                          |
| ----------------------- | -------------------- | ------------------------------------------------ |
| `send-auth-email`       | auth flows           | Password reset + verification emails off-request |
| `generate-thread-title` | `/api/chat`          | AI thread titles without blocking the chat       |
| `purge-soft-deleted`    | cron, daily 4:17 UTC | Hard-deletes Threads/Notes soft-deleted 30+ days |

To enable:

1. Create a project at [cloud.trigger.dev](https://cloud.trigger.dev) (or self-host)
2. Set `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY` in `.env`
3. `bun run trigger:dev` alongside `bun run dev` (or `bun run trigger:deploy`)

The deployed worker runs the app's server code, so it needs the same
required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) set in the
Trigger.dev dashboard. Without `TRIGGER_SECRET_KEY`, `app/lib/jobs.server.ts`
runs the same functions inline and the purge job simply doesn't run.

To deploy the tasks from CI on every push to `main`, add a Trigger.dev personal
access token as the `TRIGGER_ACCESS_TOKEN` repository secret and the project
ref as the `TRIGGER_PROJECT_REF` repository variable. The CI job is a no-op
until the secret exists.

## Project Structure

```
app/
├── components/          # Shared UI components
│   └── ui/              # Copy-owned COSS UI primitives (@coss registry)
├── generated/prisma/    # Generated Prisma client
├── lib/                 # Prisma client, auth config
├── middleware/           # Auth middleware
├── models/              # Server-side data access (thread, note, session)
├── routes/              # React Router route modules
├── voltagent/           # Agent definition and tools
│   ├── agents.ts        # Agent config, tool definitions
│   └── index.ts         # Agent export
└── root.tsx             # HTML document + bare Outlet (chrome lives in routes/layouts/)
prisma/
├── schema.prisma        # Database schema
├── migrations/          # Migration history
└── seed.ts              # Database seeder
```

## Agent Tools

The AI assistant (defined in `app/voltagent/agents.ts`) has six tools:

| Tool                   | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `create_note`          | Saves a note with a title and content for the user                     |
| `list_notes`           | Lists the user's 20 most recent notes                                  |
| `search_notes`         | Searches notes by keyword across titles and content                    |
| `render_card`          | Renders a rich visual card inline in the chat (info, steps, pros/cons) |
| `get_weather`          | Current conditions for a location via Open-Meteo (no API key required) |
| `get_current_datetime` | The current date and time (UTC)                                        |

Note tools are rendered via `NoteToolPart`; card tools are rendered via `CardToolPart`. Notes are browsable at `/notes`.

### Generative UI (Tool-Driven)

VoltAgent does not support true generative UI (the model streaming arbitrary React components at runtime). Instead, it uses a tool-driven pattern: the agent calls a tool with structured data, and a predefined React component renders it.

The `render_card` tool demonstrates this pattern with three card variants:

- **info** -- key facts or summaries with optional bullet points
- **steps** -- numbered step-by-step guides
- **pros_cons** -- side-by-side comparison with pros and cons

Try these prompts to trigger card rendering:

- "Compare React and Vue as a pros and cons card"
- "Give me a step-by-step guide to deploying on Railway"
- "Summarize what VoltAgent is as an info card"

The pattern is extensible: define a new variant in the Zod schema (`app/voltagent/tools/cards.ts`), add a rendering branch in `CardToolPart` (`app/components/CardToolPart.tsx`), and the agent will use it when appropriate.

### Adding a Custom Tool

1. **Define the server-side tool** in `app/voltagent/tools/` using `createTool()` with a Zod schema for parameters and an `execute` function. Access the user ID via `options?.userId`.

```ts
// app/voltagent/tools/my-tool.ts
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import invariant from 'tiny-invariant';

export const myTool = createTool({
    name: 'my_tool',
    description:
        'What the tool does — the LLM reads this to decide when to call it.',
    parameters: z.object({
        input: z.string().describe('What to pass in'),
    }),
    execute: async (args, options) => {
        const userId = options?.userId;
        invariant(userId, 'User not authenticated');
        // ... your logic here
        return { result: 'done' };
    },
});
```

1. **Register it** in the agent's `tools` array in `app/voltagent/agents.ts`:

```ts
import { myTool } from './tools/my-tool';

export const agent = new Agent({
    // ...
    tools: [createNoteTool, listNotesTool, searchNotesTool, myTool],
});
```

1. **Create a UI component** for the tool part (see `app/components/NoteToolPart.tsx` for reference). The component receives `toolName`, `state` (`'input-available'`, `'input-streaming'`, or `'output-available'`), and `output`.

2. **Render it in the chat** by adding your tool name to the rendering logic in `app/routes/thread.tsx`. Add a check alongside the existing `NOTE_TOOLS` set, or expand it if appropriate.

## Troubleshooting

- Chat/tool-calling duplicate provider item IDs (`fc_*`): see [docs/chat-tool-calling.md](docs/chat-tool-calling.md)
- `ECONNREFUSED 127.0.0.1:5433` on `bun run dev`: the VoltAgent Postgres container isn't running. Make sure Docker Desktop is running (`open -a Docker`), then `bun run docker:up` before `bun run dev`. Port 5433 is the VoltAgent database; 5432 is the Prisma database.

## Building for Production

```bash
bun run build
```

### Docker

```bash
docker build -t iridium .
docker run -p 3000:3000 iridium
```

The image's default command applies pending Prisma migrations
(`prisma migrate deploy`, a no-op when current) before serving, so plain Docker
hosts self-migrate on boot. Railway replaces that command: the start command in
`.railway/railway.ts` only serves, and migrations run once per deploy as its
pre-deploy command, so a failed migration fails that deploy while the current
release keeps serving.

### Railway

Railway infrastructure is defined as code in `.railway/railway.ts`: the app
service built from the Dockerfile, both Postgres databases, the `/healthcheck`
probe, `prisma migrate deploy` as a pre-deploy command, and Railway's "Wait for
CI" so a commit only deploys after GitHub Actions passes. Per-project values
(project and service names, GitHub repo, pinned database images) live in
`.railway/app.json`.

**First deploy of a new copy.** Push the copy to GitHub, give the
[Railway GitHub app](https://github.com/apps/railway-app) access to it, install
the Railway CLI, and run `railway login`. Then:

```bash
bun run provision            # interactive; --dry-run shows the plan first
```

This creates the Railway project, applies `.railway/railway.ts`, generates a
domain, sets `BETTER_AUTH_SECRET` and `BETTER_AUTH_BASE_URL` (plus the Anthropic
and Resend keys if you provide them), deploys, and waits for `/healthcheck`.
Commit the rewritten `.railway/app.json` afterwards. For scripted use:
`--non-interactive --name <project> [--workspace <id>]`, with optional keys in
`PROVISION_ANTHROPIC_API_KEY`, `PROVISION_RESEND_API_KEY`, and
`PROVISION_EMAIL_FROM`.

**First admin.** A new deployment has no users. Set `ADMIN_EMAILS` on the
service (comma-separated, e.g. `railway variable set ADMIN_EMAILS --stdin
--service <svc>`) and `RESEND_API_KEY` so verification email arrives. Sign
up with a listed address, click the verification link, and sign in again: the
account becomes ADMIN once its email is verified, never at sign-up, because
sign-in doesn't require verification and anyone could register the address
first. If sign-up reports that the address already exists, someone else
registered it: don't verify it; delete that user, then sign up yourself. A
listed address stays ADMIN: it is re-promoted at each sign-in, so remove it
from `ADMIN_EMAILS` before demoting it in `/admin`.

**After that**, ship by merging to `main`: Railway builds once CI passes.
Change infrastructure by editing `.railway/railway.ts` and running
`railway config plan`, then `railway config apply`. Read the plan first: a
service or variable missing from the file is deleted, and removing `source`
disconnects the repo.

There is no `railway.json`: Railway's Config as Code is deprecated (it stops being
read on 2026-12-01), and `.railway/railway.ts` is the only Railway config.

Production ships the same way, only by merging to `main`. Railway's GitHub
integration builds the commit, and Wait for CI (`checkSuites: true` in
`.railway/railway.ts`) holds the deploy until the CI workflow finishes and skips
it if CI fails. CI has no deploy job, and `railway up` is not used against
production.

The image is also deployable to any Docker-compatible platform (Fly.io, AWS ECS,
Google Cloud Run, …).

## Routes

| Route              | Description                                    |
| ------------------ | ---------------------------------------------- |
| `/`                | Home — overview of what Iridium includes       |
| `/login`           | Sign in or create an account                   |
| `/forgot-password` | Request a password reset email                 |
| `/reset-password`  | Choose a new password from an emailed link     |
| `/dashboard`       | Stats, quick actions, and recent activity      |
| `/chat`            | AI chat with searchable thread sidebar         |
| `/notes`           | Notes CRUD with search and pagination          |
| `/settings`        | Profile, password change, account deletion     |
| `/admin`           | User roles, ban/unban, impersonation           |
| `/api/chat`        | Chat API endpoint (model picker, regeneration) |
| `/api/auth/*`      | Auth API endpoints                             |
| `/api/theme`       | Theme cookie endpoint                          |
| `/healthcheck`     | Health status                                  |
| `/robots.txt`      | Robots policy                                  |
| `/sitemap.xml`     | Sitemap of public routes                       |

## Optional Agent Tooling

The repo ships configuration for AI coding agents. None of it is needed to
build, run, test, or deploy the app, so delete whatever you don't use.

- **Claude Code agents and skills** (`CLAUDE.md`, `.claude/agents/`,
  `.claude/skills/`): `CLAUDE.md` is the agent guide to this codebase. The
  agents are specialists (Tailwind, accessibility, Prisma, security, and
  more); the project skills cover forms, Railway provisioning, GitHub issue to
  PR, and QA. Third-party skills are vendored in `.agents/skills/`, symlinked
  into `.claude/skills/`, and pinned in `skills-lock.json`.
- **GitHub Copilot** (`.github/agents/`, `.github/prompts/`,
  `.github/copilot-instructions.md`): Copilot versions of the same agents,
  plus Spec Kit prompts.
- **Spec Kit** (`.specify/`, `.claude/skills/speckit-*`,
  `.github/agents/speckit.*`): the [Spec Kit](https://github.com/github/spec-kit)
  spec-driven workflow (`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
  `/speckit-implement`), governed by `.specify/memory/constitution.md`.
- **Ralph** (`scripts/ralph/`, plus the `prd` and `ralph` skills): an
  autonomous loop that runs Claude Code once per user story in
  `scripts/ralph/prd.json` and commits each one. It runs
  `claude --dangerously-skip-permissions`, so use it only in a dedicated clone
  or worktree. Commits stay local unless you pass `--push` or `--pr`. Run
  state (`prd.json`, `progress.txt`, `archive/`) is gitignored.
- **Linear** (`linear-triage` and `linear-to-pr` skills): triage backlog
  issues against the code and implement them as PRs. `linear-triage` reads the
  Linear team and project from the `## Linear` section of `CLAUDE.md`; point it
  at your own project or delete the section.

Personal Claude Code state (`.claude/settings.local.json`, `.claude/projects/`,
`.claude/worktrees/`) is gitignored.

## Docs

- [Adding a feature](docs/adding-a-feature.md) — the route → action → model → test walkthrough, using Notes as the worked example
- [Chat tool-calling troubleshooting](docs/chat-tool-calling.md)

## License

[MIT](LICENSE). Iridium is meant to be copied: use "Use this template" on GitHub to start a new project with fresh history, then run `bun run setup`.
