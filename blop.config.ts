import {
    add,
    append,
    camel,
    code,
    confirm,
    defineConfig,
    generator,
    kebab,
    modify,
    pascal,
    select,
    snake,
    text,
    title,
} from 'blop';

// Generators that follow this app's conventions (see CLAUDE.md). Run
// `bun blop` to pick one, `bun blop <generator> --help` for its flags, and
// `--dry-run` to see the diffs before anything is written.

/** Naive English plural: task → tasks, entry → entries, box → boxes. */
function plural(word: string) {
    if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
    return `${word}s`;
}

/** Escapes text for a single-quoted string literal. */
function quote(value: string) {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/**
 * Inserts import lines after the file's last top-level import, skipping any
 * that are already there.
 */
function addImports(source: string, imports: string[]) {
    const lines = source.split('\n');
    let last = -1;
    for (const [index, line] of lines.entries()) {
        if (/^(import .*|\}) from '.+';$/.test(line)) last = index;
        else if (/^\S/.test(line) && !/^(import|\/\/)/.test(line)) break;
    }
    const missing = imports.filter((line) => !source.includes(line));
    lines.splice(last + 1, 0, ...missing);
    return lines.join('\n');
}

/** Splits a route path into its file name, component name and heading. */
function routeNames(path: string) {
    const segments = path.split('/').filter(Boolean);
    const plain = segments.map((segment) => segment.replace(/^:/, ''));
    const fixed = segments.filter((segment) => !segment.startsWith(':'));
    return {
        url: `/${segments.join('/')}`,
        file: kebab(plain.join(' ')),
        Name: pascal(plain.join(' ')),
        heading: title(fixed.length > 0 ? fixed.join(' ') : plain.join(' ')),
    };
}

// route: a page module, registered inside a layout in app/routes.ts.

type Layout = 'app' | 'auth' | 'none';

/** The routes.ts line each layout's children follow. */
const layoutAnchors: Record<Layout, RegExp> = {
    app: /^ {4}layout\('routes\/layouts\/app\.tsx', \[$/m,
    auth: /^ {4}layout\('routes\/layouts\/auth\.tsx', \[$/m,
    none: /^export default \[$/m,
};

function routeModule({
    file,
    Name,
    heading,
    layout,
    loader,
    action,
}: ReturnType<typeof routeNames> & {
    layout: Layout;
    loader: boolean;
    action: boolean;
}) {
    const authed = layout === 'app';
    const imports = [
        action
            ? `import { Form, isRouteErrorResponse, useRouteError } from 'react-router';`
            : `import { isRouteErrorResponse, useRouteError } from 'react-router';`,
        action && `import { z } from 'zod';`,
        `import { APP_NAME } from '~/config';`,
        authed &&
            loader &&
            `import { requireUserFromContext } from '~/context';`,
        action && `import { redirectWithToast } from '~/lib/toast.server';`,
        authed && `import { authMiddleware } from '~/middleware/auth';`,
        `import { Container } from '~/components/Container';`,
        `import { PageHeader } from '~/components/PageHeader';`,
        `import { FormAlert } from '~/components/forms/FormAlert';`,
        action && `import { Button } from '~/components/ui/button';`,
        (authed || loader || action) &&
            `import type { Route } from './+types/${file}';`,
    ].filter(Boolean);

    const loaderBlock = authed
        ? code`
            export async function loader({ context }: Route.LoaderArgs) {
                const user = requireUserFromContext(context);

                return { name: user.name };
            }
        `
        : code`
            export async function loader() {
                return { heading: '${heading}' };
            }
        `;

    const greeting = authed
        ? '<p className="text-muted-foreground">Signed in as {loaderData.name}.</p>'
        : '<p className="text-muted-foreground">{loaderData.heading}</p>';

    return [
        imports.join('\n') + '\n',
        authed &&
            code`export const middleware: Route.MiddlewareFunction[] = [authMiddleware];`,
        loader && loaderBlock,
        action &&
            code`
                const actionSchema = z.object({
                    intent: z.literal('save'),
                });

                export async function action({ request, url }: Route.ActionArgs) {
                    const parsed = actionSchema.safeParse(
                        Object.fromEntries(await request.formData()),
                    );

                    if (!parsed.success) {
                        throw new Response('Unknown intent', { status: 400 });
                    }

                    return redirectWithToast(url.pathname, {
                        type: 'success',
                        message: 'Saved.',
                    });
                }
            `,
        code`
            export default function ${Name}Route(${loader ? '{ loaderData }: Route.ComponentProps' : ''}) {
                return (
                    <>
                        <title>{\`${heading} | \${APP_NAME}\`}</title>
                        <meta name="description" content="${heading}" />
                        <Container className="flex flex-col gap-6 p-4">
                            <PageHeader title="${heading}">
                                ${loader && greeting}
                            </PageHeader>
                            ${
                                action &&
                                code`
                                    <Form method="post">
                                        <input type="hidden" name="intent" value="save" />
                                        <Button type="submit">Save</Button>
                                    </Form>
                                `
                            }
                        </Container>
                    </>
                );
            }
        `,
        code`
            export function ErrorBoundary() {
                const error = useRouteError();

                const message = isRouteErrorResponse(error)
                    ? \`\${error.status} \${
                          typeof error.data === 'string' ? error.data : error.statusText
                      }\`
                    : 'Experiencing technical difficulties. Please try again later.';

                return <FormAlert message={message} />;
            }
        `,
    ]
        .filter(Boolean)
        .join('\n');
}

// api: a loader or action under /api, with no component.

function apiModule(file: string, method: 'GET' | 'POST', authed: boolean) {
    const imports = [
        `import { data } from 'react-router';`,
        `import { z } from 'zod';`,
        authed && `import { requireUser } from '~/models/session.server';`,
        `import type { Route } from './+types/${file}';`,
    ].filter(Boolean);
    const user = authed && 'const user = await requireUser(request);';
    const userField = authed ? ', userId: user.id' : '';

    const handler =
        method === 'GET'
            ? code`
                const querySchema = z.object({});

                export async function loader({ request }: Route.LoaderArgs) {
                    ${user}
                    const parsed = querySchema.safeParse(
                        Object.fromEntries(new URL(request.url).searchParams),
                    );

                    if (!parsed.success) {
                        return data({ error: 'Invalid query' }, { status: 400 });
                    }

                    return data({ ...parsed.data${userField} });
                }
            `
            : code`
                const bodySchema = z.object({});

                export async function action({ request }: Route.ActionArgs) {
                    if (request.method !== 'POST') {
                        return data({ error: 'Method not allowed' }, { status: 405 });
                    }

                    ${user}
                    const parsed = bodySchema.safeParse(
                        Object.fromEntries(await request.formData()),
                    );

                    if (!parsed.success) {
                        return data({ error: 'Invalid request' }, { status: 400 });
                    }

                    return data({ ok: true${userField} });
                }
            `;

    return `${imports.join('\n')}\n\n${handler}`;
}

// model: a Prisma model plus its app/models/*.server.ts data access module.

type Field = { name: string; type: string };

/** "title:String, dueAt:DateTime?" to a list of fields. */
function parseFields(input: string): Field[] {
    return input
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const [name = '', type = 'String'] = part
                .split(':')
                .map((piece) => piece.trim());
            return { name: camel(name), type };
        });
}

/** Lines up columns the way `prisma format` does. */
function alignColumns(rows: string[][]) {
    const widths = rows.reduce<number[]>(
        (max, row) =>
            row.map((cell, index) => Math.max(max[index] ?? 0, cell.length)),
        [],
    );
    return rows.map((row) =>
        row
            .map((cell, index) =>
                index === row.length - 1 ? cell : cell.padEnd(widths[index]),
            )
            .join(' '),
    );
}

function modelBlock(
    Name: string,
    fields: Field[],
    owned: boolean,
    softDelete: boolean,
) {
    const rows = [
        ['id', 'String', '@id @default(cuid())'],
        ...fields.map((field) => [field.name, field.type]),
        ['createdAt', 'DateTime', '@default(now())'],
        ['updatedAt', 'DateTime', '@updatedAt'],
        ...(softDelete ? [['deletedAt', 'DateTime?']] : []),
        ...(owned
            ? [
                  ['userId', 'String'],
                  [
                      'user',
                      'User',
                      '@relation(fields: [userId], references: [id], onDelete: Cascade)',
                  ],
              ]
            : []),
    ];
    const index = owned
        ? `@@index([userId${softDelete ? ', deletedAt' : ''}])`
        : softDelete && '@@index([deletedAt])';

    return code`
        model ${Name} {
            ${alignColumns(rows)}

            ${index}
            @@map("${camel(Name)}")
        }
    `;
}

/** Adds `projects Project[]` to the User model, aligned with its fields. */
function addUserRelation(source: string, field: string, Name: string) {
    const lines = source.split('\n');
    const start = lines.findIndex((line) => /^model User \{$/.test(line));
    if (start === -1) {
        throw new Error(
            'prisma/schema.prisma has no `model User`. Pass --no-owned.',
        );
    }
    let insertAt = start + 1;
    while (lines[insertAt]?.trim() && !lines[insertAt].includes('@@')) {
        insertAt += 1;
    }
    const nameWidth =
        (lines[start + 1]?.match(/^\s+\S+\s+/)?.[0].length ?? 0) - 4;
    const line = `    ${field.padEnd(Math.max(nameWidth, field.length + 1))}${Name}[]`;
    lines.splice(insertAt, 0, line);
    return lines.join('\n');
}

function modelServer(
    Name: string,
    fields: Field[],
    owned: boolean,
    softDelete: boolean,
) {
    const name = camel(Name);
    const Names = plural(Name);
    const id = `${name}Id`;
    const select = `${name}Select`;
    const alive = softDelete ? ', deletedAt: null' : '';
    const owner = owned ? ', userId' : '';
    const ownerArg = owned ? 'userId: string, ' : '';
    const inputKeys = fields.map((field) => quote(field.name)).join(' | ');

    return [
        code`
            import type { Prisma } from '~/generated/prisma/client';
            import prisma from '~/lib/prisma';

            const ${select} = {
                id: true,
                ${fields.map((field) => `${field.name}: true,`)}
                createdAt: true,
                updatedAt: true,
            } satisfies Prisma.${Name}Select;

            /** A ${title(Name).toLowerCase()} as routes and tools see it: no ${owned ? 'owner or ' : ''}bookkeeping columns. */
            export type ${Name} = Prisma.${Name}GetPayload<{ select: typeof ${select} }>;

            /** The columns callers set; ids and timestamps are managed here. */
            type ${Name}Input = Pick<Prisma.${Name}UncheckedCreateInput, ${inputKeys}>;

            type PageOptions = {
                skip?: number;
                take?: number;
            };
        `,
        code`
            export function create${Name}(${ownerArg}input: ${Name}Input) {
                return prisma.${name}.create({
                    data: { ...input${owner} },
                    select: ${select},
                });
            }
        `,
        code`
            export function get${Names}(${ownerArg}{ skip, take }: PageOptions = {}) {
                return prisma.${name}.findMany({
                    where: { ${owned ? 'userId' : ''}${owned && softDelete ? ', ' : ''}${softDelete ? 'deletedAt: null' : ''} },
                    orderBy: { createdAt: 'desc' },
                    select: ${select},
                    skip,
                    take,
                });
            }
        `,
        code`
            export function get${Name}ById(${id}: string${owned ? ', userId: string' : ''}) {
                ${softDelete && `// findFirst, not findUnique: soft-deleted rows must behave as missing.`}
                return prisma.${name}.findFirst({
                    where: { id: ${id}${owner}${alive} },
                    select: ${select},
                });
            }
        `,
        code`
            export function update${Name}(
                ${id}: string,
                ${owned && 'userId: string,'}
                input: Partial<${Name}Input>,
            ) {
                return prisma.${name}.update({
                    where: { id: ${id}${owner}${alive} },
                    data: input,
                    select: ${select},
                });
            }
        `,
        softDelete
            ? code`
                export function delete${Name}(${id}: string${owned ? ', userId: string' : ''}) {
                    // Soft delete: every read in this module filters deletedAt: null.
                    return prisma.${name}.update({
                        where: { id: ${id}${owner}${alive} },
                        data: { deletedAt: new Date() },
                        select: { id: true },
                    });
                }
            `
            : code`
                export function delete${Name}(${id}: string${owned ? ', userId: string' : ''}) {
                    return prisma.${name}.delete({
                        where: { id: ${id}${owner} },
                        select: { id: true },
                    });
                }
            `,
        softDelete &&
            code`
                /**
                 * Hard-delete ${plural(title(Name).toLowerCase())} soft-deleted more than \`olderThanDays\`
                 * days ago. Call it from trigger/purge-soft-deleted.ts.
                 */
                export function purgeSoftDeleted${Names}(olderThanDays: number) {
                    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

                    return prisma.${name}.deleteMany({
                        where: { deletedAt: { lt: cutoff } },
                    });
                }
            `,
    ]
        .filter(Boolean)
        .join('\n');
}

// task: a Trigger.dev task with its logic in app/lib, so the inline fallback
// in app/lib/jobs.server.ts and the worker run the same code.

type Schedule = 'on-demand' | 'daily' | 'hourly';

// Off the hour, like purge-soft-deleted, to avoid thundering-herd crons.
const crons: Record<Exclude<Schedule, 'on-demand'>, [string, string]> = {
    daily: ['23 5 * * *', 'Daily at 05:23 UTC.'],
    hourly: ['23 * * * *', 'Hourly at 23 minutes past.'],
};

function taskLib(fn: string, Name: string, scheduled: boolean) {
    return scheduled
        ? code`
            /** Shared by trigger/${kebab(fn)}.ts and any inline caller. */
            export async function ${fn}() {
                return { processed: 0 };
            }
        `
        : code`
            export type ${Name}Payload = {
                userId: string;
            };

            /**
             * Shared by trigger/${kebab(fn)}.ts and the inline fallback in
             * app/lib/jobs.server.ts, so both run the same code.
             */
            export async function ${fn}(payload: ${Name}Payload) {
                return { userId: payload.userId };
            }
        `;
}

function taskFile(fn: string, Name: string, schedule: Schedule) {
    const id = kebab(fn);
    if (schedule !== 'on-demand') {
        const [cron, note] = crons[schedule];
        return code`
            import { schedules, logger } from '@trigger.dev/sdk';
            import { ${fn} } from '~/lib/${id}.server';

            export const ${fn}Task = schedules.task({
                id: '${id}',
                // ${note}
                cron: '${cron}',
                run: async () => {
                    const result = await ${fn}();

                    logger.info('${id} finished', result);

                    return result;
                },
            });
        `;
    }
    return code`
        import { task, logger } from '@trigger.dev/sdk';
        import { ${fn}, type ${Name}Payload } from '~/lib/${id}.server';

        /**
         * Runs ${fn} off the request path. Triggered by
         * \`enqueue${Name}\` in app/lib/jobs.server.ts.
         */
        export const ${fn}Task = task({
            id: '${id}',
            run: async (payload: ${Name}Payload) => {
                const result = await ${fn}(payload);

                logger.info('${id} finished', result);

                return result;
            },
        });
    `;
}

function enqueueFunction(fn: string, Name: string) {
    return code`
        export async function enqueue${Name}(payload: ${Name}Payload) {
            if (isTriggerEnabled) {
                const tasks = await getTasks();
                await tasks.trigger<typeof ${fn}Task>('${kebab(fn)}', payload);
                return;
            }

            await ${fn}(payload);
        }
    `;
}

// tool: a Mastra tool for the chat agent, registered in app/mastra/agents.ts.

function toolFile(variable: string, id: string, description: string) {
    return code`
        import { createTool } from '@mastra/core/tools';
        import invariant from 'tiny-invariant';
        import z from 'zod';
        import { contextUserId } from '~/mastra/context';

        export const ${variable} = createTool({
            id: '${id}',
            description: ${quote(description)},
            inputSchema: z.object({}),
            execute: async (_args, options) => {
                const userId = contextUserId(options);
                invariant(userId, 'User not authenticated');

                return { ok: true };
            },
        });
    `;
}

// component: an app-authored component with CVA variants.

function componentFile(Name: string) {
    const variants = `${camel(Name)}Variants`;
    return code`
        import type { VariantProps } from 'cva';
        import { cva, cx } from 'cva.config';
        import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';

        export const ${variants} = cva({
            base: '',
            variants: {
                variant: {
                    default: '',
                },
            },
            defaultVariants: {
                variant: 'default',
            },
        });

        type Props = ComponentPropsWithoutRef<'div'> &
            VariantProps<typeof ${variants}>;

        export function ${Name}({
            className,
            variant,
            children,
            ...props
        }: PropsWithChildren<Props>) {
            return (
                <div className={cx(${variants}({ variant, className }))} {...props}>
                    {children}
                </div>
            );
        }
    `;
}

export default defineConfig({
    route: generator({
        description:
            'A page route, registered inside a layout in app/routes.ts',
        prompts: {
            path: text('Route path, like billing or projects/:projectId'),
            layout: select('Layout', ['app', 'auth', 'none'], {
                default: 'app',
            }),
            loader: confirm('Add a loader?', { default: true }),
            action: confirm('Add an action?', { default: false }),
        },
        actions: ({ path, layout, loader, action }) => {
            const names = routeNames(path);
            const indent = layout === 'none' ? '    ' : '        ';
            return [
                add(
                    `app/routes/${names.file}.tsx`,
                    routeModule({ ...names, layout, loader, action }),
                ),
                append(
                    'app/routes.ts',
                    `${indent}route('${names.url}', 'routes/${names.file}.tsx'),`,
                    { after: layoutAnchors[layout] },
                ),
            ];
        },
    }),

    api: generator({
        description: 'An /api route with a loader or action and no component',
        prompts: {
            path: text('Path under /api, like webhooks/stripe'),
            method: select('Method', ['POST', 'GET'], { default: 'POST' }),
            auth: confirm('Require a signed-in user?', { default: true }),
        },
        actions: ({ path, method, auth }) => {
            const names = routeNames(path.replace(/^\/?api\//, ''));
            const file = `api-${names.file}`;
            return [
                add(`app/routes/${file}.ts`, apiModule(file, method, auth)),
                append(
                    'app/routes.ts',
                    `        route('${names.url}', 'routes/${file}.ts'),`,
                    { after: /^ {4}\.\.\.prefix\('\/api', \[$/m },
                ),
            ];
        },
    }),

    model: generator({
        description:
            'A Prisma model and its app/models data access module, soft delete included',
        prompts: {
            name: text('Model name, like project or task label'),
            fields: text('Fields, like title:String, dueAt:DateTime?', {
                default: 'title:String',
            }),
            owned: confirm('Owned by a user?', { default: true }),
            softDelete: confirm('Soft delete with a deletedAt column?', {
                default: true,
            }),
        },
        actions: ({ name, fields, owned, softDelete }) => {
            const Name = pascal(name);
            const parsed = parseFields(fields);
            return [
                append(
                    'prisma/schema.prisma',
                    `\n${modelBlock(Name, parsed, owned, softDelete)}`,
                ),
                owned &&
                    modify('prisma/schema.prisma', (source) =>
                        addUserRelation(source, plural(camel(name)), Name),
                    ),
                add(
                    `app/models/${kebab(name)}.server.ts`,
                    modelServer(Name, parsed, owned, softDelete),
                ),
            ];
        },
    }),

    task: generator({
        description:
            'A Trigger.dev task with shared logic in app/lib and an enqueue function',
        prompts: {
            name: text('Task name, like send weekly digest'),
            schedule: select('When it runs', ['on-demand', 'daily', 'hourly'], {
                default: 'on-demand',
            }),
        },
        actions: ({ name, schedule }) => {
            const fn = camel(name);
            const Name = pascal(name);
            const id = kebab(name);
            const scheduled = schedule !== 'on-demand';
            return [
                add(`app/lib/${id}.server.ts`, taskLib(fn, Name, scheduled)),
                add(`trigger/${id}.ts`, taskFile(fn, Name, schedule)),
                !scheduled &&
                    modify(
                        'app/lib/jobs.server.ts',
                        (source) =>
                            `${addImports(source, [
                                `import { ${fn}, type ${Name}Payload } from '~/lib/${id}.server';`,
                                `import type { ${fn}Task } from '../../trigger/${id}';`,
                            ]).trimEnd()}\n\n${enqueueFunction(fn, Name)}`,
                    ),
            ];
        },
    }),

    tool: generator({
        description:
            'A Mastra tool for the chat agent, registered in agents.ts',
        prompts: {
            name: text('Tool name, like list tasks'),
            description: text('When the agent should call it', {
                default: 'Describe when the agent should call this tool.',
            }),
        },
        actions: ({ name, description }) => {
            const variable = `${camel(name)}Tool`;
            return [
                add(
                    `app/mastra/tools/${kebab(name)}.ts`,
                    toolFile(variable, snake(name), description),
                ),
                modify('app/mastra/agents.ts', (source) => {
                    const withImport = addImports(source, [
                        `import { ${variable} } from './tools/${kebab(name)}';`,
                    ]);
                    const anchor = /^(\s*)tools: byId\(\[\n/m;
                    if (!anchor.test(withImport)) {
                        throw new Error(
                            'app/mastra/agents.ts has no `tools: byId([` list.',
                        );
                    }
                    return withImport.replace(
                        anchor,
                        (line, indent: string) =>
                            `${line}${indent}    ${variable},\n`,
                    );
                }),
            ];
        },
    }),

    component: generator({
        description: 'An app component in app/components with CVA variants',
        prompts: {
            name: text('Component name, like project card'),
        },
        actions: ({ name }) => {
            const Name = pascal(name);
            return [add(`app/components/${Name}.tsx`, componentFile(Name))];
        },
    }),
});
