# Chat Tool-Calling Troubleshooting

## Duplicate provider item ID (`fc_*`) error

### Symptom

`AI_APICallError: Duplicate item found with id fc_...` from the provider API.

### Why this happens

This occurs when a request payload contains duplicate provider item references (often from prior tool-call history/memory replay).

In this app, repeated tool-driven prompts in the same conversation (for example multiple `create_note` requests) can surface the issue if stale provider item IDs are replayed.

### Guardrails implemented in this codebase

1. Send only the latest `user` message into `agent.streamText(...)` in [`app/routes/api-chat.ts`](../app/routes/api-chat.ts), so assistant/tool parts are not re-submitted as fresh input.
2. If this exact duplicate-item error occurs, clear VoltAgent memory for that conversation once and retry in [`app/routes/api-chat.ts`](../app/routes/api-chat.ts).
3. Persist stable message IDs by setting `id: msg.id` on message create in [`app/models/thread.server.ts`](../app/models/thread.server.ts).

### Operational note

The retry-and-clear behavior is a resilience fallback, not the primary strategy. Preferred design is preventing duplicate provider item IDs from entering replayed conversation history.
