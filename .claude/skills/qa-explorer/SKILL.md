---
name: qa-explorer
description: Explore the running Iridium app like a curious, destructive user and file GitHub issues for confirmed bugs. Picks an exploration charter (auth, notes, chat, settings, admin, mobile), drives the app with Playwright, reproduces every finding twice, dedupes against open qa-explorer issues, and files structured reports with repro scripts. Use when the user says "qa sweep", "explore the app for bugs", "run the qa explorer", "hunt for bugs", or "do some exploratory testing". Not for implementing fixes (use github-issue-to-pr on the filed issues), not for deterministic regression tests (those live in tests/), and never against production.
---

# QA Explorer

Explore the app the way scripted tests never do: follow hunches, abuse
inputs, do things out of order. File only what you can reproduce.

## Workflow checklist

- [ ] 1. Boot the QA environment
- [ ] 2. Pick charter(s)
- [ ] 3. Explore within budget
- [ ] 4. Reproduce every finding twice
- [ ] 5. Triage and dedupe
- [ ] 6. File issues
- [ ] 7. Clean up

## 1. Environment

Run against a local dev server on a dedicated port (default `7779`; pick
another if occupied). Never production, and not 7778, so a concurrent e2e
run cannot collide. Precondition: dev Postgres is up (`bun run docker:up`).

The scripted tier (below) needs no manual server: `E2E_PORT=7779` makes the
Playwright `webServer` config boot the app with the right env. For
interactive tools, start it yourself with the same env that
`playwright.config.ts` uses, in the background:

```sh
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-sk-ant-e2e-dummy-key} \
BETTER_AUTH_BASE_URL=http://localhost:7779 \
DISABLE_AUTH_RATE_LIMIT=true E2E_TEST_HOOKS=true \
bun run dev --port 7779
```

`BETTER_AUTH_BASE_URL` must match the port or sign-in is rejected.
`E2E_TEST_HOOKS` exposes `/api/test-mailbox` (read password-reset links) and
`/api/test-role` (promote a user to ADMIN).

Identity: a fresh user per charter via `POST /api/auth/sign-up/email` (the
mechanism in `tests/fixtures.ts` `createFreshUser`; `createFreshAdmin` for
the admin charter). The database is the shared dev DB: never act
destructively on the seeded Alice/Bob accounts.

## 2. Browser driving (tiered)

Default tier, works for every contributor: **throwaway Playwright specs**.
Write a scratch spec at `tests/qa-explorer.spec.ts` importing from
`./fixtures` (auth, hydration), `./chat-mock` (SSE control), and
`./visual/helpers` (theme, settle, viewports). Run it, read the output and
screenshots, rewrite, repeat:

```sh
E2E_PORT=7779 bunx playwright test tests/qa-explorer.spec.ts --project=chromium
```

This is the default on purpose: the reproduce-twice rule ends in a script
anyway, and chat streaming is only steerable through `tests/chat-mock.ts`
route interception, which interactive tools cannot do.

Accelerator tier, when the session has one: an interactive browser tool
(Playwright MCP server, agent-browser CLI) pointed at `localhost:7779` for
fast free-form scouting. Confirm findings by converting them to a scripted
repro before filing.

The scratch spec is never committed and is deleted at cleanup.

## 3. Charters

Pick the charter(s) the user asked for, or rotate to the least recently
explored. Stay inside the budget; note unexplored hunches in the session
summary instead of overrunning.

| Charter  | Goal                                                                                                                                                                                      | Entry          | Suspicious                                                                         | Budget   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- | -------- |
| AUTH     | Break sign-up/login/logout/reset: malformed emails, double submits, reused/expired reset links (read via `/api/test-mailbox`), back-button after logout                                   | `/login`       | 5xx, hung spinners, vague errors, session survives logout                          | 25 steps |
| NOTES    | CRUD + search edges: emoji/unicode, 10k-char content, `<script>` and markdown payloads, empty search, rapid create/delete, modal interplay                                                | `/notes`       | XSS rendering, lost input, stale lists after mutation, broken empty states         | 25 steps |
| CHAT     | Thread lifecycle, model switcher, streaming/tools via `chat-mock.ts`, Stop mid-stream, preset chips, deep links to foreign or missing thread ids (expect 403/404)                         | `/chat`        | unhandled stream errors, duplicate messages, composer stuck disabled, scroll jumps | 30 steps |
| SETTINGS | Profile/password/delete-account validation, theme persistence across reloads and routes                                                                                                   | `/settings`    | validation bypass, theme flash or mismatch                                         | 15 steps |
| ADMIN    | As a fresh admin: role change, ban/unban (500-char reasons), impersonate + stop, self-action guards, filter+search+pagination combos                                                      | `/admin`       | guard bypass, rows desyncing after fetcher actions, pagination off-by-one          | 25 steps |
| MOBILE   | Re-run each charter's key path at 390x844: drawer nav, chat sidebar + delete, notes modal, admin table, toasts. Explore beyond the deterministic guardrails in `tests/responsive.spec.ts` | `/` at 390x844 | horizontal overflow, unreachable or invisible controls, overlapping fixed elements | 30 steps |

Global rules for every charter:

- Attach listeners in scripted runs; any console error, page error, or 5xx
  response is automatically suspicious:

    ```ts
    page.on('console', (m) => m.type() === 'error' && log(m.text()));
    page.on('pageerror', (e) => log(e.message));
    page.on('response', (r) => r.status() >= 500 && log(r.url()));
    ```

- `waitForHydration(page)` before interacting; pre-hydration controls accept
  events but do nothing, which produces false "broken button" findings.
- Screenshot every suspicious moment immediately (`page.screenshot`), named
  `test-results/qa-explorer/<charter>-<symptom>.png`.

## 4. Reproduce before filing

A finding is filable only after it reproduces twice, and the second
reproduction must be a minimal scripted repro: fresh user, fresh data,
fewest possible steps. That script body goes in the issue verbatim; it is
exactly what `github-issue-to-pr` needs to verify a fix.

Cannot reproduce the second time: record it in the session summary as
flaky-unconfirmed, do not file.

## 5. Triage and dedupe

Severity:

- **S1**: security, data loss, auth/role guard bypass. File immediately,
  mid-session.
- **S2**: a feature is broken with no workaround.
- **S3**: broken edge case, or a control unreachable on touch/keyboard.
- **S4**: cosmetic.

Dedupe before filing each issue:

```sh
gh issue list --label qa-explorer --state open --json number,title,body
```

If an open issue covers the same root symptom, add the new evidence with
`gh issue comment` instead of filing a duplicate.

## 6. File issues

One-time, idempotent label:

```sh
gh label create qa-explorer \
    --description "Filed by the autonomous QA explorer" \
    --color D93F0B || true
```

Then per finding:

```sh
gh issue create --label qa-explorer \
    --title "[qa-explorer][S2] <surface>: <symptom>" --body "<body>"
```

Issue body template:

```markdown
## Summary

[One sentence: what breaks and for whom]

**Severity**: S2 | **Charter**: NOTES | **Commit**: <git rev-parse --short HEAD>
**Environment**: localhost:7779, chromium, 1280x720 (or 390x844)

## Repro steps

1. Sign up a fresh user
2. ...

## Expected vs actual

- Expected: ...
- Actual: ...

## Evidence

[Screenshots: embed via an image-hosting tool if the session has one;
otherwise list local paths and drag the files into the issue on GitHub.]

## Repro script

\`\`\`ts
// minimal Playwright repro, runnable as tests/qa-explorer.spec.ts
\`\`\`

## Console / network

[Errors captured by the listeners, if any]
```

## 7. Clean up

- Delete `tests/qa-explorer.spec.ts`.
- Kill the 7779 dev server if you started one.
- Commit nothing.
- Summarize: findings filed (with issue links), duplicates commented,
  flaky-unconfirmed, charters and hunches left unexplored.

## Gotchas

- The dummy `ANTHROPIC_API_KEY` means real `/api/chat` calls fail. That
  error path is worth exploring (Retry/Dismiss UX), but the failure itself
  is expected, not a bug. Use `tests/chat-mock.ts` for happy-path streaming.
- `DISABLE_AUTH_RATE_LIMIT=true` is on: anything that looks like a missing
  rate limit is an artifact of the QA environment, not a finding.
- Pre-hydration dead controls are not bugs; re-test after
  `waitForHydration`.
- Never run against production, never run `prisma migrate`/`db push`, never
  mutate Alice/Bob.
- Deterministic coverage already exists for mobile basics
  (`tests/responsive.spec.ts`) and surface states (`tests/visual/`); do not
  re-file what those already guard, hunt past them.

## Future follow-ups (out of scope)

- Scheduled nightly sweeps (cron or CI).
- Auto-PRing S3 fixes via github-issue-to-pr without a human in the loop.
