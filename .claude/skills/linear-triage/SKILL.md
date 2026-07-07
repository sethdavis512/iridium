---
name: linear-triage
description: Verify Linear backlog tickets against the actual codebase before anyone implements them — extract each ticket's checkable claims, grep the code to confirm or refute, classify by scope, and leave an evidence-backed triage comment. Use when the user says "triage the backlog", "comb through Linear tasks", "verify these tickets", "/linear-triage", or on a schedule. Not for implementing fixes (use linear-to-pr on tickets triaged valid), and never changes ticket state beyond commenting unless explicitly told to.
---

# Linear backlog triage

Tickets lie. They arrive imported from other repos, describe work already
done, or reference code that never existed here. Triage separates
"implementable as written" from everything else — before implementation
time is spent. Triage never fixes anything.

## Workflow checklist

- [ ]   1. Fetch candidates
- [ ]   2. Skip already-triaged
- [ ]   3. Verify claims against the code
- [ ]   4. Classify
- [ ]   5. Comment with evidence
- [ ]   6. Report summary

## 1. Fetch candidates

List issues in the **Iridium** project (Linear MCP `list_issues`) and keep
`statusType` of `backlog` and `unstarted`. Ignore completed, canceled,
started, and archived.

## 2. Skip already-triaged

Fetch each candidate's comments (`list_comments`). Skip any issue that
already has a comment starting with `🔍 Triage:` — re-triaging burns tokens
and spams the thread. Re-triage only when the user explicitly asks.

## 3. Verify claims against the code

Extract every checkable claim from the title/description:

- **File paths and symbols** — do they exist? (`Grep`/`Glob`)
- **CSS classes, component names, agent names, env vars** — grep for them;
  a ticket about `safe-area-inset` in a repo with zero occurrences is not
  about this repo.
- **"X is broken / missing"** — read the referenced code; it may have been
  fixed since (check `git log --oneline -5 -- <file>` for recent changes).
- **Past-tense descriptions** ("Added…", "Fixed…") — usually describe work
  already completed, possibly in a different repo. Check whether the
  described end-state already exists here.

Prefer 2–3 cheap greps per ticket over deep reading. The question is "is
this ticket implementable as written in THIS repo", not "how would I fix it".

## 4. Classify

| Verdict              | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `valid-safe`         | Real, tightly scoped, verifiable without a rendered app or DB     |
| `valid-needs-render` | Real, but verification needs a running app / visual pass          |
| `valid-large`        | Real, but a migration, refactor >10 files, or a design decision   |
| `already-done`       | The described end-state already exists (cite where)               |
| `not-applicable`     | References code/features this repo doesn't have (likely imported) |
| `unclear`            | Can't extract a checkable claim — needs author input              |

## 5. Comment with evidence

Leave one comment per ticket, formatted:

```
🔍 Triage: <verdict>

<1–3 sentences of evidence with file:line references — what was checked
and what was found. For not-applicable: what was grepped and came up empty.
For already-done: where the end-state lives.>
```

Comment only. Do **not** change issue state, assignee, or labels unless the
user explicitly asked for state updates in this run.

## 6. Report summary

End with a table: identifier | verdict | one-line evidence. Recommend next
actions (e.g. "valid-safe tickets are ready for linear-to-pr; consider
canceling the not-applicable ones") — recommendations, not actions.

## Cost discipline

Triage is a recurring loop: keep it cheap. No rendered app, no DB, no fixes,
no deep architecture reading. If a ticket demands more than ~5 tool calls to
verify, classify it `unclear` and say what information is missing.
