# Handoffs

Every task ends with a handoff file so the next agent (or the owner) can continue without
re-reading the whole conversation. Process: `AGENTS.md` §3 step 6.

- **Name:** `YYYY-MM-DD-<agent>-<TASK-ID>.md`, e.g. `2026-10-16-codex-RO-006.md`
  (`agent` = `claude`, `codex`, `gemini`, `chatgpt` or `owner`). For another handoff on the same task, or one
  covering several tasks, add a short slug: `YYYY-MM-DD-<agent>-<TASK-ID>-<slug>.md`,
  e.g. `2026-10-23-claude-RO-003-m1-closeout.md`.
- **Template:** [`TEMPLATE.md`](TEMPLATE.md). Required: changes, files, commit IDs, PR link,
  exact test results, risks, next steps, owner questions.
- **Commit IDs:** list the branch commits. If the handoff is written before the final commit,
  add it in a follow-up commit on the same branch so the recorded IDs stay correct.
- **CI check:** pull requests must add or update a file here (the `handoff` job in
  `.github/workflows/ci.yml`). Put `[no-handoff]` in the PR title only in two cases, and say why in the PR
  description:
  - trivial changes, such as typo fixes;
  - a status-update PR whose merged work PRs' handoffs already cover it (`AGENTS.md` §3 step 9). A status-update
    PR may instead add its own handoff, e.g. when it covers several tasks or an exception.
- Handoffs are history: do not rewrite old ones; correct them with a new handoff.

## Index (newest first)

| Date | Agent | Task | File |
|---|---|---|---|
| 2026-10-31 | Claude Code | RO-030 mobile UI redesign: light/dark design system, tabs, dashboard, live set, history | [2026-10-31-claude-RO-030-ui-redesign.md](2026-10-31-claude-RO-030-ui-redesign.md) |
| 2026-10-31 | Claude Code | Milestone 2 closeout status (PRs #21, #14–#17 merged after the owner's device check; ADR 0007 Accepted); RO-013 plan; RO-028 and RO-029 recorded | [2026-10-31-claude-RO-012-m2-closeout-status.md](2026-10-31-claude-RO-012-m2-closeout-status.md) |
| 2026-10-29 | Claude Code | RO-027 dependency security patch (PR #21) | [2026-10-29-claude-RO-027-dependency-security.md](2026-10-29-claude-RO-027-dependency-security.md) |
| 2026-10-23 | Claude Code | RO-012 part 4: app device integration, RO-023 badge fix (PR #17) | [2026-10-23-claude-RO-012-app-device.md](2026-10-23-claude-RO-012-app-device.md) |
| 2026-10-23 | Claude Code | RO-012 part 3: `DeviceConnection` and `SimulatedDevice` (PR #16) | [2026-10-23-claude-RO-012-device-connection.md](2026-10-23-claude-RO-012-device-connection.md) |
| 2026-10-23 | Claude Code | RO-012 part 2: channels and the per-channel rep engine (PR #15) | [2026-10-23-claude-RO-012-channel-rep-engine.md](2026-10-23-claude-RO-012-channel-rep-engine.md) |
| 2026-10-23 | Claude Code | RO-012 part 1: sensor error states (PR #14) | [2026-10-23-claude-RO-012-sensor-error-states.md](2026-10-23-claude-RO-012-sensor-error-states.md) |
| 2026-10-28 | Claude Code | Milestone 1 closeout batch, consolidated status update (PRs #13, #19, #9, #8, #6, #7 merged; PR #2 closed); handoff to ChatGPT | [2026-10-28-claude-RO-003-m1-closeout-status.md](2026-10-28-claude-RO-003-m1-closeout-status.md) |
| 2026-10-28 | Claude Code | RO-004 follow-up: status-update ownership (owner decision 2026-10-28), ADR 0004 Accepted; supersedes PR #2 | [2026-10-28-claude-RO-004-status-ownership.md](2026-10-28-claude-RO-004-status-ownership.md) |
| 2026-10-23 | Claude Code | Milestone 1 closeout (RO-003…RO-007, RO-023) | [2026-10-23-claude-RO-003-m1-closeout.md](2026-10-23-claude-RO-003-m1-closeout.md) |
| 2026-10-22 | Claude Code | RO-019 / RO-022 post-merge status update | [2026-10-22-claude-RO-019-RO-022-status.md](2026-10-22-claude-RO-019-RO-022-status.md) |
| 2026-10-17 | Claude Code | RO-019 zero-cost Claude Code ↔ Codex workflow | [2026-10-17-claude-RO-019-zero-cost.md](2026-10-17-claude-RO-019-zero-cost.md) |
| 2026-10-16 | Codex | RO-004 follow-up: Antigravity onboarding (refreshed 2026-10-28) | [2026-10-16-codex-RO-004-antigravity.md](2026-10-16-codex-RO-004-antigravity.md) |
| 2026-10-16 | Gemini | RO-011 Milestone 1 architecture review | [2026-10-16-gemini-RO-011.md](2026-10-16-gemini-RO-011.md) |
| 2026-10-16 | Claude Code | RO-020 rebrandable naming rule and ADR 0006 (refreshed 2026-10-28) | [2026-10-16-claude-RO-020.md](2026-10-16-claude-RO-020.md) |
| 2026-10-16 | Claude Code | RO-021 Windows path fix: native-Windows evidence (refreshed 2026-10-28) | [2026-10-16-claude-RO-021.md](2026-10-16-claude-RO-021.md) |
| 2026-10-16 | Claude Code | RO-022 Windows CI job | [2026-10-16-claude-RO-022.md](2026-10-16-claude-RO-022.md) |
| 2026-10-15 | Claude Code | RO-005 Milestone 1 PR | [2026-10-15-claude-RO-005.md](2026-10-15-claude-RO-005.md) |
| 2026-10-15 | Claude Code | RO-004 multi-agent sync setup | [2026-10-15-claude-RO-004.md](2026-10-15-claude-RO-004.md) |
| 2026-10-15 | Claude Code | Sprint 1 (RO-001/RO-002) | [2026-10-15-sprint-1-handoff.md](2026-10-15-sprint-1-handoff.md) (pre-template) |
