---
name: linear-to-pr
description: Drive a Linear issue to an open GitHub pull request. Fetches the issue, branches using Linear's suggested branch name, implements the change, runs validation plus targeted Playwright e2e tests, captures screenshots of UI changes and links them from the PR body, opens the PR with gh, and moves the issue to a review status. Use when the user says "work on ABC-123" (any Linear issue identifier), "take this Linear issue to a PR", "implement this ticket", "linear to pr", or pastes a linear.app issue URL to be implemented. Not for creating or triaging Linear issues, and not for reviewing or merging existing PRs.
---

# Linear to PR

Take a Linear issue to an open, reviewable pull request on this repo.

## Workflow checklist

Work through every step. Skip a step only when its "when" condition does not
apply, and say so in the final summary.

- [ ] 1. Load Linear tools and fetch the issue
- [ ] 2. Mark In Progress and create the branch
- [ ] 3. Implement
- [ ] 4. Validate (typecheck, unit, targeted e2e)
- [ ] 5. Capture visual documentation (when UI changed)
- [ ] 6. Commit, push, open the PR
- [ ] 7. Update the Linear issue (review status + comment)

## 1. Fetch the issue

Linear access comes from whatever Linear MCP server is connected to the
session. Tool names vary by setup (`mcp__linear__*`, `mcp__claude_ai_Linear__*`,
etc.), and the tools may be deferred. Find them first:

ToolSearch query: `linear issue` (then load `get_issue`, `save_issue`,
`save_comment`, `list_comments`, `list_issue_statuses` or their equivalents).

If no Linear tools are available, say so and ask the user to paste the issue
title and description; skip the Linear status updates (steps 2.1 and 7) and
do everything else.

Then:

1. Fetch the issue by identifier (e.g. `ABC-123`). Accept a pasted
   `linear.app/...` URL; the identifier is in the path.
2. Fetch its comments. Comments often carry decisions and constraints that
   the description lacks.
3. If the issue description is empty or too vague to act on, stop and ask
   the user for scope before writing code.

## 2. Start work

1. List the team's issue statuses and move the issue to the `started`-type
   status that represents active work (typically named "In Progress").
   Assign it to `me` if unassigned.
2. Branch from fresh main using the issue's `gitBranchName` field verbatim
   (Linear generates it from the user and issue title):

    ```sh
    git checkout main && git pull && git checkout -b <gitBranchName>
    ```

    Linear's GitHub integration links the branch to the issue automatically
    because the branch name contains the identifier. Do not invent your own
    branch name. If `gitBranchName` is missing, use
    `<identifier-lowercased>-<kebab-title>`.

## 3. Implement

Follow the repo's CLAUDE.md conventions (routing in `app/routes.ts`, model
layer in `app/models/*.server.ts`, DaisyUI components, `~/` imports). Keep
the diff scoped to the issue; unrelated cleanup goes in a separate commit or
gets mentioned, not mixed in.

## 4. Validate

Run, fix, and re-run until green:

```sh
bun run validate        # typecheck + lint + format:check
bun run test            # Vitest unit tests
bunx playwright test tests/<area>.spec.ts --project=chromium
```

Pick the e2e spec(s) covering the touched surface (e.g. `notes.spec.ts` for
notes work). If the change adds user-visible behavior with no existing e2e
coverage, add or extend a spec in `tests/`; Playwright coverage is part of
done, not optional. Run the full `bun run test:e2e` only when the change is
cross-cutting (layout, auth, routing).

## 5. Visual documentation

When the change affects anything user-visible, capture screenshots and get
them in front of reviewers. Skip only for pure server/infra changes, and say
"No UI changes" in the PR body instead.

1. Surface covered by the visual inventory (`tests/visual/inventory.spec.ts`
   walks landing, login, dashboard, notes, settings, chat, admin): run it
   and use its output as the PR images. No ad-hoc spec needed.

    ```sh
    bun run test:visual                          # full gallery
    bun run test:visual -- --grep "notes"        # just the touched surface
    ```

    PNGs land in `test-results/visual-inventory/`.

2. Surface not covered (new page, transient state): write a temporary spec
   at `tests/pr-visuals.spec.ts` reusing the inventory helpers so shots are
   themed, hydrated, and date-masked the same way:

    ```ts
    import { test } from './fixtures';
    import { setTheme, settle, snap } from './visual/helpers';

    test('pr visuals', async ({ authedPage: page }, testInfo) => {
        await setTheme(page.context(), 'light');
        await page.goto('/new-surface');
        await settle(page);
        await snap(page, testInfo, 'new-surface');
        // ...one snap per changed surface/state
    });
    ```

    Run it: `bunx playwright test tests/pr-visuals.spec.ts --project=chromium`

    Capture each meaningful state, not just the happy path: empty state,
    filled state, error state, and mobile where relevant
    (`page.setViewportSize({ width: 390, height: 844 })`). If the new
    surface is durable, add a row to `tests/visual/inventory.spec.ts`
    instead of using a temp spec; that row is part of the PR.

3. Publish the images using whatever the session provides, in this order:
    1. An image-hosting skill or tool available in the session (CDN
       uploader, asset bucket); embed the returned URLs in the PR body.
    2. The Linear MCP attachment-upload tools; attach the images to the
       issue and link them from the PR body.
    3. Neither available: list the local screenshot paths in the PR body and
       tell the author to drag the images into the PR description on GitHub,
       which hosts them.
4. Delete `tests/pr-visuals.spec.ts` before committing (a new inventory row
   stays, a temp spec never lands). Screenshots live in `test-results/`,
   which is gitignored; never commit images.

## 6. Open the PR

1. Commit with a conventional message (`feat:`, `fix:`, `chore:`) and the
   identifier in the body, e.g. `feat: bulk-archive notes (ABC-123)`.
2. Push and create the PR:

    ```sh
    git push -u origin <branch>
    gh pr create --title "<type>: <summary> (ABC-123)" --body "<body>"
    ```

3. PR body template:

    ```markdown
    ## Summary

    [What changed and why, 2-4 bullets]

    Fixes ABC-123

    ## Visuals

    ![<surface> - <state>](image-url)

    ## Testing

    - `bun run validate`
    - `bun run test`
    - `bunx playwright test tests/<area>.spec.ts --project=chromium`
    ```

    `Fixes ABC-123` is a Linear magic word: with the GitHub integration
    enabled, the issue auto-completes when the PR merges. Always include it.

## 7. Close the loop in Linear

1. Move the issue to the status that represents "in review" in this team's
   workflow (a `started`-type status named like "In Review"). If the team
   has no such status, leave the status alone.
2. Comment on the issue: PR URL, one-line summary of the approach, and the
   screenshot links.

## Gotchas

- MCP tools may be deferred and fail with InputValidationError until loaded
  via ToolSearch. Find and load the Linear tools before the first call.
- Status names vary by team. Resolve them with `list_issue_statuses` and
  match on status `type` (`started`, `completed`) plus name, rather than
  assuming names exist. Never move the issue straight to Done; merging the
  PR does that via the magic word.
- E2E runs its own server on port 7778, so `bun run dev` on 5173 can stay
  up. Chat e2e tests mock `/api/chat`; no real ANTHROPIC_API_KEY traffic.
- React controls do nothing before hydration. Always `waitForHydration(page)`
  before clicking or filling in the visuals spec.
- The `authedPage` fixture signs up a brand-new user with zero data. To
  screenshot populated states, create the data through the UI or API first;
  to screenshot seeded users, log in as Alice via `loginViaUI`.
- Never run `prisma migrate` or `db push` as part of this flow without
  asking first.
