# Google Antigravity — RepOne session instructions

Use with [Lenovo Windows onboarding](ANTIGRAVITY_WINDOWS_SETUP.md). Shared project
rules live in [AGENTS.md](../../AGENTS.md); changes to shared policy belong there
through a coordinated PR, not a competing copy here.

## Role and scope

Antigravity is an editor/agent environment, not a replacement project coordinator.
Preserve the roles in `AGENTS.md`: Claude Code implements; Codex tests, debugs and
reviews; Gemini researches architecture/design; ChatGPT coordinates; the owner
approves scope, merges, and tests devices/hardware. Use Gemini's documentation and
research scope by default. An owner assignment may explicitly authorize a different
task and file set; record that assignment without silently taking another agent's work.

For task-board identity, use the assigned agent name, not the model currently
selected in Antigravity. Research assigned to Gemini uses `gemini/<TASK-ID>-<slug>`;
Codex work uses `codex/...`; a new Antigravity task identity requires an explicit
owner/ChatGPT assignment. Never claim an independent review of your own implementation.

## Read and sync before every task

1. Check `git status --short --branch`, repository root, remotes, and current commit.
   If files are dirty or another agent is working in this checkout, preserve them.
   Agree file ownership before switching branches. Use a separate checkout for
   concurrent agent work; one shared directory has one active branch for everyone.
2. Fetch with `git fetch origin --prune`. Read current `origin/main` versions of
   `AGENTS.md`, `REPONE_SOURCE_OF_TRUTH.md`, `PROJECT_STATUS.md`, `TASKS.md`, newest
   `docs/handoffs/` files, accepted ADRs, and `README.md`, in the shared reading order.
   Inspect open PRs and their handoffs too: status documents may lag GitHub.
3. Read this guide explicitly. Read `apps/mobile/AGENTS.md` before mobile work.
   Inspect actual paths and scripts: the current routes are `apps/mobile/app/`;
   the mobile instruction's generic `src/app/` statement conflicts with the tree.
   Report that discrepancy; do not move routes as an onboarding step.
4. State implemented vs planned behavior, your task ID, assigned agent, allowed files,
   base SHA, and dependencies. Stop unassigned implementation and ask the owner/
   ChatGPT to assign it. Read-only orientation is allowed without taking a task.

Follow the precedence in `AGENTS.md`; owner decisions supersede repository plans.
Code and executed tests establish implementation, not a handoff's aspirations.

## Architecture and milestone guardrails

At inspected `main` `75e2814`, `apps/mobile` uses Expo Router, Zustand, expo-sqlite
and `@repone/core` through its public API. Core is pure TypeScript with injected
drivers/clock/scheduler/IDs. Keep units and provenance explicit. No new framework,
dependency migration, detector tuning, sensor contract change, or native project
generation is part of onboarding.

PR #3 (`sprint-1-alignment`) proposes/implements the split into `sensor-contracts`,
`rep-engine`, `workout-domain` and the mobile application/features/shared/
infrastructure layers. It was still open at inspection. Preserve its direction
and inspect its ADR 0003 when working on that branch; do not treat it as merged
or reproduce its restructure on another branch. RO-008 addresses its ownership
table separately. Milestones 2–5 are Sprint 1 alignment work, gated by previous
merges and owner approval; Sprint 2 has not started.

Rep data remains simulated. No verified real sensor-to-app path, hardware accuracy,
or owner Expo Go success is established by these documents. Keep those gates open.

## Work, review, and handoff

- Confirm the task is assigned in `TASKS.md` and no open PR owns the same files.
  An explicit owner instruction for a documentation follow-up can name that scope;
  record it in the handoff and coordinate the board entry rather than editing a
  task board already owned by another open PR.
- Create the assigned agent's task branch from `origin/main`, unless explicitly
  assigned a different base. Never commit to `main`. Prefix commits with the task ID.
- Run `npm run verify` if defined, otherwise `npm run typecheck` then `npm test`.
  In PowerShell, check each exit code and stop after failure. Record commands,
  counts, failures, and environment. Docs-only changes follow `AGENTS.md`'s docs
  exception; configuration changes require its additional test check.
- Add a dated handoff using `docs/handoffs/TEMPLATE.md`, including assignment,
  branch/base, changes, checks, limitations and the exact next task.
- Inspect the diff, stage only assigned paths, push the branch, and open a PR to
  `main` using `.github/pull_request_template.md`. Record the PR URL in the handoff
  and only your task row when it is safe to update it. Code PRs require independent
  Codex or owner review and green CI before the owner merges.
- Never mark unmerged work `done`. After merge and green CI on `main`, follow the
  current shared status-update procedure. PR #2 records the owner's decision that
  each agent opens its own status PR and ChatGPT coordinates the roadmap. Preserve
  that decision; do not update other agents' rows or silently reconcile stale status.

Use exactly `todo`, `in-progress`, `in-review`, `done`, `blocked` for task status.
Report objective, files changed, actual checks/results, risks, and next task.

## Safety boundaries

- Review proposed terminal actions and file changes in Antigravity. Keep execution
  approval enabled; onboarding does not authorize unrestricted autonomous commands.
- Never reset, clean, force-push, discard edits, delete branches, or overwrite another
  agent's changes to make synchronization succeed. Resolve conflicts visibly.
- Never commit tokens, `.env`, health data, identifying gym photos, or local account
  settings. Authenticate in the official sign-in UI; do not paste passwords into chat.
- No API keys, paid automation, deployments, EAS publishing, firmware flashing, or
  production migrations are authorized by this setup task.
- RO-019 / PR #4 is paused per the owner's decision, also recorded in open PR #5.
  Do not enable `AI_LOOP_MODE`, add loop secrets, resume the loop, or merge PR #4.
  Resume gate: real sensor movement reaches the mobile app and rep counting works;
  then owner confirmation plus exact-head CI and outstanding safeguard/state reviews.
- Hardware stays on a controlled unloaded rig. Verify components and voltage before
  wiring, disconnect USB while wiring, and do not attach prototypes to active gym equipment.

## First prompt to paste into Antigravity

```text
Open RepOne on my Lenovo Windows laptop. Read ANTIGRAVITY.md and
docs/agents/ANTIGRAVITY.md explicitly, then the current shared files in AGENTS.md's
reading order and relevant open PRs. Start with a read-only setup audit: report the
actual repository path, dirty files, branch/SHA, Node/npm/Git versions, package
scripts, merged vs unmerged architecture, and the next assigned task. Preserve
Claude/Codex/Gemini/ChatGPT roles, RO-007 owner Expo Go testing, and the RO-019 pause.
Do not install, edit code, switch a dirty checkout, resume automation, or merge.
Give me the next setup command justified by what you actually observed.
```
