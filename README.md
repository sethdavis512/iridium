# Iridium

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Router](https://img.shields.io/badge/React_Router-7.9-red?logo=reactrouter&logoColor=white)](https://reactrouter.com/)
[![React](https://img.shields.io/badge/React-19.1-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**From idea to launch in a weekend.** Iridium is a production-ready React Router 7 starter with auth, AI chat, email, and a clean UI system already working. Skip months of setup and ship what makes your product different.

## Instant deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/?referralCode=YZe1VE)

## What you get

- **React Router 7 + React 19** with config-based routing and native meta tags
- **Authentication**: BetterAuth (email/password + GitHub/Google OAuth) with Prisma + sessions
- **Dashboard + chat**: Threaded chat UI wired to Vercel AI SDK (OpenAI, Anthropic, or Google)
- **Transactional email**: Resend integration with React Email templates
- **UI system**: DaisyUI 5 + Tailwind CSS v4 + CVA-based components
- **Docs & patterns**: Instruction guides for routing, validation, components, auth, and CRUD
- **Testing ready**: Vitest unit tests and Playwright e2e examples

## Quick start

```bash
git clone https://github.com/tech-with-seth/iridium.git
cd iridium
npm install        # auto-generates Prisma client
npm run setup      # guided wizard: writes .env, runs migrations, seeds db
npm run dev        # http://localhost:5173
# Test login: admin@iridium.com / Admin123!
```

## App overview

- **Public**: Landing, success page
- **Protected**: Dashboard + threads, AI chat, design system demo, forms demo
- **API**: BetterAuth handler, sign-out endpoint, chat, email, interest list, health check

Routes live in `app/routes.ts` (config-based, not file-system routing). Run `npm run typecheck` after route edits to regenerate types.

## Architecture (lightweight)

- **Routing**: Config in `app/routes.ts`; React 19 meta elements in components
- **Auth**: BetterAuth + Prisma, session helpers in `app/lib/session.server.ts`
- **Data**: Model-layer helpers in `app/models/` — never call Prisma directly in routes
- **UI**: CVA + DaisyUI components in `app/components/` with `cx` from `app/cva.config.ts`
- **Validation**: Zod schemas in `app/lib/validations.ts`; shared server/client pattern
- **AI**: Provider-agnostic via `AI_PROVIDER` + `AI_MODEL` env vars; defaults to OpenAI `gpt-4o-mini`

Custom Prisma client lives at `app/generated/prisma` (import from `~/generated/prisma/client`).

## Environment

Required

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` (32+ chars — `npm run setup` generates this)
- `BETTER_AUTH_URL` (e.g., `http://localhost:5173`)
- `VITE_BETTER_AUTH_BASE_URL` (same as `BETTER_AUTH_URL`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

Optional

- `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY` (AI chat demo)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME` (file storage)
- `DEFAULT_THEME`, `ADMIN_EMAIL`

See `.env.example` for the full annotated list.

## Commands

- `npm run setup` — **start here**: guided setup wizard
- `npm run dev` — start dev server
- `npm run typecheck` — generate route types and run TS checks
- `npm run build` — production build
- `npm run test` — Vitest unit tests
- `npm run e2e` — Playwright suite
- `npm run validate:env` — validate env vars (use `--railway` for Railway check)
- `npm run predeploy` — validate env → typecheck → build → test
- `npm run deploy` — one-command Railway deploy

## Project structure (trimmed)

```text
app/
  routes.ts           # Config-based routing
  routes/             # Route modules (landing, dashboard, chat, design, forms)
  components/         # CVA + DaisyUI components
  lib/                # Auth, AI, validation, Resend
  models/             # Server-side data helpers
  middleware/         # Auth/context/logging middleware
  generated/prisma/   # Prisma client (custom output)
prisma/               # Schema, migrations, seed
scripts/              # setup.ts, validate-env.ts
```

## Contributing

- Keep changes aligned with the smaller starter scope
- Prefer the model layer for data access when available
- Follow the CVA + DaisyUI component pattern
- Run `npm run typecheck` before opening a PR

## License

MIT License
