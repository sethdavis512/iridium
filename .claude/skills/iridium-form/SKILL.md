---
name: iridium-form
description: Build validated forms in this Iridium app using React Hook Form v7 + Zod v4, useFetcher submission, and the COSS UI form components (Field, Input, Button, FormAlert). Use when adding any user-input form (login, signup, settings, create/edit pages, contact, etc.), composing fieldsets with accessible error messages, wiring client + server validation against a shared schema, displaying form-level or field-level errors from an action, or editing a *.tsx file that contains a <form> or imports react-hook-form, @hookform/resolvers/zod, or zod. Do NOT use for the chat input (uses @ai-sdk/react useChat), for the existing Better Auth login/register flows, or for pure search/filter forms (use <Form method="get"> directly).
---

# Iridium Forms

Compose validated, accessible forms with React Hook Form + Zod, submit them through `useFetcher`, and render them with the COSS UI form components in `app/components/forms/` and `app/components/ui/`. The same Zod schema validates on both sides of the wire.

## Project package versions

The form stack in this repo. Match the API for the installed major version:

| Package               | Version | Notes                                                                                                                                                             |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-hook-form`     | ^7.88   | v7 API: `useForm`, `register`, `handleSubmit`, `setError`, `formState.errors`.                                                                                    |
| `zod`                 | ^4.6    | v4 syntax. Use `z.email()` and `z.url()` as standalone formats, **not** `z.string().email()`. Issues are on `result.error.issues` with `path[]` + `message`.      |
| `@hookform/resolvers` | ^5.9    | Import `zodResolver` from `@hookform/resolvers/zod`. v5 is the pair for RHF 7 + Zod 4.                                                                            |
| `react-router`        | 8.4     | Framework mode. Import `useFetcher`, `Form`, `redirect`, `data` from `react-router`. Never `react-router-dom`.                                                    |
| `@base-ui/react`      | ^1.8    | COSS UI primitives, copy-owned in `app/components/ui/` (`field`, `fieldset`, `input`, `textarea`, `button`, `alert`). There is no DaisyUI; never use its classes. |
| `lucide-react`        | ^1.48   | Project's icon library. Use these for form icons; never heroicons.                                                                                                |

## Form building blocks

Reuse these instead of hand-rolling markup:

| Import                                                                               | What it renders                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Field` from `~/components/forms/Field`                                              | App wrapper on COSS `Fieldset` + `FieldsetLegend`. Props: `label`, `name`, `error?`, `disabled?`, `className?`. Children can be a render prop that receives `{ 'aria-describedby', 'aria-invalid' }`. |
| `Input` / `Textarea` / `Select` from `~/components/forms/*`                          | Thin wrappers over the COSS `Input` / `Textarea` and a token-styled native `<select>`. Size props: `inputSize` / `textareaSize` / `selectSize` (`'sm' \| 'md' \| 'lg'`). Accept `register()` spreads. |
| `Button` from `~/components/ui/button`                                               | COSS button. `variant` (`default`, `outline`, `secondary`, `ghost`, `destructive`, `destructive-outline`, `link`), `size`, and `loading` (disables and shows a spinner).                              |
| `FormAlert` from `~/components/forms/FormAlert`                                      | Form-level error: COSS `Alert variant="error"` with `role="alert"` and a `CircleXIcon`. Renders nothing when `message` is empty. Children become alert actions.                                       |
| `Field`, `FieldLabel`, `FieldError`, `FieldDescription` from `~/components/ui/field` | Raw COSS/Base UI field parts. Use when a real `<label>` bound to the control is wanted (see the variant below).                                                                                       |

## When to apply

- Adding any user-input form: create/edit pages, settings, contact, multi-field flows.
- Surfacing per-field errors from the server back into the UI.
- Showing pending state, disabling the submit button during submission, or optimistic UI.
- Editing a file that already has `useForm`, `zodResolver`, or `<form>` in it.

Use the `react-router-framework-mode` skill for route-level concerns (loaders, redirects, error boundaries, registering the file in `app/routes.ts`).

## Form template

```tsx
import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '~/components/forms/Field';
import { FormAlert } from '~/components/forms/FormAlert';
import { Input } from '~/components/forms/Input';
import { Button } from '~/components/ui/button';

const formSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    email: z.email({ message: 'Enter a valid email address' }),
});

type FormValues = z.infer<typeof formSchema>;

type ActionData = {
    formError?: string | null;
    fieldErrors?: Partial<Record<keyof FormValues, string>>;
};

export function ExampleForm() {
    const fetcher = useFetcher<ActionData>();
    const isSubmitting = fetcher.state !== 'idle';

    const {
        register,
        handleSubmit,
        setError,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
    });

    // Lift server field errors back into RHF
    useEffect(() => {
        if (!fetcher.data?.fieldErrors) return;
        for (const [field, message] of Object.entries(
            fetcher.data.fieldErrors,
        )) {
            setError(field as keyof FormValues, { message });
        }
    }, [fetcher.data, setError]);

    const onSubmit = (data: FormValues) => {
        fetcher.submit(data, {
            method: 'post',
            encType: 'application/json',
        });
    };

    return (
        <>
            <FormAlert message={fetcher.data?.formError} className="mb-4" />
            <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
            >
                <Field
                    label="What is your first name?"
                    name="name"
                    error={errors.name?.message}
                    disabled={isSubmitting}
                >
                    {(controlProps) => (
                        <Input
                            type="text"
                            placeholder="Your name"
                            {...controlProps}
                            {...register('name')}
                        />
                    )}
                </Field>
                <Field
                    label="Email address"
                    name="email"
                    error={errors.email?.message}
                    disabled={isSubmitting}
                >
                    {(controlProps) => (
                        <Input
                            type="email"
                            placeholder="name@example.com"
                            {...controlProps}
                            {...register('email')}
                        />
                    )}
                </Field>
                <Button type="submit" loading={isSubmitting}>
                    Submit
                </Button>
            </form>
        </>
    );
}
```

`Field` derives the error id from `name` (`<name>-error`) and hands `aria-describedby` + `aria-invalid` to the render prop, so always spread `controlProps` onto the control. Pass `disabled` to `Field` to disable the whole fieldset while submitting.

### Variant: COSS `Field` with a bound label

When the control needs a real `<label>` (instead of the wrapper's fieldset legend), compose the COSS field parts directly. Base UI links `FieldLabel` and `FieldError` to the control inside the same `Field`. Mark the field `invalid` and force the error visible with `match` because RHF, not the browser's validity state, owns validation:

```tsx
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';

<Field name="email" invalid={!!errors.email} disabled={isSubmitting}>
    <FieldLabel>Email address</FieldLabel>
    <Input type="email" {...register('email')} />
    <FieldError match={!!errors.email}>{errors.email?.message}</FieldError>
</Field>;
```

## Validation: one schema, both sides

Declare the Zod schema once and use it for both the client resolver and the server action.

```tsx
// client
useForm<FormValues>({ resolver: zodResolver(formSchema) });

// server (in the route's action)
import { data } from 'react-router';

export async function action({ request }: Route.ActionArgs) {
    const parsed = formSchema.safeParse(await request.json());
    if (!parsed.success) {
        return data(
            {
                fieldErrors: Object.fromEntries(
                    parsed.error.issues.map((i) => [
                        String(i.path[0]),
                        i.message,
                    ]),
                ),
            },
            { status: 400 },
        );
    }
    // ...do work with parsed.data via app/models/*.server.ts
    return { formError: null };
}
```

Zod v4 notes:

- `z.email()`, `z.url()`, `z.uuid()` are standalone string formats. Don't write `z.string().email()`.
- `safeParse` returns `{ success, data }` or `{ success, error }` where `error.issues[]` has `{ path, message, code }`.
- Coerce numbers/dates from JSON with `z.coerce.number()` / `z.coerce.date()` when needed.

Never trust client validation alone: always `safeParse` on the server.

## Submission pattern (pick one)

| Pattern                                                                                | Use when                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `useFetcher` + `fetcher.submit(data, { method: 'post', encType: 'application/json' })` | **Default for RHF forms.** RHF owns the submit handler; you want validated JS objects on the server, no navigation. |
| `<fetcher.Form method="post">` with `name="..."` inputs                                | Inline mutations without RHF (likes, ratings, toggles).                                                             |
| `<Form method="post">` from `react-router`                                             | Mutations that should redirect on success and don't need RHF.                                                       |
| `<Form method="get">`                                                                  | Search/filter forms. Auto-syncs to URL `searchParams`.                                                              |

For RHF forms in this project, prefer `useFetcher` + JSON. It keeps client validation, lets you return structured `{ formError, fieldErrors }`, and avoids FormData stringification.

`fetcher.state` is `'idle' | 'submitting' | 'loading'`. Disable submit on anything other than `'idle'`.

## Markup rules

- Wrap each field in the app `Field` (`~/components/forms/Field`) and render the control through its render prop so `aria-describedby` and `aria-invalid` are wired. Don't hand-roll `<fieldset>`/`<legend>` or error `<p>` markup.
- Controls come from `~/components/forms/` (`Input`, `Textarea`, `Select`), or from `~/components/ui/` when composing the raw COSS `Field`. Size them with `inputSize`/`textareaSize`/`selectSize` (wrappers) or `size` (COSS), not ad-hoc height classes.
- Field errors come from `Field`'s `error` prop (rendered as `text-destructive` under the control). Form-level errors use `FormAlert`.
- Submit with COSS `Button type="submit"` and `loading={isSubmitting}`; `loading` disables the button and shows a spinner. Use `variant="ghost"` for Cancel.
- Styling uses semantic tokens only (`text-muted-foreground`, `text-destructive`, `bg-card`, ...). Never DaisyUI classes (`btn`, `input`, `fieldset-legend`, `alert-error`) or raw palette colors: DaisyUI is not installed, so they render unstyled.

## Accessibility

- `Field` pairs the control's `aria-describedby` with the error's `id` (`<name>-error`) and sets `aria-invalid` when `error` is present, as long as the render prop spreads `controlProps` onto the control.
- `Field` labels with a fieldset legend. When a control needs a bound `<label>`, use the COSS `Field` + `FieldLabel` variant above.
- Use `noValidate` on `<form>` so the browser's native bubble doesn't fight RHF's messages.
- `FormAlert` renders `role="alert"` so screen readers announce form-level errors immediately.
- Decorative icons get `aria-hidden="true"`.

## Returning errors from the action

Pick the shape that matches what to show:

- `{ formError: string }`: one banner at the top of the form.
- `{ fieldErrors: Record<string, string> }`: per-field messages, lifted back into RHF via `setError` (see template).
- `{ formError, fieldErrors }`: both, when the failure is partly per-field and partly global (e.g. "email taken" on `email` plus a global "fix the issues below" banner).

On success: return `{ formError: null }` to let the UI clear, or `throw redirect('/somewhere')` from `react-router`.

## Pending state and optimistic UI

For optimistic UI, read `fetcher.formData` (FormData submissions) or track the last submitted JSON in component state, and render the expected result before the action resolves. See `react-router-framework-mode` → `references/pending-ui.md` for the full pattern.

## Multiple intents in one form

When one form dispatches to different action branches (save vs delete), include an `intent`:

```tsx
fetcher.submit(
    { intent: 'delete', ...data },
    { method: 'post', encType: 'application/json' },
);
```

Then branch on `parsed.data.intent` in the action.

## Don'ts

- Don't use `<Form>` from react-router for RHF-driven forms: it navigates and bypasses `handleSubmit`.
- Don't hand-roll field markup. Use the `Field` wrapper (or COSS `Field` parts) so labels and error wiring stay consistent.
- Don't drop the `controlProps` spread in a `Field` render prop. The error UI is only accessible when `aria-describedby` reaches the control.
- Don't validate only on the client. Re-run the same Zod schema in the action.
- Don't put DB calls directly in the action; delegate to `app/models/*.server.ts` functions.
- Don't write `z.string().email()`; Zod v4 uses `z.email()`.
- Don't import from `react-router-dom`. Everything ships from `react-router`.
- Don't use DaisyUI class names (`btn`, `input`, `fieldset`, `alert-error`, `form-control`). There is no DaisyUI in this project; use the COSS components.

## See also

- `react-router-framework-mode`: loaders, actions, route registration, redirects, error boundaries, optimistic UI.
- `app/middleware/auth.ts`: gate a form's route with `authMiddleware`.
- `app/models/*.server.ts`: where mutation logic lives.
