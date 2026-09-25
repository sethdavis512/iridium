# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Iridium is a full-stack AI chat application built with React Router v8 (SSR), Better Auth, Prisma/PostgreSQL, and Vercel AI SDK with VoltAgent.

## Commands

| Command                  | Purpose                               |
| ------------------------ | ------------------------------------- |
| `bun run dev`            | Start dev server (port 5173)          |
| `bun run dev:full`       | docker:up then dev (one command)      |
| `bun run build`          | Production build                      |
| `bun run provision`      | Create + deploy a new Railway project |
| `bun run clean`          | Remove build + test output dirs       |
| `bun run typecheck`      | Generate route types + run tsc        |
| `bun run lint`           | ESLint check                          |
| `bun run format`         | Prettier write                        |
| `bun run format:check`   | Prettier check (no write)             |
| `bun run validate`       | typecheck + lint + format:check       |
| `bun run test`           | Run Vitest unit tests                 |
| `bun run test:watch`     | Run Vitest in watch mode              |
| `bun run test:e2e`       | Playwright E2E, Chromium only (as CI) |
| `bun run test:e2e:cross` | E2E on Chromium, Firefox and WebKit   |
| `bun run test:all`       | Unit + E2E tests                      |
| `bun run test:visual`    | Visual inventory screenshot gallery   |
| `bun run db:migrate`     | Run Prisma migrations (dev)           |
| `bun run db:deploy`      | Apply migrations (prod/CI, no prompt) |
| `bun run db:seed`        | Seed database with test users         |
| `bun run db:fresh`       | Reset DB + migrate + seed (one shot)  |
| `bun run db:studio`      | Open Prisma Studio GUI                |
| `bun run db:push`        | Push schema without migration         |
| `bun run db:generate`    | Regenerate Prisma client              |
| `bun run trigger:dev`    | Run Trigger.dev tasks locally         |
| `bun run trigger:deploy` | Deploy Trigger.dev tasks              |
| `bun run docker:up`      | Start both Postgres containers        |
| `bun run docker:down`    | Stop containers (data preserved)      |
| `bun run docker:nuke`    | Stop containers and delete volumes    |

Run a single Playwright test: `bunx playwright test tests/auth.spec.ts --project=chromium`

Prisma CLI: always use `bunx --bun prisma <command>` (not `npx`).

## Local Setup

```sh
cp .env.example .env        # fill in BETTER_AUTH_SECRET and ANTHROPIC_API_KEY
bun install
bun run docker:up           # starts both Postgres containers
bun run db:migrate          # apply Prisma migrations
bun run db:seed             # seed demo users
bun run dev
```

Seeded users (all password `password123`): `alice@iridium.dev`, `bob@iridium.dev`, `admin@iridium.dev` (ADMIN).

App identity lives in `app/config.ts`: `APP_NAME`/`APP_TAGLINE` for display, and `APP_SLUG`, which namespaces the theme cookie, Better Auth's cookie prefix (`AUTH_COOKIE_PREFIX`, which keeps the default `better-auth` for the original `iridium` slug so production sessions survive), the local database name, the Compose project, and the demo email domain. `bun run setup` (`tools/init.ts`, pure helpers in `tools/identity.ts`) rewrites them for a copy, including `docker-compose.dev.yml`, `prisma.config.ts`, and `.env.example`, which can't import the config; `tools/identity.test.ts` fails if those drift from `APP_SLUG`. Setup also checks the database host ports: when another project holds 5432/5433 it picks a free pair (`tools/ports.ts`; asks first, automatic with `--non-interactive`) and writes `POSTGRES_PORT`/`VOLTAGENT_POSTGRES_PORT` plus the matching URLs to `.env`.

### Two-Database Setup

The app runs two PostgreSQL instances via `docker-compose.dev.yml`:

| Database    | Port | Env Var                  | Purpose                          |
| ----------- | ---- | ------------------------ | -------------------------------- |
| `iridium`   | 5432 | `DATABASE_URL`           | Prisma (app data, auth, threads) |
| `voltagent` | 5433 | `VOLTAGENT_DATABASE_URL` | VoltAgent memory and state       |

VoltAgent creates its own tables automatically on first connection -- no migration needed. It does so the first time chat uses memory, in whatever database `VOLTAGENT_DATABASE_URL` names, so env validation refuses a `VOLTAGENT_DATABASE_URL` that resolves to the same database as `DATABASE_URL` (in dev too).

**One-time cleanup for stray VoltAgent tables:** from late February to 2026-03-24, memory was wired to `DATABASE_URL`, so an app database from that era can still hold `voltagent_memory_*` tables, which `prisma migrate dev` reports as drift. They hold no app data (live memory is on 5433). Drop them from the database Prisma actually uses (`prisma db execute` reads `DATABASE_URL` through `prisma.config.ts`):

```sh
echo 'DROP TABLE IF EXISTS voltagent_memory_steps, voltagent_memory_workflow_states, voltagent_memory_messages, voltagent_memory_conversations, voltagent_memory_users CASCADE;' | bunx --bun prisma db execute --stdin
```

Or reset everything with `bun run db:fresh`.

**Gotcha: another Postgres on port 5432.** A host Postgres (Postgres.app, Homebrew) listening on `127.0.0.1`/`::1` port 5432 wins over Docker's wildcard binding, so `localhost:5432` silently reaches it, and whatever old `iridium` database it holds, instead of the `postgres` container. `lsof -nP -iTCP:5432 -sTCP:LISTEN` shows who is listening, and `SELECT version()` through `DATABASE_URL` shows which server you reached. Stop the other server, or move one of them off 5432, before trusting local migrations or E2E runs.

The ports are defaults: `docker-compose.dev.yml` publishes on `${POSTGRES_PORT:-5432}`/`${VOLTAGENT_POSTGRES_PORT:-5433}`, and when the database URLs are unset, `prisma.config.ts` and `DEV_FALLBACKS` in `env.server.ts` follow the same vars. `tools/ports.test.ts` fails if those defaults drift. CI uses its own service containers on the defaults.

Environment variables are validated at startup by `app/lib/env.server.ts` -- missing or invalid vars produce clear error messages.

## Tech Stack

- **Framework**: React Router v8 with SSR; middleware is always on (the v7 `future.v8_middleware` flag is gone and RR8 refuses to boot if it is set)
- **Auth**: Better Auth with Prisma adapter, admin plugin (roles: USER < EDITOR < ADMIN)
- **Database**: PostgreSQL via Prisma ORM (schema at `prisma/schema.prisma`, generated client at `app/generated/prisma/`)
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/react`) + VoltAgent. Per-thread model selection against the allowlist in `app/lib/ai-models.ts` (Haiku 4.5 default)
- **Email**: Resend + react-email behind `app/lib/email.server.ts` (console fallback without `RESEND_API_KEY`)
- **Styling**: Tailwind CSS v4 + COSS UI (Base UI primitives, copy-owned in `app/components/ui/` via the shadcn CLI and the `@coss` registry — `bunx shadcn@latest add @coss/<name>`, config in `components.json`). Installed ui/ files use `cn()` from `app/lib/utils.ts`; app-authored components use CVA from `cva.config`. **Gotcha:** after adding a ui primitive, add any new client dep (including each `@base-ui/react/<subpath>` import) to `optimizeDeps.include` in `vite.config.ts` — late Vite dep discovery re-optimizes mid-session and splits React across module graphs, crashing hydration ("Invalid hook call") in dev and E2E. Also delete the `'use client'` line the registry puts at the top of each added file: it means nothing in React Router SSR, and Rollup-based builds warn on it ("Error when using sourcemap")
- **Runtime**: Bun (dev), Node 24 Alpine (Docker/prod). React Router 8 needs Node 22.22+ locally and in CI (`actions/setup-node` pins 24)
- **Validation**: Zod + React Hook Form
- **Icons**: lucide-react

## Architecture

### Routing (config-based, NOT file-system)

Routes are defined in `app/routes.ts` using `@react-router/dev/routes` helpers (`index`, `route`, `prefix`). Route files export: `middleware` array (optional) → `loader` → `action` → `default` component.

Auto-generated types: `import type { Route } from './+types/<routeName>'`.

API routes live under `/api` prefix and export only `loader`/`action` (no component).

**React Router 8 overrides the `react-router-framework-mode` skill.** The vendored skill predates React Router 8 (its upstream, `remix-run/agent-skills`, is archived). Where it disagrees, these rules win:

- Middleware is always on. Never add `future.v8_middleware` (or any other removed `v8_*` flag) to `react-router.config.ts`; React Router 8 refuses to start with it.
- `AppLoadContext` is gone. The `context` argument to loaders, actions, and middleware is always a `RouterContextProvider`: define keys with `createContext` and use `context.set()`/`context.get()` (see `app/context.ts` and `app/middleware/auth.ts`). A custom server's `getLoadContext` must return a `RouterContextProvider`.
- Loaders and actions receive the raw incoming `request`. Use the `url` argument when you need the normalized URL (no `.data` suffix or `index`/`_routes` params).
- For anything else version-sensitive, read the version-matched docs in `node_modules/react-router/docs/` and `node_modules/react-router/CHANGELOG.md`.

### Data Access Layer

Plain async functions in `app/models/*.server.ts` — no classes, no ORM wrappers. Functions use the Prisma client directly.

- `thread.server.ts` — thread CRUD + `saveChat` (upserts last 2 messages), `searchThreads`, `updateThreadModel`, `deleteTrailingAssistantMessages`. Use `getThreadMeta` (id, owner, title, model; no messages) for ownership checks and `getThreadById` only when the messages are needed. Thread lists select no messages and are capped at `THREAD_LIST_LIMIT`
- `note.server.ts` — note CRUD with search, counts, and pagination params
- `message.server.ts` — `addMessageToThread`
- `session.server.ts` — `getUserFromSession`, `requireUser`, `requireAnonymous`, `hasRole`, `requireRole`
- `user.server.ts` — `getUserById`, `updateUserProfile`

**Soft deletes**: `Thread` and `Note` have `deletedAt`; every read in the model layer filters `deletedAt: null` and deletes set the timestamp. The model layer is the only Prisma entry point for these tables — never query them from routes directly.

### Auth Flow

- Server config: `app/lib/auth.server.ts` (Better Auth + Prisma adapter)
- Client config: `app/lib/auth.client.ts` (`createAuthClient` + `adminClient` plugin)
- API passthrough: `/api/auth/*` → `auth.handler` in `app/routes/api-auth.ts`
- Middleware: `app/middleware/auth.ts` checks session, redirects to `/login`, stores user in `userContext`
- Protect a route: `export const middleware: Route.MiddlewareFunction[] = [authMiddleware]`
- Social login: GitHub and Google via `socialProviders` in `auth.server.ts`, gated on `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. The login loader passes `enabledSocialProviders` to `Turnstile`, which only renders buttons for configured providers
- Account flows: `/forgot-password` + `/reset-password` (token emails via `sendResetPassword`), `/settings` (profile, change password, delete account). Verification emails send on sign-up but sign-in is not gated (`requireEmailVerification` stays off — the E2E fixtures rely on sign-up auto-login)
- Admin: `/admin` (requireAdmin) lists users with search/pagination and supports role changes, ban/unban, and impersonation (`/stop-impersonating` ends it; banner renders from SiteHeader). Gotcha: the admin plugin's `adminRoles` AND its `roles` permission map must be re-keyed to the uppercase Role enum or every admin API call returns FORBIDDEN (see `auth.server.ts`)
- First admin: optional `ADMIN_EMAILS` (comma-separated). `auth.server.ts` promotes a listed user to ADMIN in `afterEmailVerification` and on each sign-in (`databaseHooks.session.create.after`), but only once `emailVerified` is true (rule in `app/lib/admin-emails.ts`); never promote at sign-up, since sign-in isn't gated on verification. The cookie cache holds the old role until the next sign-in. `prisma/seed.ts` refuses production or non-localhost databases unless `--force` (`prisma/seed-guard.ts`)

### AI Chat Flow

1. Client sends messages via `useChat` (`@ai-sdk/react`) with `DefaultChatTransport` → `/api/chat`. A normal turn sends only the newest message (`prepareSendMessagesRequest` in `thread.tsx`); regeneration sends the full history
2. Server checks the session and rate limit (20 req/min) before reading the body, rejects bodies over 1 MB (413, by `Content-Length` and while reading), validates with Zod (text parts capped at 32k chars), checks thread ownership, then streams via `agent.streamText()`
3. VoltAgent manages conversation memory (PostgreSQL-backed) and calls tools as needed. The agent and its memory are built on first use, not at import: `getChat()` (`app/voltagent/agents.ts`) opens the memory adapter through `createLazyResource()` (`lazy-resource.ts`), so a VoltAgent database that is down at boot takes out chat only. A failed open is logged (`resource_open_failed`) and retried on demand with backoff (1s doubling to 30s); meanwhile `/api/chat` answers 503 with `Retry-After` (after auth and ownership checks, before touching the thread) and recovers without a restart. Never import the agent or memory at module level; call `getChat()`. `/healthcheck` still reports 503 while the VoltAgent database is unreachable
4. `UIMessage.parts` are serialized as JSON string in the `content` DB column
5. On completion, `saveChat()` upserts messages to the database. Generation stops when the client disconnects or presses Stop (`abortSignal: request.signal`, plus a timeout), and `consumeSseStream` drains the stream server-side so an aborted turn's partial reply is still saved

Agent tools are defined in `app/voltagent/tools/` (`create_note`, `list_notes`, `search_notes`, `render_card`, `get_weather`, `get_current_datetime`). The `render_card` tool demonstrates VoltAgent's tool-driven generative UI pattern -- the agent returns structured data and `CardToolPart` renders it as a rich visual card.

Per-thread model: `Thread.model` is set via a `set-model` intent in the `/chat` action and flows into the agent's dynamic model callback through the call `context` Map. Regeneration (`useChat().regenerate()`) sends `trigger: 'regenerate-message'`; the server deletes trailing assistant rows, clears VoltAgent conversation memory, and resends trimmed history.

### Rate Limiting

Both limiters store state in Postgres, so limits are shared across replicas and survive deploys.

- **App limiter**: `await rateLimit({ key, maxRequests, windowMs })` in `app/lib/rate-limit.server.ts` is a sliding window over the `RateLimitBucket` table (one row per key holding the hit timestamps still inside the window). Used for chat (20/min), note creation (10/hour), and per-user write limits on notes, threads, settings, and admin actions. Each check runs in a transaction that takes a per-key `pg_advisory_xact_lock` first, so concurrent requests on any instance cannot both slip under the limit; rejected requests are not recorded. Each process sweeps expired buckets inline at most once a minute. The window math is the pure `slideWindow()`, unit-tested on its own.
- **Better Auth**: `rateLimit.storage: 'database'` in `auth.server.ts` keeps its per-IP counters in the `RateLimit` table (shape dictated by Better Auth, which also prunes it). `DISABLE_AUTH_RATE_LIMIT=true` still turns it off for E2E.

### Database pools

Every pg pool is built from `pgPoolConfig()` in `app/lib/db-pool.server.ts`: `connectionTimeoutMillis` 5s (pg's default waits forever), `statement_timeout` 15s, `idle_in_transaction_session_timeout` 30s. Sizes (`POOL_MAX`) assume 1 replica and Railway Postgres's default `max_connections` of 100 per database: Prisma 10 on the app DB, VoltAgent memory 5 plus a 1-connection healthcheck probe on the VoltAgent DB. A deploy briefly runs two replicas, so budget double (20 and 12), plus Trigger.dev workers on the app DB. Revisit `POOL_MAX` before adding replicas. VoltAgent's adapter only types `maxConnections`, so `memory-storage.ts` passes the pg options through its object-form `connection` (it spreads that into `new Pool()`); recheck after upgrading `@voltagent/postgres`. Every pool also needs an `'error'` listener: an idle client's error (the database restarting) is emitted on the pool and, unheard, exits the process. The adapter never adds one and keeps its pool in a TypeScript-private field, so `logMemoryPoolErrors()` (`app/voltagent/pool-errors.ts`) attaches it through the runtime `pool` property; its test fails if an upgrade moves that field.

### Environment Validation

`app/lib/env.server.ts` validates env with Zod at startup. Required **infra** vars (`DATABASE_URL`, `VOLTAGENT_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`) plus **feature** keys that degrade gracefully when unset (`ANTHROPIC_API_KEY` → chat disabled, `RESEND_API_KEY` → email to console, OAuth pairs → buttons hidden, `TRIGGER_SECRET_KEY` → jobs inline, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID` → billing stub, `ADMIN_EMAILS` → no first-admin bootstrap) and `EMAIL_FROM`, `DISABLE_AUTH_RATE_LIMIT`, `E2E_TEST_HOOKS`. Import `env` from this module instead of reading `process.env` directly in server code.

**Boot behavior is environment-dependent:** in **production**, missing/invalid vars fail fast (`process.exit(1)`) so misconfigured prod never runs. In **dev/test**, the app always boots — missing infra vars are swapped for placeholders (a console warning lists them) and missing feature keys just disable their feature. The exception is `bootEnvSchema`'s cross-field rules (a `VOLTAGENT_DATABASE_URL` that names the `DATABASE_URL` database): no placeholder fixes a set but wrong value, so they fail boot everywhere. What's unset surfaces in a **dev-only banner** at the top of every page (`EnvBanner`, fed by `envWarnings`/`shouldShowEnvBanner` from `env.server.ts` via the root loader). The banner never renders in production or during E2E runs (gated on `E2E_TEST_HOOKS`), so it can't affect end users or test/visual snapshots.

### Billing (Stripe stub)

`app/lib/billing.server.ts` wraps Stripe behind an interface the same way `email.server.ts` wraps Resend. Without `STRIPE_SECRET_KEY` it runs in **stub mode**: `createCheckoutSession`, `createBillingPortalSession`, and `constructWebhookEvent` return mocked results logged to the console, so dev and CI need no Stripe account. Wiring the real SDK is a localized edit confined to that file (install `stripe`, fill the `TODO` branches). Persisting customer/subscription state is left to the caller (add fields to the `User` model or a `Subscription` model and update them from the webhook handler).

### Deployment

Production runs the multi-stage `Dockerfile` (Node 24 Alpine runtime). tini is the ENTRYPOINT (PID 1), and the CMD applies pending Prisma migrations (`migrate deploy`, a no-op when current) and then `exec`s node on `react-router-serve` directly (no npm or shell left in the process tree), so plain Docker hosts self-migrate on boot. Railway does not migrate on boot: the start command in `.railway/railway.ts` replaces both ENTRYPOINT and CMD (exec form, so it names `/sbin/tini` and absolute paths itself) and only serves, and migrations run once per deploy as the pre-deploy command, so a failed migration fails that deploy (the current release keeps serving) instead of crash-looping the container.

**Graceful shutdown:** in production, `entry.server.tsx` calls `installGracefulShutdown()` (`app/lib/shutdown.server.ts`). On SIGTERM/SIGINT it stops accepting connections, waits for in-flight requests (chat streams included) to finish, runs the cleanups registered with `onShutdown()`, and exits 0. Any new long-lived resource (a database pool, a client with open sockets) must register its close with `onShutdown()`, or it outlives the drain until SIGKILL. Gotcha: in a route module, call `onShutdown()` from loader/action code (see `getVoltagentPool()` in `routes/healthcheck.ts`), never at module top level, or the client build fails with "Server-only module referenced by client". `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60` in `.railway/railway.ts` is the SIGTERM-to-SIGKILL window on redeploys.

**Railway is defined as code** in `.railway/railway.ts` (IaC, evaluated by the Railway CLI via the `railway` devDependency): app service built from the Dockerfile, `Postgres` + `VoltAgent Postgres`, `/healthcheck`, `prisma migrate deploy` as the pre-deploy command, and `checkSuites: true` (Railway's Wait for CI). Per-project values live in `.railway/app.json`; the file throws if `app.json.project` doesn't match the linked Railway project. A fresh copy of the template gets its own project with `bun run provision` (`tools/provision.ts`, `provision-railway` skill), which rewrites `app.json`, runs `railway init` + `railway config apply`, generates a domain, sets secrets on stdin, and waits for `/healthcheck`. Change infra with `railway config plan` then `railway config apply`. Gotchas: variables or services omitted from the file are deleted on apply (declare externally-set values as `preserve()`), omitting `source` disconnects the GitHub repo, and databases holding data must keep their pinned image or a plan swaps the Postgres major version. Never `railway up` to production and never pass `--confirm-destructive` without the user approving the plan.

The Iridium production project is managed by `.railway/railway.ts` (applied 2026-09-25); there is no `railway.json` (Config as Code is deprecated and stops being read on 2026-12-01). `railway config plan` always shows one cosmetic diff: the planner doesn't recognize the quoted `"VoltAgent Postgres"` variable reference as unchanged, so applying it is a no-op.

**Production ships only by merging to `main`.** Railway's GitHub autodeploy builds the commit, and Wait for CI (`checkSuites: true` above) holds the deployment until the `CI` workflow run on that commit finishes, skipping it if CI fails. CI (`.github/workflows/ci.yml`) has no deploy job: it runs validate (typecheck, lint, format, unit), Playwright e2e, and a `docker` job that builds the production image and boots it against Postgres until `/healthcheck` returns 200. The visual inventory runs on PRs only, so it never delays or blocks a deploy. A `changes` job (dorny/paths-filter) skips unit, e2e, visual, and docker when a commit only touches `.claude/`, `.agents/`, `.specify/`, `docs/`, or markdown; validate always runs. `railway up` is not used against production.

**Deploy rules for agents.** Use the project `provision-railway` skill for first-time provisioning and for any infra change. It overrides generic Railway skills (this repo vendors none):

- Production ships only by merging to `main`; Railway builds the commit once CI passes. Never run `railway up` against production: it uploads the local working tree, uncommitted changes included, and skips git and CI.
- Infra changes go through `.railway/railway.ts` (per-project values in `.railway/app.json`): run `railway config plan`, show the user the plan, then `railway config apply`.
- Check health with `/healthcheck` and `railway logs --service <svc> --lines 100` (always pass `--lines`, or it streams forever). Roll back by reverting the commit on `main`, or with Rollback on an earlier deployment in the Railway dashboard.

### Background Jobs

Trigger.dev v4 tasks live in `trigger/` (config in `trigger.config.ts`): `send-auth-email`, `generate-thread-title`, and the scheduled `purge-soft-deleted` (hard-deletes Threads/Notes soft-deleted 30+ days ago, daily). `app/lib/jobs.server.ts` is the only enqueue entry point: with `TRIGGER_SECRET_KEY` set it hands work to Trigger.dev, otherwise it runs the same shared functions inline (`app/lib/email-jobs.server.ts`, `app/lib/thread-title.server.ts`). Keep task files thin; put logic in those shared modules so the inline fallback and the worker never diverge. `bun run trigger:dev` / `bun run trigger:deploy`; both pin the `trigger.dev` CLI to the installed `@trigger.dev/sdk` version, so bump the scripts with the SDK. CI's `trigger` job deploys the tasks on pushes to `main` once the `TRIGGER_ACCESS_TOKEN` repo secret and `TRIGGER_PROJECT_REF` repo variable exist, and is a no-op until then.

### Testing

**Unit tests** use Vitest (`bun run test`). Test files live alongside source files as `*.test.ts`. Modules that import server-side dependencies (auth, Prisma) need `vi.mock()` to avoid env validation side effects.

**E2E tests** use Playwright (`bun run test:e2e`) in `tests/`, covering auth, navigation, dashboard, notes, settings, password reset, theme switching, SEO endpoints, healthcheck, the chat flow, model selection/regeneration, agent tool rendering, chat error UX, the `/api/chat` API boundary, and cross-user thread access control. They run against a dedicated dev server on port `7778` (override with `E2E_PORT`) so they never collide with `bun run dev` on 5173; the `webServer` config also points `BETTER_AUTH_BASE_URL` at that port and sets `DISABLE_AUTH_RATE_LIMIT=true`, `E2E_TEST_HOOKS=true` (enables `/api/test-mailbox` for reading reset links), plus a dummy `ANTHROPIC_API_KEY`.

Auth is explicit per test: the `authedPage` fixture in `tests/fixtures.ts` signs up a brand-new isolated user on demand (so every test starts with zero threads and parallel runs never share state), while a plain `page` stays logged out. `globalSetup` only ensures the seed users (Alice, Bob) exist for tests that log in as them. Fixtures also export `createAuthedContext` and `createThreadViaApi` for multi-user scenarios. Chat tests mock `/api/chat` with canned SSE responses (no AI service needed); tool-rendering tests stream `dynamic-tool` parts via helpers in `tests/chat-mock.ts`.

**Responsive guardrails** (`tests/responsive.spec.ts`, runs in the default e2e projects) assert key surfaces stay usable on small screens: no horizontal document overflow across routes at phone/tablet viewports, the mobile nav drawer completes navigation, the chat composer stays usable in the stacked phone layout, the admin table scrolls inside its container, and (chromium-only, via `isMobile`/`hasTouch` emulation) touch affordances like the delete-thread button are visible without hover. Touch-emulation tests must stay chromium-gated; Firefox does not support `isMobile`.

**Visual inventory** (`bun run test:visual`) captures a screenshot gallery of every major surface and state (~20 shots: landing/login, dashboard, notes, settings, chat, admin, with dark and mobile sampled on landing, login, and dashboard). It lives in `tests/visual/`, runs only when `PW_VISUAL=1` enables the `visual` Playwright project (the default e2e projects ignore `tests/visual/`), and writes PNGs to `test-results/visual-inventory/` plus report attachments, so the Playwright HTML report doubles as a browsable gallery. CI runs it in its own PR-only `visual` job and uploads a `visual-inventory` artifact on every PR. Helpers in `tests/visual/helpers.ts` keep shots deterministic: `setTheme` pins the theme cookie via `/api/theme` (never leave the `system` default), `settle` waits for hydration + fonts + network idle, `createVisualContext` signs up a user with the fixed name "Visual Tester", and `snap` masks `<time>` elements (`FormattedDate` renders the current date) and disables animations. These are captures, not assertions; to add visual regression later, swap `snap()` for `expect(page).toHaveScreenshot()` and commit Linux-generated baselines.

## Conventions

### Imports

- Use `~/` path alias for all app imports (maps to `./app/*`)
- Server-only files use `.server.ts` suffix

### Components

- Use CVA from `cva.config` (not the raw `cva` package) — it integrates `tailwind-merge` — for app-authored components; copy-owned files in `app/components/ui/` keep their upstream `cn()`/`class-variance-authority` conventions
- Export both variant definitions and a named function component
- Type props with `PropsWithChildren<Props>`
- Use COSS UI primitives from `~/components/ui/` (Button, Dialog, AlertDialog, Menu, Sheet, Badge, Alert, Table, etc.). Polymorphism is `render={<Link to=... />}`, never `asChild`; menu items take `onClick`; Base UI sets `data-disabled`, so style disabled states with `data-[disabled]:`
- Semantic tokens only (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-destructive`, `bg-info/success/warning` + `-foreground`) — never raw palette classes or DaisyUI names. Tokens live in `app/app.css` on `:root` and `.dark`
- No hover-only interactive controls: anything revealed by `group-hover:`/`hover:` also needs `focus-visible:` and `pointer-coarse:` fallbacks (touchscreens never hover). COSS Buttons ship a built-in `pointer-coarse` 44px hit area; for custom controls use `pointer-coarse:` sizing utilities (e.g. `size-7 pointer-coarse:size-11`)

### Routes

- Pages set `<title>` and `<meta>` inline in JSX — no `meta` export
- Use `<Form>` with `intent` hidden fields for action disambiguation
- Export `ErrorBoundary` using `isRouteErrorResponse` for error handling
- Use `tiny-invariant` for runtime assertions

### Context & Shared Styles

- `app/context.ts` — `userContext` via React Router's `createContext<SessionUser | null>`, plus `requestIdContext`, set by the root `requestIdMiddleware` (`app/middleware/request-id.ts`), which reuses or mints `x-request-id`, echoes it on the response, and wraps the request in `withLogContext` so every `log.*` line carries `requestId`. `handleError` in `entry.server.tsx` logs loader/action/render errors the same way
- `app/shared.ts` — shared className helpers (`listItemClassName`, `navLinkClassName`)
- `app/hooks.ts` — shared hooks: `useDialogState` (controlled Base UI Dialog/AlertDialog state: `open`/`onOpenChange`/`openDialog(target?)`/`close`/`target`, with derived reopen-on-error — no setState-in-effect), `usePendingIntent`, `useIsSubmitting`

### Shared UI building blocks

Reuse these instead of re-rolling the markup: the COSS primitives in `app/components/ui/` (Dialog/AlertDialog with `useDialogState`, Button, Badge, Alert, Menu, Sheet, Table), plus the app wrappers: `SearchForm` (GET ?q= form, filters as children), `PageHeader` (h1 + action/subtitle slots), `StatTile` (dashboard stats, `data-slot="stat"`), `Spinner`, `FormAlert` (error alert, accepts action-button children; also used by ErrorBoundaries), `ToolPartShell` + `isToolLoading`/`isToolDone` (chat tool-call chrome), `FormattedDate`, `EmptyState`, `Card`, `Pagination`, `ChatBubble`. Dialog composition: `DialogHeader` outside the `<Form className="contents">`, form wraps `DialogPanel` + `DialogFooter`; Cancel is `variant="ghost"`.

### Layout

`app/root.tsx` is chrome-agnostic: it renders only the HTML document (`Layout`), the auth `loader` (`isAuthenticated`), and a bare `<Outlet/>`. All page chrome lives in per-section layout routes under `app/routes/layouts/`, composed in `routes.ts` via `layout(...)`:

- `layouts/app.tsx` — locked app shell (`h-dvh` grid: header → internal-scroll `main` → footer). Wraps `/dashboard`, `/chat`, `/notes`, `/settings`. Use this shell for app surfaces that should fill the viewport and scroll internally.
- `layouts/marketing.tsx` — growable document (`min-h-dvh` flex column, footer at content's end). Wraps `/` (landing).
- `layouts/auth.tsx` — full-bleed, no header/footer. Wraps `/login`, `/forgot-password`, `/reset-password`.

Shared chrome is extracted into `SiteHeader` and `SiteFooter` (`app/components/`). `SiteHeader` reads auth state via `useRouteLoaderData<typeof rootLoader>('root')` rather than props, and owns the skip link, the labeled Site/Main navs, the theme toggle (Base UI Menu), and the mobile nav Sheet. Root renders the flash `Toaster` and drives dark mode by putting `class="dark"` on `<html>` from the theme cookie; `theme === 'system'` resolves via a pre-paint inline script reading `prefers-color-scheme` (with `suppressHydrationWarning` on `<html>`). The CSP's `script-src` allows only same-origin files and a per-request nonce (no `'unsafe-inline'`): `entry.server.tsx` generates it and passes it to `ServerRouter`, React's stream, and `NonceProvider`, so any new inline `<script>` must take `nonce={useNonce()}` (`app/lib/nonce.tsx`) plus `suppressHydrationWarning`, or the browser blocks it (`tests/csp.spec.ts` checks). Gotcha: an open Sheet/Dialog makes the rest of the page inert, so tests must assert on the popup, not the trigger.

**Definite height matters:** app/auth shells use `h-dvh` (a fixed height) so the `min-h-0` + `overflow-y-auto` chain can scroll children internally. `min-h-screen` is a minimum, not a definite height, and silently breaks internal scrolling once content exceeds the viewport.

### Formatting

Prettier with: 80 char width, 4-space indentation, single quotes, semicolons, tailwindcss plugin for class sorting. ESLint with typescript-eslint and react-hooks plugin.

## Linear

Issues for this repo live in Linear team **Tech with Seth**, project **Iridium**. Skills that query Linear (such as `linear-triage`) read the team and project from this section. A copy of the template should point this at its own project or delete the section.
