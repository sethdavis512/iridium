# Drift Detection Report — iridium — 2026-07-09

## Summary

- Scope: discovered rule files only (3 files)
- Path drift: 3 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 3 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, **fixtures**, **snapshots**, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Path Drift

**File:** CLAUDE.md:196
**Detail:** Path reference not found: `layouts/app.tsx` (checked: `layouts/app.tsx`)

### 🔴 High — Path Drift

**File:** CLAUDE.md:197
**Detail:** Path reference not found: `layouts/marketing.tsx` (checked: `layouts/marketing.tsx`)

### 🔴 High — Path Drift

**File:** CLAUDE.md:198
**Detail:** Path reference not found: `layouts/auth.tsx` (checked: `layouts/auth.tsx`)

### 🟡 Medium — Date Drift

**File:** .github/copilot-instructions.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift

**File:** CLAUDE.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift

**File:** scripts/ralph/CLAUDE.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

## Notes (Non-Drift References)

- CLAUDE.md:74 — Import-like reference `@ai-sdk/react` looks external; not treated as local path drift
- CLAUDE.md:85 — Import-like reference `@react-router/dev/routes` looks external; not treated as local path drift
- CLAUDE.md:116 — Import-like reference `/api/chat` looks external; not treated as local path drift
- CLAUDE.md:152 — Import-like reference `/api/test-mailbox` looks external; not treated as local path drift
- CLAUDE.md:158 — Import-like reference `/api/theme` looks external; not treated as local path drift
- .github/copilot-instructions.md:10 — Import-like reference `@ai-sdk/react` looks external; not treated as local path drift
- .github/copilot-instructions.md:10 — Import-like reference `anthropic/claude-3-haiku-20240307` looks external; not treated as local path drift
- .github/copilot-instructions.md:49 — Import-like reference `@react-router/dev/routes` looks external; not treated as local path drift
- .github/copilot-instructions.md:76 — Import-like reference `/api/chat` looks external; not treated as local path drift
