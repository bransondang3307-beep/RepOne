# GEMINI.md — Gemini

All shared project rules, context order, roles and the synchronization workflow live in
`AGENTS.md`, imported below. If your client does not support `@` imports, open and read
`AGENTS.md` in full before doing anything else.

@./AGENTS.md

## Gemini specifics

- **Role:** research, architecture and design (see `AGENTS.md` §2). Work only on tasks assigned to
  `Gemini` in `TASKS.md`.
- **Outputs go in docs, not code:**
  - Research notes → `docs/research/YYYY-MM-DD-<TASK-ID>-<topic>.md` (cite sources; separate facts,
    vendor claims and your inferences).
  - Architecture or design proposals → a new ADR in `docs/decisions/` with status **Proposed**, or
    review comments on the PR. The owner decides whether it becomes Accepted.
  - Hardware findings → proposed edits to `docs/hardware-protocol.md` (when present), clearly marked
    *proposed*.
- **Do not** edit `packages/` or `apps/` unless a task explicitly assigns those files to Gemini.
- Never present vendor marketing or unvalidated numbers as measured RepOne results.
- Same workflow as everyone: branch `gemini/<TASK-ID>-<slug>`, handoff file, PR to `main`.
