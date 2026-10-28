# RepOne Agent Instructions

> **Canonical shared instructions for every agent** (Claude Code, OpenAI Codex, Gemini, ChatGPT)
> and human collaborators. `CLAUDE.md` and `GEMINI.md` import this file; ChatGPT uses
> [`docs/agents/CHATGPT.md`](docs/agents/CHATGPT.md). Change project-wide rules **here only**.

Read [`REPONE_SOURCE_OF_TRUTH.md`](./REPONE_SOURCE_OF_TRUTH.md) before making plans or code changes. This is the canonical product, hardware, software, safety, and collaboration context.

Before coding, inspect the repository and state what is actually implemented. Do not confuse planned features with verified functionality. Prefer small testable tasks, maintain sensor units and data provenance, and do not modify active gym equipment with experimental mounts.

After every task, report: objective, files changed, tests executed/results, remaining risks, and next task. Record consequential decisions and obtain owner approval before changing scope or architecture.

## 1. Shared context — read in this order at the start of every session

1. `AGENTS.md` (this file) — rules and workflow.
2. [`REPONE_SOURCE_OF_TRUTH.md`](REPONE_SOURCE_OF_TRUTH.md) — product, hardware, safety, data honesty.
3. [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — what is merged and verified on `main`, open branches, blockers.
4. [`TASKS.md`](TASKS.md) — task IDs, owners, priorities, completion criteria. **Only work on a task assigned to you.**
5. The newest files in [`docs/handoffs/`](docs/handoffs/) — what the last agent did and recommends.
6. Architecture docs on your base branch: `docs/architecture.md` (if present), `docs/decisions/` (ADRs), `README.md`.

Precedence when sources disagree: **owner's explicit decision** > `REPONE_SOURCE_OF_TRUTH.md` >
accepted ADRs > `docs/architecture.md` > `PROJECT_STATUS.md` / `TASKS.md` > handoffs.
Code and test results beat any document about what is *implemented*. Report conflicts; never resolve them silently.

## 2. Roles

| Agent | Role | Typically does | Does not |
|---|---|---|---|
| **Claude Code** | Main software developer | Implements tasks, integrates modules, writes tests for its changes, opens PRs, writes handoffs | Merge its own PR without review; change contracts without an ADR |
| **OpenAI Codex** | Testing, debugging, code review | Reviews every code PR, adds/strengthens tests, reproduces and fixes bugs on its own branch | Rewrite features under review; change behaviour without a task |
| **Gemini** | Research, architecture, design | Sensor/hardware research, architecture and UX critique, proposes ADRs (status *Proposed*) and design docs | Edit `packages/` or `apps/` code unless a task assigns it |
| **ChatGPT** | Project management, roadmap coordination | Sets priorities and sequencing, proposes new tasks, assignments and other roadmap changes, prepares agent prompts, checks that status-update PRs match the merged work | Push code (the owner, or an agent acting at the owner's direction, commits its roadmap proposals); write status updates |
| **Owner** (human) | Final authority | Approves scope/architecture, merges PRs, physical hardware and device testing | — |

Ownership of paths is assigned per task in `TASKS.md` ("Files" column). One agent per file at a time.
`REPONE_SOURCE_OF_TRUTH.md` changes only with owner approval.

### Review guidelines

Codex follows this section when it reviews a pull request on GitHub (automatically when the PR is opened,
and again on each `@codex review` comment). The full hand-off: [`docs/automation/claude-codex-workflow.md`](docs/automation/claude-codex-workflow.md).

- Review what the PR changes at its **head commit**, and name that commit SHA in the review.
- Report each finding as `[P0]`–`[P3]` with `file:line`, what is wrong, why it matters and a concrete fix.
  Report **P2 findings too**, not only P0/P1.
  - **P0:** secret exposure, data loss, security hole, or the build/tests are broken.
  - **P1:** correctness bug; rep-counting algorithm, sensor units or data contracts changed without an ADR;
    module-boundary violation; simulated/synthetic data presented as real; any AI API key or token, paid AI
    service, AI action or AI SDK dependency added (`npm run check:workflows` must stay green).
  - **P2:** missing or weak tests for changed behaviour, unclear error handling, docs out of sync with code.
  - **P3:** optional suggestion — mark it non-blocking.
- GitHub Actions changes: read-only workflow defaults, write scopes only on the job that needs them with a
  `# least-privilege: <reason>` comment, no `pull_request_target`/`workflow_run`, no merge/approve/force-push paths
  or actions, third-party actions only via `.github/workflow-policy.json` (SHA-pinned), untrusted input via `env:`.
- Never approve, merge or push. With no findings, say so explicitly: "No P0–P2 findings at `<sha>`."

## 3. Synchronization workflow (every task)

1. **Sync first.** `git fetch origin --prune` and read the latest `main` versions of the files in §1.
   Base new work on `origin/main` unless the task says otherwise (e.g. a stacked branch).
2. **Claim.** Confirm the task is assigned to you in `TASKS.md` and its dependencies are done.
   If it is not assigned, stop and ask the owner/ChatGPT — do not self-assign silently.
3. **Branch.** `<agent>/<TASK-ID>-<short-slug>`, e.g. `claude/RO-012-device-connection`,
   `codex/RO-007-review-m1`, `gemini/RO-015-serial-schema`. Never commit directly to `main`.
4. **Work small.** Stay inside the task's files. Commit messages start with the task ID:
   `RO-012: add device connection interface`.
5. **Test.** Run the relevant checks and record the exact output summary:
   - `npm run verify` when it exists (boundaries + workflow policy + typecheck + tests), otherwise
   - `npm run typecheck && npm test`
   - Docs-only change: state "docs only — no code tests required" and still run `npm test` if any config changed.
   Never report a test as passing unless it was executed in this session.
6. **Handoff.** Add `docs/handoffs/YYYY-MM-DD-<agent>-<TASK-ID>.md` from
   [`docs/handoffs/TEMPLATE.md`](docs/handoffs/TEMPLATE.md) (changes, commit IDs, tests, risks, next steps).
7. **Pull request.** Push the branch and open a PR to `main` using the PR template. In `TASKS.md`,
   set only *your* task row to `in-review` with the PR link. Code PRs need a Codex review
   (or the owner's) before merge; CI must be green. Claude ↔ Codex hand-off (no AI API keys):
   [`docs/automation/claude-codex-workflow.md`](docs/automation/claude-codex-workflow.md) — Codex reviews on GitHub,
   `@codex review` after each fix push, at most two fix rounds, CI and the review must cover the head commit.
8. **Merge.** The owner merges (or explicitly delegates merging).
9. **Status update, after merge only** (owner decisions of 2026-10-15 and 2026-10-28; ADR 0004). Once the work
   PR is merged and CI on `main` is green:
   - **By default, the agent that completed the work opens its own status-update PR.** It sets its `TASKS.md`
     row(s) to `done` with the merge commit and the work PR's link. It also moves the matching `PROJECT_STATUS.md`
     entries from "Open branches / PRs" to the merged sections, with the evidence.
   - One status-update PR may cover several of that agent's tasks, and it may include a handoff. Without one,
     put `[no-handoff]` in its title.
   - **Exceptions.** Claude Code may record three kinds of status that are not its own: the owner's device checks,
     Codex review tasks, and closeouts the owner explicitly directs. Each links its supporting evidence. Only these
     exceptions let one agent change another agent's (or the owner's) task status.
   - Sync with the latest `origin/main` first. If another status-update PR changed the same section, keep both
     entries; never delete another agent's row.
   - ChatGPT does not write status updates. Unmerged work is listed only under "Open branches / PRs", never as
     completed.

## 4. Status vocabulary

Use exactly: `todo` · `in-progress` · `in-review` · `done` · `blocked`.
Describe software as **implemented** (code exists), **verified** (tests/checks executed and passing, say which),
**planned**, or **speculative**. Simulated/synthetic results must be labelled as such.

## 5. Rules that protect the project

- Do not change the rep-counting algorithm, sensor units, or data contracts without an assigned task and an ADR.
- Breaking interface changes: ADR in `docs/decisions/` + note in the PR + review by every affected owner.
- **Rebrandable naming (owner rule, 2026-10-16; ADR 0006):** "RepOne" is a temporary development name. Never
  hardcode the product name in user-facing text — read it from the app's single brand configuration. Keep core
  packages and domain logic brand-free, and give new identifiers neutral names (code symbols, storage keys, file
  names, protocol/wire fields, device names, event names). Do **not** rename existing identifiers (`@repone/*`
  packages, repository and paths, `repone` slug/scheme, `repone.db`, `REPONE_SOURCE_OF_TRUTH.md`) until the owner
  explicitly instructs it.
- ADR numbers are global across branches: check open branches (`git branch -r`) before picking the next number.
- Never commit secrets, API keys, `.env` files, personal health data, or identifying gym photos.
- **Zero additional AI API cost (owner rule, 2026-10-17; ADR 0005):** development uses subscriptions only — Claude
  Code (Claude Pro), Codex (ChatGPT Plus), Gemini (Google AI Pro). Never add AI API keys or tokens, paid AI services,
  AI actions or AI SDK dependencies; `npm run check:workflows` enforces this in CI. Changing it needs the owner and an ADR.
- Do not edit files another agent's open PR is changing; coordinate via `TASKS.md` / the owner.
- Keep `TASKS.md` edits to your own task row(s), apart from the status-update exceptions in §3 step 9.
- New tasks, priorities and assignments are roadmap changes. ChatGPT proposes them, and the owner, or an agent
  acting at the owner's direction, commits them. Agents may propose tasks in their handoffs.
