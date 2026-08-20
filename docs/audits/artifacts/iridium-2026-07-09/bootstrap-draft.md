# Bootstrap Draft — iridium

\*Generated: 2026-07-09 · Project: /Users/seth/repositories/iridium · Status: **DRAFT — requires human review before adoption\***

> ⚠️ **This file is advisory only.** Do not paste these rules directly into AGENTS.md without reviewing each one.
> Each rule is grounded in a detected stack signal — but only you know which failure modes are actually relevant to your project.

---

## Detected Stack

- Runtime: Bun
- Package manager: bun
- Framework: vite 7
- UI: react
- Styling: tailwind
- ORM: prisma
- Validation: zod
- Testing: vitest
- TypeScript: present (strict, path aliases)
- Config files detected: .env.example, prisma/schema.prisma, vite.config.ts, vitest.config.ts, playwright.config.ts, eslint.config.js +1 more
- Directory patterns: app/ (root), tests/, scripts/, prisma/, public/

---

## Suggested AGENTS.md Additions (7 rules)

Copy the rules you want to adopt into the appropriate section of `AGENTS.md`. Validate each one against your project's actual behavior before committing.

### Rule: Use bun — not npm or yarn

_Signal: `packageManager:bun` · Tier: alwaysApply_

**Why (failure mode):**
Running `npm install` or `yarn add` in a bun project creates or modifies the wrong lockfile (`package-lock.json` or `yarn.lock` instead of `bun.lockb`). This silently breaks reproducibility — the next `bun install` may resolve different package versions.

**The rule:**
This project uses bun. Always use bun commands for package management and script execution:

- Install: `bun install`
- Add package: `bun add <package>`
- Remove: `bun remove <package>`
- Run script: `bun run <script>`

Never use `npm`, `npx` (prefer `bunx`), or `yarn` in this project.

---

### Rule: Schema changes require a migration — never edit the database directly

_Signal: `orm:prisma` · Tier: glob · Glob: `prisma/`_

**Why (failure mode):**
Editing the Prisma schema without running `prisma migrate dev` leaves the database out of sync with the schema. The app works locally (if you manually altered the DB) but fails in CI and production where the migration hasn't been applied. This is one of the most common causes of "works on my machine" database bugs.

**The rule:**
All schema changes go through the migration workflow:

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>` (or the project's equivalent npm script)
3. Commit both the schema change AND the generated migration file together

Never use `prisma db push` for production or CI environments — it bypasses the migration history. Reserve `db push` for local prototyping only, and always follow up with a proper migration before committing.

```
# proper migration workflow
npx prisma migrate dev --name add_user_roles
```

```
# skips migration history
npx prisma db push  # in production/CI
```

_See also: prisma/schema.prisma_

---

### Rule: useEffect dependencies must be explicit and correct

_Signal: `ui:react` · Tier: glob_

**Why (failure mode):**
Stale closures in useEffect are a primary source of subtle bugs: effects read outdated state, event handlers fire on unmounted components, and infinite re-render loops are triggered by missing or incorrect deps arrays. ESLint's `exhaustive-deps` rule catches many of these but not all.

**The rule:**
Always provide a complete, accurate dependency array for `useEffect`, `useMemo`, and `useCallback`. Never suppress the exhaustive-deps ESLint warning with a comment — fix the underlying issue instead.

If the deps array feels wrong (too many deps, unstable references), the abstraction is wrong. Extract the logic into a custom hook or useMemo.

No effects with missing deps arrays (bare `useEffect(() => { ... })` that should only run once — use `[]` explicitly and comment why).

```
// explicit empty array + comment
useEffect(() => {
  fetchData(); // intentionally runs once on mount
}, []); // deps: empty — runs once
```

```
// missing deps causes stale closure
useEffect(() => {
  setResult(computeWith(value)); // value is stale
}); // missing deps array → runs every render
```

---

### Rule: Use Tailwind utilities — no inline styles or raw CSS for layout

_Signal: `styling:tailwind` · Tier: glob_

**Why (failure mode):**
Inline styles and CSS-in-JS bypass Tailwind's design system. They create one-off values that don't respond to the theme, can't be overridden by Tailwind's responsive/state variants, and accumulate into inconsistent UI. Over time, they become unmaintainable.

**The rule:**
Use Tailwind utility classes for all styling. If a utility doesn't exist for your use case, extend the Tailwind theme (`tailwind.config.ts`) — don't add a one-off inline style or custom CSS.

Inline styles (`style={{ ... }}`) are only acceptable for dynamic values that cannot be expressed as Tailwind classes (e.g., truly dynamic pixel values computed at runtime).

```
// extend the theme
// tailwind.config.ts
theme: { extend: { spacing: { '18': '4.5rem' } } }
// then in component:
<div className="mt-18">
```

```
// one-off inline style
<div style={{ marginTop: '72px' }}>
```

---

### Rule: No `any` — use `unknown` and narrow explicitly

_Signal: `typescript.strict` · Tier: alwaysApply_

**Why (failure mode):**
`any` is contagious. Once introduced, it disables type checking for every value it touches and spreads through calling code. Type errors that would have been caught at compile time surface as runtime crashes — often in production.

**The rule:**
Do not use `any`. If a type is genuinely unknown at authorship time, use `unknown` and narrow it with a type guard or assertion before use.

Unsafe casts (`as SomeType` without narrowing) are also forbidden — they are `any` with extra steps.

```
// unknown + narrowing
function parseResponse(raw: unknown): User {
  if (!isUser(raw)) throw new Error("Invalid user shape");
  return raw;
}
```

```
// any bypasses all checking
function parseResponse(raw: any): User {
  return raw; // crashes at runtime if shape is wrong
}
```

_See also: tsconfig.json strict: true_

---

### Rule: Test observable behavior — not internal implementation (Vitest)

_Signal: `testing:vitest` · Tier: glob_

**Why (failure mode):**
Tests that assert on mocks, internal function calls, or private state break on every refactor even when behavior is correct. They slow refactoring without catching real bugs — the opposite of what tests are for.

**The rule:**
Test what the function/component does from the outside — its outputs and side effects — not how it does it internally. Prefer few, high-value assertions over many fine-grained mock verifications.

When you find yourself asserting `expect(mockFn).toHaveBeenCalledWith(...)` more than asserting on outputs, reconsider the test design.

```
// assert on the output
const result = formatCurrency(1234.5, 'USD');
expect(result).toBe('$1,234.50');
```

```
// assert on internal calls
expect(mockIntlNumberFormat).toHaveBeenCalledWith('en-US', { style: 'currency', currency: 'USD' });
```

---

### Rule: Validate all external inputs with Zod before use

_Signal: `validation:zod` · Tier: glob_

**Why (failure mode):**
Unvalidated API inputs that reach business logic or the database cause runtime crashes, data corruption, and security vulnerabilities. The shape of request bodies and query params is never guaranteed — even from trusted sources. Assuming shape without checking is an optimistic bug waiting to happen.

**The rule:**
Every API route, form handler, and external data source must validate input with a Zod schema before the data is used. Colocate the schema with the handler.

`schema.parse()` throws on failure — use `schema.safeParse()` and handle errors explicitly at API boundaries.

```
// validate at the boundary
const schema = z.object({ email: z.string().email(), name: z.string().min(1) });
const result = schema.safeParse(req.body);
if (!result.success) return res.status(400).json({ error: result.error.flatten() });
const { email, name } = result.data; // fully typed
```

```
// assume body shape
const { email, name } = req.body; // any type, no validation
await db.users.create({ email, name }); // corrupts DB on bad input
```

---

## Suggested TOOLS.md Additions

### Verification Commands

_Add these to the verification section of TOOLS.md:_

```bash
bun run build    # react-router build
bun run typecheck    # react-router typegen && tsc
bun run test    # vitest run
bun run lint    # eslint .
```

---

## Rules Not Generated (Require Human Judgment)

The bootstrap generator intentionally does not generate rules for:

- Project-specific business logic or domain conventions
- Team workflow preferences (branching, PR size, review process)
- Performance budgets (no baseline data available)
- Security posture specific to your deployment environment
- Any pattern not yet observed as a real failure mode in this project

_Anvil rubric: write rules from observed failures, not anticipated ones. One occurrence → note it. Three occurrences → candidate. Cross-project → pattern._
