# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Iridium is a full-stack AI chat application built with React Router v7 (SSR), Better Auth, Prisma/PostgreSQL, and Vercel AI SDK with VoltAgent.

## Commands

| Command                  | Purpose                               |
| ------------------------ | ------------------------------------- |
| `bun run dev`            | Start dev server (port 5173)          |
| `bun run dev:full`       | docker:up then dev (one command)      |
| `bun run build`          | Production build                      |
| `bun run start:migrate`  | migrate deploy then serve (prod boot) |
| `bun run clean`          | Remove build + test output dirs       |
| `bun run typecheck`      | Generate route types + run tsc        |
| `bun run lint`           | ESLint check                          |
| `bun run format`         | Prettier write                        |
| `bun run format:check`   | Prettier check (no write)             |
| `bun run validate`       | typecheck + lint + format:check       |
| `bun run test`           | Run Vitest unit tests                 |
| `bun run test:watch`     | Run Vitest in watch mode              |
| `bun run test:e2e`       | Run all Playwright E2E tests          |
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

### Two-Database Setup

The app runs two PostgreSQL instances via `docker-compose.dev.yml`:

| Database    | Port | Env Var                  | Purpose                          |
| ----------- | ---- | ------------------------ | -------------------------------- |
| `iridium`   | 5432 | `DATABASE_URL`           | Prisma (app data, auth, threads) |
| `voltagent` | 5433 | `VOLTAGENT_DATABASE_URL` | VoltAgent memory and state       |

VoltAgent creates its own tables automatically on first connection -- no migration needed.

Environment variables are validated at startup by `app/lib/env.server.ts` -- missing or invalid vars produce clear error messages.

## Tech Stack

- **Framework**: React Router v7 with SSR and `v8_middleware` future flag
- **Auth**: Better Auth with Prisma adapter, admin plugin (roles: USER < EDITOR < ADMIN)
- **Database**: PostgreSQL via Prisma ORM (schema at `prisma/schema.prisma`, generated client at `app/generated/prisma/`)
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/react`) + VoltAgent. Per-thread model selection against the allowlist in `app/lib/ai-models.ts` (Haiku 4.5 default)
- **Email**: Resend + react-email behind `app/lib/email.server.ts` (console fallback without `RESEND_API_KEY`)
- **Styling**: Tailwind CSS v4 + COSS UI (Base UI primitives, copy-owned in `app/components/ui/` via the shadcn CLI and the `@coss` registry). Installed ui/ files use `cn()` from `app/lib/utils.ts`; app-authored components use CVA from `cva.config`
- **Runtime**: Bun (dev), Node 20 Alpine (Docker/prod)
- **Validation**: Zod + React Hook Form
- **Icons**: lucide-react

## Architecture

### Routing (config-based, NOT file-system)

Routes are defined in `app/routes.ts` using `@react-router/dev/routes` helpers (`index`, `route`, `prefix`). Route files export: `middleware` array (optional) → `loader` → `action` → `default` component.

Auto-generated types: `import type { Route } from './+types/<routeName>'`.

API routes live under `/api` prefix and export only `loader`/`action` (no component).

### Data Access Layer

Plain async functions in `app/models/*.server.ts` — no classes, no ORM wrappers. Functions use the Prisma client directly.

- `thread.server.ts` — thread CRUD + `saveChat` (upserts last 2 messages), `searchThreads`, `updateThreadModel`, `deleteTrailingAssistantMessages`
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

### AI Chat Flow

1. Client sends messages via `useChat` (`@ai-sdk/react`) with `DefaultChatTransport` → `/api/chat`
2. Server validates session, applies rate limiting (20 req/min), streams via `agent.streamText()`
3. VoltAgent manages conversation memory (PostgreSQL-backed) and calls tools as needed
4. `UIMessage.parts` are serialized as JSON string in the `content` DB column
5. On completion, `saveChat()` upserts messages to the database

Agent tools are defined in `app/voltagent/tools/` (`create_note`, `list_notes`, `search_notes`, `render_card`, `get_weather`, `get_current_datetime`). The `render_card` tool demonstrates VoltAgent's tool-driven generative UI pattern -- the agent returns structured data and `CardToolPart` renders it as a rich visual card.

Per-thread model: `Thread.model` is set via a `set-model` intent in the `/chat` action and flows into the agent's dynamic model callback through the call `context` Map. Regeneration (`useChat().regenerate()`) sends `trigger: 'regenerate-message'`; the server deletes trailing assistant rows, clears VoltAgent conversation memory, and resends trimmed history.

### Rate Limiting

In-memory sliding window in `app/lib/rate-limit.server.ts`. Used for chat (20/min) and note creation (10/hour). Single-instance only — needs Redis for distributed setups.

### Environment Validation

`app/lib/env.server.ts` validates env with Zod at startup. Required **infra** vars (`DATABASE_URL`, `VOLTAGENT_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`) plus **feature** keys that degrade gracefully when unset (`ANTHROPIC_API_KEY` → chat disabled, `RESEND_API_KEY` → email to console, OAuth pairs → buttons hidden, `TRIGGER_SECRET_KEY` → jobs inline, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID` → billing stub) and `EMAIL_FROM`, `DISABLE_AUTH_RATE_LIMIT`, `E2E_TEST_HOOKS`. Import `env` from this module instead of reading `process.env` directly in server code.

**Boot behavior is environment-dependent:** in **production**, missing/invalid vars fail fast (`process.exit(1)`) so misconfigured prod never runs. In **dev/test**, the app always boots — missing infra vars are swapped for placeholders (a console warning lists them) and missing feature keys just disable their feature. What's unset surfaces in a **dev-only banner** at the top of every page (`EnvBanner`, fed by `envWarnings`/`shouldShowEnvBanner` from `env.server.ts` via the root loader). The banner never renders in production or during E2E runs (gated on `E2E_TEST_HOOKS`), so it can't affect end users or test/visual snapshots.

### Billing (Stripe stub)

`app/lib/billing.server.ts` wraps Stripe behind an interface the same way `email.server.ts` wraps Resend. Without `STRIPE_SECRET_KEY` it runs in **stub mode**: `createCheckoutSession`, `createBillingPortalSession`, and `constructWebhookEvent` return mocked results logged to the console, so dev and CI need no Stripe account. Wiring the real SDK is a localized edit confined to that file (install `stripe`, fill the `TODO` branches). Persisting customer/subscription state is left to the caller (add fields to the `User` model or a `Subscription` model and update them from the webhook handler).

### Deployment

Production runs the multi-stage `Dockerfile` (Node 20 Alpine runtime). The container CMD is `npm run start:migrate`, which applies pending Prisma migrations (`migrate deploy` — a no-op when current) before serving, so deploys self-migrate. `railway.json` configures the Railway build (Dockerfile) and start command, with `/healthcheck` as the health probe. CI (`.github/workflows/ci.yml`) has a `deploy` job that runs only on pushes to `main` after e2e passes; it deploys via the Railway CLI and no-ops unless a `RAILWAY_TOKEN` repo secret is set (set `RAILWAY_SERVICE` repo variable if the project has multiple services).

### Background Jobs

Trigger.dev v4 tasks live in `trigger/` (config in `trigger.config.ts`): `send-auth-email`, `generate-thread-title`, and the scheduled `purge-soft-deleted` (hard-deletes Threads/Notes soft-deleted 30+ days ago, daily). `app/lib/jobs.server.ts` is the only enqueue entry point: with `TRIGGER_SECRET_KEY` set it hands work to Trigger.dev, otherwise it runs the same shared functions inline (`app/lib/email-jobs.server.ts`, `app/lib/thread-title.server.ts`). Keep task files thin; put logic in those shared modules so the inline fallback and the worker never diverge. `bun run trigger:dev` / `bun run trigger:deploy`.

### Testing

**Unit tests** use Vitest (`bun run test`). Test files live alongside source files as `*.test.ts`. Modules that import server-side dependencies (auth, Prisma) need `vi.mock()` to avoid env validation side effects.

**E2E tests** use Playwright (`bun run test:e2e`) in `tests/`, covering auth, navigation, dashboard, notes, settings, password reset, theme switching, SEO endpoints, healthcheck, the chat flow, model selection/regeneration, agent tool rendering, chat error UX, the `/api/chat` API boundary, and cross-user thread access control. They run against a dedicated dev server on port `7778` (override with `E2E_PORT`) so they never collide with `bun run dev` on 5173; the `webServer` config also points `BETTER_AUTH_BASE_URL`/`VITE_BETTER_AUTH_BASE_URL` at that port and sets `DISABLE_AUTH_RATE_LIMIT=true`, `E2E_TEST_HOOKS=true` (enables `/api/test-mailbox` for reading reset links), plus a dummy `ANTHROPIC_API_KEY`.

Auth is explicit per test: the `authedPage` fixture in `tests/fixtures.ts` signs up a brand-new isolated user on demand (so every test starts with zero threads and parallel runs never share state), while a plain `page` stays logged out. `globalSetup` only ensures the seed users (Alice, Bob) exist for tests that log in as them. Fixtures also export `createAuthedContext` and `createThreadViaApi` for multi-user scenarios. Chat tests mock `/api/chat` with canned SSE responses (no AI service needed); tool-rendering tests stream `dynamic-tool` parts via helpers in `tests/chat-mock.ts`.

**Responsive guardrails** (`tests/responsive.spec.ts`, runs in the default e2e projects) assert key surfaces stay usable on small screens: no horizontal document overflow across routes at phone/tablet viewports, the mobile nav drawer completes navigation, the chat composer stays usable in the stacked phone layout, the admin table scrolls inside its container, and (chromium-only, via `isMobile`/`hasTouch` emulation) touch affordances like the delete-thread button are visible without hover. Touch-emulation tests must stay chromium-gated; Firefox does not support `isMobile`.

**Visual inventory** (`bun run test:visual`) captures a screenshot gallery of every major surface and state (~18 shots: landing/login, dashboard, notes, settings, chat, admin, with dark and mobile sampled on landing and dashboard). It lives in `tests/visual/`, runs only when `PW_VISUAL=1` enables the `visual` Playwright project (the default e2e projects ignore `tests/visual/`), and writes PNGs to `test-results/visual-inventory/` plus report attachments, so the Playwright HTML report doubles as a browsable gallery. CI runs it after e2e and uploads a `visual-inventory` artifact on every PR. Helpers in `tests/visual/helpers.ts` keep shots deterministic: `setTheme` pins the theme cookie via `/api/theme` (never leave the `system` default), `settle` waits for hydration + fonts + network idle, `createVisualContext` signs up a user with the fixed name "Visual Tester", and `snap` masks `<time>` elements (`FormattedDate` renders the current date) and disables animations. These are captures, not assertions; to add visual regression later, swap `snap()` for `expect(page).toHaveScreenshot()` and commit Linux-generated baselines.

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

- `app/context.ts` — `userContext` via React Router's `createContext<SessionUser | null>`
- `app/shared.ts` — shared className helpers (`listItemClassName`, `navLinkClassName`)
- `app/hooks.ts` — shared hooks: `useDialogState` (controlled Base UI Dialog/AlertDialog state: `open`/`onOpenChange`/`openDialog(target?)`/`close`/`target`, with derived reopen-on-error — no setState-in-effect), `usePendingIntent`, `useIsSubmitting`

### Shared UI building blocks

Reuse these instead of re-rolling the markup: the COSS primitives in `app/components/ui/` (Dialog/AlertDialog with `useDialogState`, Button, Badge, Alert, Menu, Sheet, Table), plus the app wrappers: `SearchForm` (GET ?q= form, filters as children), `PageHeader` (h1 + action/subtitle slots), `StatTile` (dashboard stats, `data-slot="stat"`), `Spinner`, `FormAlert` (error alert, accepts action-button children; also used by ErrorBoundaries), `ToolPartShell` + `isToolLoading`/`isToolDone` (chat tool-call chrome), `FormattedDate`, `EmptyState`, `Card`, `Pagination`, `ChatBubble`. Dialog composition: `DialogHeader` outside the `<Form className="contents">`, form wraps `DialogPanel` + `DialogFooter`; Cancel is `variant="ghost"`.

### Layout

`app/root.tsx` is chrome-agnostic: it renders only the HTML document (`Layout`), the auth `loader` (`isAuthenticated`), and a bare `<Outlet/>`. All page chrome lives in per-section layout routes under `app/routes/layouts/`, composed in `routes.ts` via `layout(...)`:

- `layouts/app.tsx` — locked app shell (`h-dvh` grid: header → internal-scroll `main` → footer). Wraps `/dashboard`, `/chat`, `/notes`, `/settings`. Use this shell for app surfaces that should fill the viewport and scroll internally.
- `layouts/marketing.tsx` — growable document (`min-h-dvh` flex column, footer at content's end). Wraps `/` (landing).
- `layouts/auth.tsx` — full-bleed, no header/footer. Wraps `/login`, `/forgot-password`, `/reset-password`.

Shared chrome is extracted into `SiteHeader` and `SiteFooter` (`app/components/`). `SiteHeader` reads auth state via `useRouteLoaderData<typeof rootLoader>('root')` rather than props, and owns the skip link, the labeled Site/Main navs, the theme toggle (Base UI Menu), and the mobile nav Sheet. Root renders the flash `Toaster` and drives dark mode by putting `class="dark"` on `<html>` from the theme cookie; `theme === 'system'` resolves via a pre-paint inline script reading `prefers-color-scheme` (with `suppressHydrationWarning` on `<html>`). Gotcha: an open Sheet/Dialog makes the rest of the page inert, so tests must assert on the popup, not the trigger.

**Definite height matters:** app/auth shells use `h-dvh` (a fixed height) so the `min-h-0` + `overflow-y-auto` chain can scroll children internally. `min-h-screen` is a minimum, not a definite height, and silently breaks internal scrolling once content exceeds the viewport.

### Formatting

Prettier with: 80 char width, 4-space indentation, single quotes, semicolons, tailwindcss plugin for class sorting. ESLint with typescript-eslint and react-hooks plugin.

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan

<!-- SPECKIT END -->
