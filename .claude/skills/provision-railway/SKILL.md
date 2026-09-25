---
name: provision-railway
description: Stand up production infrastructure on Railway for a copy of this Iridium template: a new Railway project, the app service built from the Dockerfile, both Postgres databases, a domain, secrets, Wait for CI, then a first healthy deploy. Driven by `bun run provision` and the Infrastructure as Code files in .railway/. Use when the user says "deploy this to Railway for the first time", "set up Railway", "provision production", "create the Railway project", "stand up the infrastructure", or has a fresh copy of the template with no Railway project. Also use when changing this project's Railway infrastructure (services, databases, build/deploy settings, variables wiring) through .railway/railway.ts. NOT for shipping code changes to an already provisioned app (merge to main; Railway deploys after CI) and never a reason to run `railway up` against production.
---

# Provision Railway

A copy of this template starts with no Railway project, no databases, and no
secrets. `bun run provision` ([tools/provision.ts](../../../tools/provision.ts))
creates all of it from [.railway/railway.ts](../../../.railway/railway.ts), the
Infrastructure as Code (IaC) definition shared by every copy, plus
[.railway/app.json](../../../.railway/app.json), which holds the per-project
values (project and service names, GitHub repo and branch, pinned database
images).

## Before running

Check each item; stop and tell the user if one fails:

1. `railway --version` works and `railway whoami` shows the right account. If
   `railway config --help` errors, the CLI is too old: `railway upgrade`.
2. The copy is on GitHub and `origin` points at it (`git remote get-url
origin`). Railway deploys from GitHub, so unpushed commits are not deployed.
3. The Railway GitHub app can see the repo (github.com/apps/railway-app).
   Without it, `railway config apply` fails when connecting the source.
4. CI passes on the branch head. The service is created with Wait for CI
   (`checkSuites: true`), so a failing workflow means Railway skips the deploy.
5. `.railway/app.json` still describes the project it was copied from. The
   script refuses to run when `app.json.repo` already equals this repo, because
   that checkout is already provisioned.

Creating the project is billable. Get the user's go-ahead before running it for
real, and show them `bun run provision --dry-run` output first when unsure.

## Run

Interactive (prompts for project name, workspace, optional Anthropic and
Resend keys):

```bash
bun run provision
```

Agent or CI use. Optional keys come from `PROVISION_`-prefixed env vars so a
local `.env` is never pushed to production:

```bash
PROVISION_ANTHROPIC_API_KEY=... bun run provision --non-interactive --name my-app --workspace <id>
```

Flags: `--dry-run`, `--name`, `--workspace`, `--service` (default `web`),
`--branch` (default: origin's default branch), `--no-wait`, `--force`.

What it does, in order: writes `.railway/app.json` → `railway init` (creates
and links the project) → `railway config apply --yes` (service, both
databases, Dockerfile builder, `/healthcheck`, pre-deploy
`prisma migrate deploy`, restart policy, Wait for CI) → `railway domain` →
sets `BETTER_AUTH_SECRET` (generated) and `BETTER_AUTH_BASE_URL` plus any
optional keys on stdin → `railway redeploy --from-source` → polls
`/healthcheck` for up to 20 minutes. The first deploy that `apply` triggers
has no secrets yet and fails. That's expected: the redeploy replaces it.

## Verify

- `curl -fsS https://<domain>/healthcheck` returns `{"status":"ok"}`.
- `railway service status --all` shows the service and both databases.
- `railway config plan` reports no pending changes.
- Commit `.railway/app.json`; later plans target the project named there.

If it isn't healthy: `railway logs --service <svc> --build --lines 100` for
build failures, `railway logs --service <svc> --lines 100` for runtime or
migration failures. Always pass `--lines`; without it `railway logs` streams
forever. A missing deploy with CI red on the commit is Wait for CI working as
intended.

## After provisioning (tell the user)

- **Custom domain:** `railway domain app.example.com --service <svc>`, add
  the DNS records it prints, then set `BETTER_AUTH_BASE_URL` to the custom
  origin. Any other origin that serves the app goes in
  `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated).
- **Email:** without `RESEND_API_KEY`, password-reset and verification emails
  are only logged. `EMAIL_FROM` must use a Resend-verified domain.
- **OAuth:** callbacks are `<base URL>/api/auth/callback/github` and
  `/callback/google`; set the client ID/secret pairs.
- **Background jobs:** the soft-delete purge only runs on Trigger.dev. Set
  `TRIGGER_SECRET_KEY` and deploy the tasks (`bun run trigger:deploy`).
- **First admin:** set `ADMIN_EMAILS` (comma-separated) to the owner's
  address with `railway variable set ADMIN_EMAILS --stdin --service <svc>`,
  and set `RESEND_API_KEY` so the verification email arrives. The owner signs
  up, clicks the verification link, then signs in again: a listed address is
  promoted to ADMIN only once verified, never at sign-up. If sign-up says the
  address already exists, someone else registered it first: don't click any
  verification email for it; delete that user in the database, then sign up.
  Never run `bun run db:seed` against production: it creates known-password
  demo accounts, including an admin, and refuses non-local databases unless
  forced.

## Changing infrastructure later

Edit `.railway/railway.ts` (or `app.json`), then:

```bash
railway config plan      # read the whole plan
railway config apply     # interactive confirm
```

- **A missing resource or variable gets deleted:** if the file omits a
  service, database, or variable, apply deletes it. Declare new variables as
  `preserve()` when the value is set outside the file.
- **Keep `source` in the file:** removing `source` disconnects the GitHub
  repo, and autodeploys stop.
- **Pin existing database images:** keep the `postgresImage` /
  `voltagentPostgresImage` pins for databases that already hold data. An
  unpinned `postgres()` plans a switch to `postgres:18`, which breaks a
  database created on an older major version.
- **Destructive changes need a person:** never pass `--confirm-destructive`
  unless the user approved the specific destructive lines in the plan.
- **Project guard:** the file throws when `app.json.project` doesn't match
  the linked project, so one project's config can't be applied to another.

## Guardrails

- Never run `railway up` against a provisioned environment: it uploads the
  local working tree, uncommitted changes included, and skips GitHub and CI.
- Set secrets with `railway variable set KEY --stdin --service <svc>`, never
  as `KEY=value` arguments (they land in shell history and process lists).
- Don't copy values from the local `.env` to Railway; local keys are dev keys.
