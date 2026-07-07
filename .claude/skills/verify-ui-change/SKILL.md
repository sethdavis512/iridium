---
name: verify-ui-change
description: Verify any UI-affecting change end-to-end before declaring it done — boot the app, interact with the change via Playwright, capture before/after screenshots (light/dark, desktop/phone), check console errors, and attach the evidence. Use after implementing or reviewing any change to components, routes with visible output, layouts, styling, or theming. Triggers include "verify this UI change", "did the banner/button/layout change work", or finishing any *.tsx edit that alters rendered markup or classes. Not for server-only changes (models, API routes, env plumbing), docs, or pure test edits.
---

# Verifying UI changes

Never report a UI change as complete based on a successful edit alone. A
compiling component is not a working component. Verify the way a human
reviewer would, then hand back evidence, not claims.

## Workflow checklist

- [ ]   1. Capture "before" (only when changing existing UI)
- [ ]   2. Boot the app
- [ ]   3. Interact with the change
- [ ]   4. Screenshot the matrix (light/dark × desktop/phone)
- [ ]   5. Zero console errors
- [ ]   6. Run the guardrail tests
- [ ]   7. Hand back the evidence

## 1. Before shots

When modifying existing UI, capture the current state first (`git stash` the
change or check out the base ref, screenshot, restore). Skip for brand-new
surfaces — there is no "before".

## 2. Environment

Boot on a dedicated port (default `7780` — never 5173, 7778, or 7779, so dev,
e2e, and qa-explorer runs can't collide). Same env recipe as
`playwright.config.ts` / the qa-explorer skill:

```sh
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-sk-ant-e2e-dummy-key} \
BETTER_AUTH_BASE_URL=http://localhost:7780 \
VITE_BETTER_AUTH_BASE_URL=http://localhost:7780 \
DISABLE_AUTH_RATE_LIMIT=true E2E_TEST_HOOKS=true \
bun run dev --port 7780
```

Precondition: `bun run docker:up`. Both `BETTER_AUTH` URLs must match the
port or sign-in silently hangs. `E2E_TEST_HOOKS=true` also suppresses the dev
env banner so it can't contaminate screenshots of other surfaces (unless the
banner itself is what you're verifying — then drop that var).

## 3. Interact, don't just render

Write a throwaway spec at `tests/verify-ui.spec.ts` importing from
`./fixtures` (auth, `waitForHydration`), `./chat-mock` (canned AI replies),
and `./visual/helpers` (`setTheme`, `settle`, `snap`). Exercise the change
directly: click the new control, submit the form, open the dialog — and
assert the expected state change, not just visibility.

```sh
E2E_PORT=7780 bunx playwright test tests/verify-ui.spec.ts --project=chromium
```

Delete the throwaway spec afterwards.

## 4. Screenshot matrix

For each state the change introduces, capture with `snap()` (it masks
`<time>` elements and disables animations):

- Light and dark (`setTheme` — never leave the `system` default)
- Desktop (1280×720) and phone (390×844) viewports

Four shots minimum for a static change; add one per interactive state
(hover/expanded/error) that matters.

## 5. Console check

Fail the verification on any new console error or warning. In the throwaway
spec, collect `page.on('console')` / `page.on('pageerror')` and assert empty.

## 6. Guardrail tests

- Run the e2e spec covering the touched surface
  (`bunx playwright test tests/<surface>.spec.ts --project=chromium`).
- If the surface is in the visual inventory, run `bun run test:visual` and
  eyeball the affected shots.
- If the change adds a durable new surface or state, add a row to
  `tests/visual/inventory.spec.ts` (per CLAUDE.md) as part of the change.
- Touch nav/layout? Also run `tests/responsive.spec.ts`.

## 7. Hand back evidence

Attach or link the before/after screenshots in your report (send them to the
user, or embed in the PR body). State what you verified and what you did not
(e.g. "not verified in webkit"). If any step failed, fix and rerun from
step 2 — do not hand back partially verified work.
