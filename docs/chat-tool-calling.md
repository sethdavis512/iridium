# Chat Memory and Tool Calling

How `/api/chat` keeps Mastra's conversation memory and the Prisma copy of a
thread in step, and what to look at when a turn replays stale history.

## Where the conversation lives

- **Prisma** (`DATABASE_URL`) is the source of truth the UI reads: `Message`
  rows hold each `UIMessage`'s parts as JSON. `saveChat()` in
  [`app/models/thread.server.ts`](../app/models/thread.server.ts) upserts them
  with the client's stable message ids.
- **Mastra memory** (`MASTRA_DATABASE_URL`) holds what the model sees:
  conversation history per thread (`memory: { thread, resource }`) and
  per-user working memory. It is rebuilt from Prisma when missing.

## Guardrails in this codebase

1. A normal turn sends only the latest `user` message into `agent.stream(...)`
   in [`app/routes/api-chat.ts`](../app/routes/api-chat.ts); Mastra supplies
   the earlier turns from memory, so assistant and tool parts are never
   re-submitted as fresh input.
2. A thread Mastra has never seen (one older than the Mastra migration, or
   whose memory was reset) is seeded from its Prisma messages, text parts
   only, before the turn runs (`seedMemoryFromThread`).
3. Regeneration (`trigger: 'regenerate-message'`) deletes the trailing
   assistant rows in Prisma, deletes the thread from Mastra memory, and
   resends the trimmed history, so the retried turn starts from exactly what
   the client shows.
4. Tools never see a user id in the prompt: `/api/chat` puts it in the Mastra
   `RequestContext` ([`app/mastra/context.ts`](../app/mastra/context.ts)) and
   tools read it with `contextUserId(options)`.

## Symptoms and what they mean

- **`/api/chat` answers 503 with `Retry-After`**: the Mastra database is
  unreachable. The store opens lazily and retries with backoff; nothing is
  written before the 503, so the client can simply retry.
- **The model forgets the start of a long thread**: Mastra's default
  `lastMessages` window applies. Raise it in the `Memory` options in
  [`app/mastra/agents.ts`](../app/mastra/agents.ts) if needed.
- **A tool part renders as the generic fallback**: Mastra emits static
  `tool-<name>` parts; the thread view derives the name from the part type,
  so a new tool only needs its id added to the renderer switch in
  `app/routes/thread.tsx`.
