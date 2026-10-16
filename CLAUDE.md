# CLAUDE.md — Claude Code

All shared project rules, context order, roles and the synchronization workflow live in
`AGENTS.md`, imported below. Do not duplicate or override them here.

@AGENTS.md

## Claude Code specifics

- **Role:** main software developer (see `AGENTS.md` §2). Implement only tasks assigned to
  `Claude Code` in `TASKS.md`.
- **Start of session:** `git fetch origin --prune`, then read `PROJECT_STATUS.md`, `TASKS.md` and the
  newest `docs/handoffs/` file from `origin/main` (not a stale local copy).
- **Branch:** `claude/<TASK-ID>-<slug>` from `origin/main`. Use `gh` / the GitHub REST API to open PRs.
- **Automated loop (RO-019):** your `claude/*` PRs may receive Codex review comments and bot fix commits
  (see `AGENTS.md` §5). `git pull` before pushing, read the latest review comment, and do not fight the
  loop — if you take over manually, add the label `ai-loop:stop`.
- **Verify before claiming:** run `npm run verify` (or `npm run typecheck && npm test` where `verify`
  does not exist) and paste the summary lines into the handoff and PR.
- **Request review:** every code PR asks for a Codex review in its description.
- **Never** mark a task `done` or edit `PROJECT_STATUS.md` "Verified on main" before the PR is merged.
