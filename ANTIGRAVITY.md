# RepOne — Google Antigravity entry point

Start with [Windows setup](docs/agents/ANTIGRAVITY_WINDOWS_SETUP.md), then read the
[Antigravity session instructions](docs/agents/ANTIGRAVITY.md).

`AGENTS.md` remains the canonical shared policy. This file does not replace it,
`CLAUDE.md`, `GEMINI.md`, or `docs/agents/CHATGPT.md`. Codex already uses `AGENTS.md`;
there is no separate `CODEX.md` on the inspected `main`.

**Activation:** `ANTIGRAVITY.md` is a manual entry point, not a documented automatic
rule filename. Open the repository root in Antigravity and explicitly attach/read
this file and `docs/agents/ANTIGRAVITY.md` at the start of each session. Confirm the
agent has read `AGENTS.md`, the source of truth, current status/tasks, and handoffs.
Do not assume Markdown links or another client's `@` imports expanded successfully.

Antigravity is the local workspace on the owner's Lenovo Windows laptop. It does
not acquire Claude Code's implementation tasks or Codex's independent reviewer
role by using a particular model. Default to Gemini's research/design scope;
implementation requires an explicit owner assignment naming the task and files.
Owner merges and physical device/hardware tests remain with the owner.

Prepared 2026-10-16 as an owner-requested RO-004 onboarding follow-up. Existing
agent policies, task rows, architecture, runtime configuration, and milestones
are unchanged. This guide is not evidence that the laptop or Expo Go is working.
