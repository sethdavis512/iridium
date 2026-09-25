/**
 * Title threads still called "Untitled" from their first user message, with
 * the same fallback title failed title generation stores (TEC-502):
 *
 *   bun run db:backfill-titles --dry-run          # print what would change
 *   bun run db:backfill-titles                    # preview, confirm, write
 *   bun run db:backfill-titles --non-interactive  # write without prompting
 *
 * Idempotent: only non-deleted "Untitled" threads are read or written, so a
 * second run changes nothing. A thread whose first user message has no text
 * stays "Untitled" and is titled on its next reply.
 *
 * Targets DATABASE_URL (the local Docker database when unset). Running it
 * against production needs the owner's go-ahead.
 */
import { confirm } from '@inquirer/prompts';
import { env } from '~/lib/env.server';
import prisma from '~/lib/prisma';
import { buildFallbackTitle } from '~/lib/thread-title.server';
import { backfillUntitledThreadTitles } from '~/models/thread.server';

const args = process.argv.slice(2);
const nonInteractive = args.includes('--non-interactive');
const dryRun = args.includes('--dry-run');

/** host:port/database, never the credentials. */
function describeDatabase(url: string) {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`;
}

type BackfillResult = Awaited<ReturnType<typeof backfillUntitledThreadTitles>>;

function report({ titled, skipped }: BackfillResult, verb: string) {
    for (const { threadId, title } of titled) {
        console.log(`  ${threadId}  ${JSON.stringify(title)}`);
    }
    console.log(
        `\n${titled.length} thread(s) ${verb}; ${skipped} left "Untitled" (no user text).`,
    );
}

const target = describeDatabase(env.DATABASE_URL);
console.log(`Database: ${target}${dryRun ? ' (dry run)' : ''}\n`);

try {
    const preview = await backfillUntitledThreadTitles({
        buildTitle: buildFallbackTitle,
        dryRun: true,
    });

    if (dryRun) {
        report(preview, 'would be titled');
    } else if (preview.titled.length === 0) {
        report(preview, 'titled');
    } else {
        const proceed =
            nonInteractive ||
            (await confirm({
                message: `Title ${preview.titled.length} thread(s) in ${target}?`,
                default: false,
            }));

        if (proceed) {
            report(
                await backfillUntitledThreadTitles({
                    buildTitle: buildFallbackTitle,
                }),
                'titled',
            );
        } else {
            console.log('Cancelled; nothing was written.');
        }
    }
} finally {
    await prisma.$disconnect();
}
