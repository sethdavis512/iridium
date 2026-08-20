# Adding a Feature

This walkthrough builds a complete feature the way Iridium expects, using the
Notes feature (`app/routes/notes.tsx`) as the worked example. Read it next to
that file: everything described here exists in the codebase and is covered by
tests, so it doubles as a reference implementation.

## The shape of a feature

A typical Iridium feature touches five places:

1. A route registration in `app/routes.ts`
2. A route module in `app/routes/` (loader, action, component)
3. Model functions in `app/models/*.server.ts`
4. Unit tests beside the model, E2E tests in `tests/`
5. Optionally: a nav entry in `app/components/SiteHeader.tsx`

## 1. Register the route

Routes are config-based (not file-system based). Add the route inside the
appropriate layout in `app/routes.ts`:

```ts
layout('routes/layouts/app.tsx', [
    route('/notes', 'routes/notes.tsx'),
    // ...
]),
```

The app layout gives you the locked viewport shell with header, nav, and
footer. Marketing pages go in the marketing layout; anonymous-only pages
(login, password reset) in the auth layout.

## 2. Protect it and load data

Export the auth middleware, then read the user from context in your loader.
The middleware guarantees a non-null user and redirects anonymous visitors to
`/login`:

```ts
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const { page, pageSize, skip, take } = parsePage(url.searchParams);

    const [notes, totalCount] = await Promise.all([
        searchNotes({ userId: user.id, query, skip, take }),
        countNotesByUserId(user.id, query || undefined),
    ]);

    return { notes, query, page, ...pageMeta(totalCount, page, pageSize) };
}
```

Conventions at work:

- `Route.LoaderArgs` comes from `./+types/<route>` (auto-generated; run
  `bun run typecheck` to regenerate)
- Search params drive search and pagination (`parsePage` / `pageMeta` from
  `~/lib/pagination`), so URLs stay shareable
- The loader never touches Prisma directly: it calls model functions

## 3. Mutate with an intent-based action

One action handles all mutations for the route, disambiguated by a hidden
`intent` field. Validate with Zod, rate limit, check ownership, and finish
with a flash toast:

```ts
export async function action({ request, context }: Route.ActionArgs) {
    const user = requireUserFromContext(context);
    const form = await request.formData();
    const intent = String(form.get('intent'));

    if (intent === 'create-note') {
        const { success } = rateLimit({
            key: `note-write:${user.id}`,
            maxRequests: 30,
            windowMs: 60_000,
        });
        if (!success) {
            throw new Response('Too many requests.', { status: 429 });
        }

        const parsed = noteSchema.safeParse(Object.fromEntries(form));
        if (!parsed.success) {
            return data(
                {
                    intent,
                    errors: z.flattenError(parsed.error).fieldErrors,
                },
                { status: 400 },
            );
        }

        await createNote({ ...parsed.data, userId: user.id });

        return redirectWithToast('/notes', {
            type: 'success',
            message: 'Note created.',
        });
    }

    throw new Response('Unknown intent', { status: 400 });
}
```

The pieces:

- `rateLimit` (`~/lib/rate-limit.server`) is an in-memory sliding window,
  keyed per user per operation
- Validation errors return `400` with `fieldErrors`; the component shows them
  through the `Field` component's `error` prop
- `redirectWithToast` (`~/lib/toast.server`) flashes a message that
  `root.tsx` renders as a flash toast (COSS Alert) on the next page
- Ownership checks load the row first (`getNoteById`) and compare `userId`
  before mutating — never trust an id from the client

## 4. Model functions

Data access lives in `app/models/*.server.ts` as plain async functions over
the Prisma client. Two house rules:

- **Soft deletes**: `Thread` and `Note` have `deletedAt`; every read filters
  `deletedAt: null` and "delete" sets the timestamp. Use `findFirst` (not
  `findUnique`) when the filter needs extra `where` conditions.
- **The model layer is the only Prisma entry point** for these tables. If a
  route needs a count, add a `countXByUserId` function; don't import
  `~/lib/prisma` in the route.

## 5. The component

Follow the patterns in `app/routes/notes.tsx`:

- `<Form method="POST">` with a hidden `intent` input per mutation
- `<Form method="GET" role="search">` for search (URL-driven, no state)
- Form fields built from `~/components/forms/` (`Field`, `Input`,
  `Textarea`, `FormAlert`) — `Field` wires `aria-describedby` to the error
- `useNavigation()` for pending UI; disable the submitting form's controls
- COSS `Dialog` (forms) / `AlertDialog` (confirms) driven by `useDialogState` (`~/hooks`) for create/edit/delete flows
- `EmptyState` for zero-data and zero-results views
- `Pagination` under the list; it preserves other search params
- Inline `<title>` and `<meta>` in JSX (no `meta` export)
- An `ErrorBoundary` export with `isRouteErrorResponse` when the route
  throws Responses the user can hit organically

## 6. Tests

**Unit tests** sit beside the model (`app/models/note.server.test.ts`). Mock
the Prisma client with `vi.mock('~/lib/prisma')` and assert call shapes,
including the `deletedAt: null` filter.

**E2E tests** go in `tests/` (`tests/notes.spec.ts`). Use the `authedPage`
fixture: it signs up a brand-new isolated user per test, so every test starts
with zero data and parallel runs never collide. API-level helpers
(`createNoteViaApi`, `createThreadViaApi` in `tests/fixtures.ts`) seed data
fast without driving the UI.

**Visual inventory**: if the feature adds a durable user-facing surface or
state, add a row to `tests/visual/inventory.spec.ts` (one `test()` per shot,
using the `setTheme`/`settle`/`snap` helpers in `tests/visual/helpers.ts`).
Check the result with `bun run test:visual`.

Run everything before committing (the pre-commit hook lint-stages staged
files, but tests are on you):

```sh
bun run validate   # typecheck + lint + format
bun run test       # vitest
bunx playwright test tests/notes.spec.ts --project=chromium
```
