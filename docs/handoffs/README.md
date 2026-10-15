# Handoffs

Every task ends with a handoff file so the next agent (or the owner) can continue without
re-reading the whole conversation. Process: `AGENTS.md` §3 step 6.

- **Name:** `YYYY-MM-DD-<agent>-<TASK-ID>.md`, e.g. `2026-10-16-codex-RO-006.md`
  (`agent` = `claude`, `codex`, `gemini`, `chatgpt` or `owner`). For a second handoff on the same
  task and day, add a suffix: `YYYY-MM-DD-<agent>-<TASK-ID>-<slug>.md`.
- **Template:** [`TEMPLATE.md`](TEMPLATE.md). Required: changes, files, commit IDs, PR link,
  exact test results, risks, next steps, owner questions.
- **Commit IDs:** list the branch commits. If the handoff is written before the final commit,
  add it in a follow-up commit on the same branch so the recorded IDs stay correct.
- **CI check:** pull requests must add or update a file here (the `handoff` job in
  `.github/workflows/ci.yml`). Put `[no-handoff]` in the PR title only for trivial changes
  such as typo fixes, and say why in the PR description.
- Handoffs are history: do not rewrite old ones; correct them with a new handoff.

## Index (newest first)

| Date | Agent | Task | File |
|---|---|---|---|
| 2026-10-15 | Claude Code | RO-004 follow-up: owner decision on status updates | [2026-10-15-claude-RO-004-owner-decision.md](2026-10-15-claude-RO-004-owner-decision.md) |
| 2026-10-15 | Claude Code | RO-004 multi-agent sync setup | [2026-10-15-claude-RO-004.md](2026-10-15-claude-RO-004.md) |
| 2026-10-15 | Claude Code | Sprint 1 (RO-001/RO-002) | [2026-10-15-sprint-1-handoff.md](2026-10-15-sprint-1-handoff.md) (pre-template) |
