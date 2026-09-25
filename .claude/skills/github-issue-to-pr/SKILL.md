---
name: github-issue-to-pr
description: Drive a GitHub issue to an open pull request. Fetches the issue with gh, self-assigns, creates a linked branch via gh issue develop, implements the change, runs validation plus targeted Playwright e2e tests, captures screenshots of UI changes and links them from the PR body, and opens the PR with a closing "Fixes #" reference. Use when the user says "work on issue #123", "fix #123", "take this GitHub issue to a PR", "issue to pr", or pastes a github.com issue URL to be implemented. Not for Linear issues (use linear-to-pr), not for creating or triaging issues, and not for reviewing or merging existing PRs.
---

# GitHub Issue to PR

Take a GitHub issue on this repo to an open, reviewable pull request.

## Workflow checklist

Work through every step. Skip a step only when its "when" condition does not
apply, and say so in the final summary.

- [ ] 1. Fetch the issue
- [ ] 2. Self-assign and create the linked branch
- [ ] 3. Implement
- [ ] 4. Validate (typecheck, unit, targeted e2e)
- [ ] 5. Capture visual documentation (when UI changed)
- [ ] 6. Commit, push, open the PR

## 1. Fetch the issue

Use the `gh` CLI (it works for every contributor; no MCP server required):

```sh
gh issue view <number> --json number,title,body,labels,assignees,url,comments
```

Accept a pasted `github.com/<owner>/<repo>/issues/<number>` URL; the number
is in the path. For cross-repo URLs, pass `--repo <owner>/<repo>`.

Read the comments, not just the body. They often carry decisions and
constraints the description lacks. If the issue is empty or too vague to act
on, stop and ask the user for scope before writing code.

## 2. Start work

1. Self-assign so the issue shows as taken:

    ```sh
    gh issue edit <number> --add-assignee @me
    ```

2. Create a branch linked to the issue and check it out:

    ```sh
    git checkout main && git pull
    gh issue develop <number> --base main --checkout
    ```

    `gh issue develop` generates a branch name from the issue title and
    registers it as a GitHub "linked branch", so the issue shows development
    activity immediately. If the command is unavailable (very old gh), fall
    back to `git checkout -b <number>-<kebab-title>`.

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
    2. Neither available: list the local screenshot paths in the PR body and
       tell the author to drag the images into the PR description on GitHub,
       which hosts them.
4. Delete `tests/pr-visuals.spec.ts` before committing (a new inventory row
   stays, a temp spec never lands). Screenshots live in `test-results/`,
   which is gitignored; never commit images.

## 6. Open the PR

1. Commit with a conventional message (`feat:`, `fix:`, `chore:`),
   e.g. `feat: bulk-archive notes (#123)`.
2. Push and create the PR:

    ```sh
    git push -u origin <branch>
    gh pr create --title "<type>: <summary> (#123)" --body "<body>"
    ```

3. PR body template:

    ```markdown
    ## Summary

    [What changed and why, 2-4 bullets]

    Fixes #123

    ## Visuals

    ![<surface> - <state>](image-url)

    ## Testing

    - `bun run validate`
    - `bun run test`
    - `bunx playwright test tests/<area>.spec.ts --project=chromium`
    ```

    `Fixes #123` is a GitHub closing keyword: the issue auto-closes when the
    PR merges and the PR appears on the issue immediately. Always include it.
    No separate issue comment is needed; the linkage is the notification.

## Gotchas

- `Fixes #123` must be in the PR body or title, not only in commit messages,
  for the issue to auto-close on a squash merge.
- E2E runs its own server on port 7778, so `bun run dev` on 5173 can stay
  up. Chat e2e tests mock `/api/chat`; no real ANTHROPIC_API_KEY traffic.
- React controls do nothing before hydration. Always `waitForHydration(page)`
  before clicking or filling in the visuals spec.
- The `authedPage` fixture signs up a brand-new user with zero data. To
  screenshot populated states, create the data through the UI or API first;
  to screenshot seeded users, log in as Alice via `loginViaUI`.
- Never run `prisma migrate` or `db push` as part of this flow without
  asking first.
