# The Thread is the source of truth; Thread memory is a cache

Chat history lives in two databases: the Thread's messages in the app database (Prisma) and Thread memory in the Mastra database. We treat the Thread as the only source of truth and Thread memory as a cache that can be dropped and rebuilt from it at any time. Regenerate, a failed save, and deleting a Thread all forget Thread memory instead of trying to patch it, and a Turn rebuilds it from the Thread when it is missing. We chose this over making Mastra memory the source of truth (it would hold what the user sees, so its outages and schema changes would become data loss) and over keeping the two as peers kept in sync (every write path would need to update both, and any drift would have no tiebreaker).

## Consequences

- Never sync the two databases as peers or copy data from Thread memory back into the Thread.
- Wiping or migrating the Mastra database loses nothing the user can see; the next Turn on each Thread rebuilds its memory.
- Rebuilt memory holds only text parts, so tool calls from earlier Turns are not part of the model's context after a rebuild.
