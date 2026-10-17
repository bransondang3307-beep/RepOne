# Handoff — RO-019: Claude Code ↔ Codex workflow at zero additional AI API cost

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-17 |
| **Task** | RO-019 (owner-approved redesign, 2026-10-17) |
| **Branch** | `claude/RO-019-zero-cost-workflow` (base: `main` @ `cd884fc`) |
| **Commits** | `127d6d5` RO-019: zero-additional-API-cost Claude Code <-> Codex workflow · handoff + PR link (see the PR's commit list) |
| **Pull request** | [PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11) → `main` (replacement PR; open, **not merged**) |
| **Status** | implemented; verified (local Linux + GitHub Actions Linux and native Windows); awaiting Codex review and owner merge |

## Objective
Redesign RO-019 so Claude Code and Codex collaborate with **$0 separately billed AI API usage**:
- Keep PR #4 as an archive of the API-powered design, and open a separate replacement PR.
- GitHub Actions handles testing and CI.
- Claude hand-offs are manual (Auto-fix off).
- Codex uses its GitHub code review: automatic on PR creation, `@codex review` for re-reviews.
- Least-privilege Actions permissions instead of a blanket write ban.
- CI policy tests detect prohibited AI API integrations.

## What changed
- **Policy checker** `scripts/check-workflow-policy.mjs`, run as `npm run check:workflows`:
  - It runs inside `npm run verify` and as a named CI step.
  - It scans `.github/workflows/*`, `.github/actions/**/action.y(a)ml` and every workspace `package.json`.
  - 11 rules:
    - AI integrations: `ai-action`, `ai-credential`, `ai-endpoint`, `ai-cli`, `ai-dependency`.
    - Secrets: `secret` (only `GITHUB_TOKEN`).
    - Least privilege, `permissions`: workflow-level read-only, no `write-all`, and job-level writes need
      `# least-privilege: <reason>`.
    - Safe automation: `trigger`, `merge-or-approve`, `script-injection`, `unpinned-action`.
  - Zero dependencies, CRLF-safe and separator-safe (RO-021 lessons).
- **Regression tests** `scripts/check-workflow-policy.test.mjs`: 19 tests, run by `npm run test:scripts`.
  - Each AI integration type is covered.
  - A reduced copy of PR #4's paid workflows serves as a negative control.
  - Also covered: secrets, least privilege (rejected and justified-accepted cases), triggers, merge/approve,
    injection, pinning, CRLF and Windows paths.
- **CI** (`.github/workflows/ci.yml`): adds the `workflow_dispatch` trigger (manual re-run) and the
  "Workflow policy" step. The existing jobs are otherwise unchanged; no secrets, permissions remain `contents: read`.
- **Docs:**
  - `docs/automation/claude-codex-workflow.md`: principles, billing table, per-PR loop, comment conventions, merge
    gate, copy-paste prompts, policy rules, owner $0 checklist, troubleshooting, options not enabled.
  - `docs/automation/future-api-loop.md`: the archived v1 design, its nine security lessons, costs, PR #5's
    open concerns and revival prerequisites.
  - **ADR 0005** "Claude Code ↔ Codex collaboration at zero additional AI API cost". It reuses the number of
    PR #4's never-accepted draft; the reason is stated in the ADR.
- **Agent rules:**
  - `AGENTS.md`: "Review guidelines" (in §2) for Codex — P0–P3 with file:line, report P2 too, the zero-cost and
    least-privilege checks, never approve. Also step 7 hand-off pointer, a zero-cost rule in §5, and the
    `verify` description.
  - `CLAUDE.md`: how Claude addresses findings.
  - PR template: zero-cost checkbox and "Reviewed head SHA / fix rounds".
  - `README.md` and `docs/architecture.md` §5: what `verify` runs.
- **`TASKS.md`:** RO-019 row and details (`in-review`); next free ID → RO-023.
- **Not changed:** application, packages and their tests; PR #4 and its branch (archive); PR #5.

## Files changed
- Added: `scripts/check-workflow-policy.mjs`, `scripts/check-workflow-policy.test.mjs`,
  `docs/automation/claude-codex-workflow.md`, `docs/automation/future-api-loop.md`,
  `docs/decisions/0005-zero-cost-claude-codex-collaboration.md`, this handoff.
- Modified: `.github/workflows/ci.yml`, `package.json` (scripts only), `AGENTS.md`, `CLAUDE.md`,
  `.github/pull_request_template.md`, `README.md`, `docs/architecture.md`, `TASKS.md`.

## Tests and checks (exact results)

Run in this session on Linux, Node 22.22.0, npm 10.9.4, on `127d6d5`:

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run verify` | exit 0. `✓ module boundaries OK (58 files checked, no circular imports)`; `✓ workflow policy OK (1 workflow, 0 action, 5 package files: no AI API integrations, least-privilege permissions)`; typecheck clean; script tests **27/27** (8 boundaries + 19 policy); Jest **48/48** (app 15, rep-engine 16, sensor-contracts 13, workout-domain 4) |
| `npm run test:scripts` | exit 0, tests 27, pass 27, fail 0 |
| **Negative control:** `node scripts/check-workflow-policy.mjs` on PR #4's real tree (`af8acd9`) | **exit 1, 23 violations:** 2 `ai-action` (`openai/codex-action`, `anthropics/claude-code-action`), 10 `ai-credential`, 4 `secret` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`), 7 `permissions` (job-level writes without a least-privilege reason) |
| Rule-coverage mutation: each of the 11 rules disabled in turn in a temporary copy | every mutation made tests fail (1–4 failing tests each) |
| Injection into a copy of the real `ci.yml` | `openai/codex-action` + key → `ai-action`, `ai-credential`, `secret`; Claude CLI + `CLAUDE_CODE_OAUTH_TOKEN` → `ai-cli`, `ai-credential`, `secret`; Gemini endpoint → `ai-endpoint`; `write-all` → `permissions`; `pull_request_target` → `trigger`; job `contents: write` without reason → `permissions` (all exit 1) |
| `git merge-tree` with open PRs | clean with #2, #6, #7, #8; `TASKS.md`-only conflicts with #5, #9, #10 (rows after RO-018 / next-ID line; all mine; #5 is superseded); `ci.yml` auto-merges with #10 |

On GitHub Actions:

| Run | Result |
|---|---|
| **Native Windows + Linux preview** [38988635946](https://github.com/bransondang3307-beep/RepOne/actions/runs/38988635946): branch `claude/RO-022-preview-ro019` = `127d6d5` + PR #10's Windows job, plus a push trigger (preview only) | Windows (Node 24, autocrlf): `npm run test:scripts` ✅. That includes the 19 policy tests and the real-repo policy check on a CRLF checkout. `check:boundaries` ✅ (38 s). Linux: `npm ci`, boundaries, **Workflow policy step**, typecheck, `npm test` all ✅ (45 s). The combined `ci.yml` passes the policy locally too. |
| PR #11 CI on `4afba32`, run [38988785355](https://github.com/bransondang3307-beep/RepOne/actions/runs/38988785355) | **success**: npm ci, boundaries, **Workflow policy step**, typecheck, tests, handoff check. The final head's run is reported on the PR. |

Environment notes:
- `actionlint` was not run (not installed); the YAML parses and CI executed it.
- I cannot read repository secrets, variables or billing (those API endpoints are blocked here). The owner checks
  them using `claude-codex-workflow.md` §7.

## Decisions / ADRs
- ADR 0005 (Accepted on merge): subscription-only AI collaboration, AI-free CI, a policy enforced in CI, least
  privilege, and PR #4 archived.

## Known limitations / risks
- The checker is line-based, not a YAML parser. It covers the patterns used in this repository and is conservative;
  exotic YAML (anchors, multi-document files) could evade or false-trigger it. Codex review is the second line.
- Credential detection is name-based. A key under a neutral name (e.g. `MY_KEY`) is still caught by the `secret`
  rule if it comes from secrets. A hard-coded literal key would only be caught by secret scanning or review.
- The round cap and the merge gate are process rules (no branch protection on GitHub Free private repositories).
- Codex re-review is manual (`@codex review`). Its GitHub reviews default to P0/P1 only; the Review guidelines ask
  for P2. Whether Codex follows them must be confirmed on the first reviews.
- The **archive tag was not created**: the environment's proxy refused `git push` of
  `refs/tags/archive/RO-019-api-loop-v1` (HTTP 403, three tries). PR #4's branch and PR still preserve the code. The
  owner can create the tag (commands in Next steps).
- The new preview branch `claude/RO-022-preview-ro019` cannot be deleted from here (same proxy rule). The owner
  deletes it, together with the three `claude/RO-022-preview-*` branches from RO-022.

## Next steps
1. **Codex:** review this PR (automatic on open; `@codex review` otherwise). Scope: the policy checker and its
   tests, `ci.yml`, docs.
2. **Owner:** the account checks in `docs/automation/claude-codex-workflow.md` §7 (secrets, `AI_LOOP_MODE`, Actions
   budget $0, Codex review on, no credits, extra usage off, CLI auth).
3. **Owner, optional, from any clone with push rights:**
   ```
   git fetch origin claude/RO-019-claude-codex-loop
   git tag -a archive/RO-019-api-loop-v1 af8acd9 -m "Archive: RO-019 v1 API-powered review loop (PR #4)"
   git push origin archive/RO-019-api-loop-v1
   ```
4. **Owner:** merge decision. **Only after this merges:** close PRs #4 and #5 unmerged, keeping their branches.
   Then Claude resolves the `TASKS.md` conflicts in PRs #9 and #10.
5. **Claude Code:** resume Milestone 2 (RO-012) on `claude/RO-012-…` from the updated `main`.

## Questions for the owner
- none
