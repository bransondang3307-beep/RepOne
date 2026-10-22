# Handoff — RO-019: Claude Code ↔ Codex workflow at zero additional AI API cost

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-17 |
| **Task** | RO-019 (owner-approved redesign, 2026-10-17) |
| **Branch** | `claude/RO-019-zero-cost-workflow` (base: `main` @ `cd884fc`) |
| **Commits** | `127d6d5` RO-019: zero-additional-API-cost Claude Code <-> Codex workflow · handoff + PR link · `b261ee3` RO-019: fix Codex's four P1 policy-checker bypasses (fail-closed) · `5dcb397` round-1 record · `ee1bc42` RO-019: parse workflows as YAML (Codex round 2: 2 x P1, 1 x P2) · `9d649e2` round-2 record · `c6dc754` RO-019: round 3 — secrets wildcard and Bedrock SDK (owner-approved option A) · round-3 record (see the PR's commit list) |
| **Pull request** | [PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11) → `main` (replacement PR; open, **not merged**) |
| **Status** | implemented; verified (local Linux + GitHub Actions Linux and native Windows); **review round 3 done** (the owner-approved final round, option A, 2026-10-20: 2 × P1 fixed in `c6dc754`); awaiting Codex's final review of the head and the owner's merge decision. Exit rule: new P1s go to the owner; P2/P3 become follow-up tasks |

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

## Review round 1 — Codex review 5555220548 on `4afba32` (4 × P1, all fixed in `b261ee3`)

| # | Codex finding (P1) | Reproduced before the fix? | Fix | Regression tests |
|---|---|---|---|---|
| 1 | Quoted / inline write permissions pass (`contents: 'write'`, `{ contents: "write" }`) | yes — exit 0 | Values are unquoted. Flow mappings are parsed, including multi-line ones and those inside flow-style jobs. **Fail-closed:** any value other than `read`/`write`/`none` (anchors, aliases, merge keys, unclosed maps) is rejected | 4 tests: negative control, flow variants, fail-closed cases, positive control |
| 2 | npm alias hides an AI SDK (`"internal-review": "npm:openai@^5.0.0"`) | yes — exit 0 | Resolves `npm:` alias targets in dependencies, `overrides`, `resolutions` and `pnpm.overrides`. Checks **every package in `package-lock.json` by its real name** (any depth, v1 and v3). Rejects non-registry sources (git, GitHub shorthand, tarball URL, `file:`) and `npm:` aliases in workflow commands | 4 tests: negative control, overrides/sources, lockfile, positive control |
| 3 | Bracket / mixed expressions (`github['event']['pull_request']['title']`) | yes — exit 0 | Every `${{ }}` in `run:`/`script:` is **parsed**, with bracket access normalised. Only fixed-format `github.*` identifiers, `matrix`, `runner`, `vars` and the like may appear. `inputs`, `env`, `steps`, `needs`, whole contexts (`toJSON(github)`) and dynamic indexes are rejected. Block, plain multi-line, quoted-key and flow-style script values, and text after `#`, are all scanned | 4 tests: negative control, contexts/indexes, YAML shapes, positive control |
| 4 | Merge-capable actions pass when pinned (`pascalgn/automerge-action@<sha>`) | yes — exit 0 | Merge/approve actions are rejected even if pinned or allowlisted. **Third-party actions need the owner-reviewed allowlist** `.github/workflow-policy.json` (empty) **plus** a SHA pin. Also rejected: `docker://` actions, third-party reusable workflows, REST `…/pulls/N/merge`, GraphQL `mergePullRequest`, `gh pr review -a`, `event=APPROVE` and pushes to `main`/`master` | 4 tests: negative control, allowlist/pin/Docker/reusable, allowlist validation, API/short-flag/push |

**Related variants found while fixing, also covered:**
- `toJSON(github.event)`
- `${{ env.X }}` and step outputs in scripts
- plain-scalar continuation lines
- YAML anchors/aliases
- multi-line flow maps
- override aliases
- git dependency sources
- nested local actions

All 12 passed the old checker (exit 0) and are rejected now.

| Check (round 1) | Result |
|---|---|
| Linux, Node 22.22.0: `npm ci` | exit 0 |
| `npm run verify` | exit 0. Boundaries OK (58 files); `✓ workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files …)`; typecheck clean; script tests **44/44** (8 boundaries + **36 policy**, was 19); Jest **48/48** |
| `npm run test:scripts` / `npm run check:workflows` | exit 0 (44/44) / exit 0 |
| New test file against the **old** checker (`ca73191`) | **17 of 36 fail**, including all four negative controls. The rest are positive controls or unchanged tests; 2 differ only in message wording |
| Rule coverage: each of the 14 rules disabled in turn | every mutation fails 1–5 tests |
| Codex's bypasses plus 12 related variants (19 probes) | all exit 0 before the fix; all exit 1 after, with the expected rule IDs |
| Bypass forms injected into copies of the real `ci.yml` / `package.json` | all rejected (`merge-or-approve`, `script-injection`, `permissions`, `ai-dependency`) |
| PR #4's real tree (`af8acd9`) | exit 1, **25** violations: the 23 before, plus 2 `script-injection` (step outputs interpolated into `run:`) |
| **Native Windows + Linux**, preview run [38990496042](https://github.com/bransondang3307-beep/RepOne/actions/runs/38990496042) (`438dac1` = `b261ee3` + PR #10's Windows job) | Windows, Node 24, CRLF checkout: `test:scripts` (44) ✅, boundaries ✅. Linux: npm ci, boundaries, **Workflow policy**, typecheck, tests ✅ |
| PR #11 CI on `b261ee3`, run [38990504614](https://github.com/bransondang3307-beep/RepOne/actions/runs/38990504614) | success (incl. the Workflow policy step and the handoff check) |

## Review round 2 — Codex review 5555359475 on `5dcb397` (2 × P1, 1 × P2, all fixed in `ee1bc42`)

**Approach.** Instead of adding more regex exceptions, workflows and actions are now **parsed as YAML** with the
`yaml` package. It is version 2.9.1, a pinned root devDependency with an ISC licence and no dependencies of its own.
It was already in the tree through Expo, so the lockfile adds no new package, only the root entry and its integrity
hash.
- Every rule runs on **decoded** keys and values, with keys matched case-insensitively.
- Triggers come only from `on:`.
- Permissions, steps, scripts and the matrix are read structurally.
- A least-privilege reason must be a real YAML comment.
- **Fail-closed:** anchors, aliases, tags, merge keys, directives, several documents, duplicate or non-string keys and
  unknown top-level keys are rejected.

| # | Codex finding | Reproduced before the fix? | Fix | Regression tests |
|---|---|---|---|---|
| P1 | Escaped keys (`"u\u0073es": pascalgn/automerge-action@<sha>`) bypass every key-based rule | yes — exit 0 | Keys and values are decoded by the YAML parser before any rule runs | Negative control (escaped `uses`, `run`, `permissions`, `"wr\x69te"`, escaped trigger); escaped values, explicit `? uses` keys and upper-case keys; tags, directives, multiple documents, duplicate, non-string and unknown top-level keys; positive control (ordinary quoting) |
| P1 | A matrix built from event data (`matrix: ${{ fromJSON(github.event.pull_request.body) }}`) made `${{ matrix.command }}` look trusted in `run:` | yes — exit 0 | `matrix.*` is trusted only when the job's `strategy:` contains **no expression at all**. Otherwise every matrix value must go through `env:`. This is fail-closed even for `vars`-based matrices | Negative control; list, include and whole-strategy expressions, and bracket access; positive control (static matrix; dynamic matrix routed through `env:` and used in a step name) |
| P2 | Privileged-trigger names in ordinary text (`name: Test workflow_run parsing`) failed the check | yes — exit 1 (false positive) | Events are read only from the `on:` declaration: string, list or mapping | Negative control (name, script and env text now pass); every `on:` form, including quoted `"on"`, still rejected |

**Side effects, both intended:**
- Invalid YAML that the line-based checker accepted (e.g. a plain scalar containing `: {`) is now rejected as `yaml-parse`. GitHub would reject it too.
- An unclosed `{` permissions map is now a `yaml-parse` error.

| Check (round 2) | Result |
|---|---|
| Linux, Node 22.22.0: `npm ci` | exit 0 |
| `npm run verify` | exit 0. Boundaries OK; `✓ workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files …)`; typecheck clean; script tests **54/54** (8 boundaries + **46 policy**, was 36); Jest **48/48** |
| `npm run test:scripts` / `npm run check:workflows` | exit 0 (54/54) / exit 0 |
| New test file against the **round-1** checker (`5dcb397`) | **8 of 46 fail**: all three round-2 negative controls and their variant tests, plus two message/rule-name changes. The positive controls pass on both |
| Rule coverage: each of the 16 rules disabled in turn (`yaml-parse` and `workflow-schema` are new) | every mutation fails 1–8 tests |
| All 19 round-1 bypass probes, plus the round-2 reproductions | still rejected, now with real exit codes; the trigger false positive passes |
| PR #4's real tree (`af8acd9`) | exit 1, **27** violations (AI credentials are now counted on keys and values separately) |
| **Native Windows + Linux**, preview run [38992302823](https://github.com/bransondang3307-beep/RepOne/actions/runs/38992302823) (`ee1bc42` + PR #10's updated Windows job) | Windows, Node 24, CRLF checkout: `npm ci` (60 s), script tests 54 ✅ (17 s), boundaries ✅. Linux: all steps incl. Workflow policy ✅ |
| PR #11 CI on `ee1bc42`, run [38992308669](https://github.com/bransondang3307-beep/RepOne/actions/runs/38992308669) | success |

**Consequence for [PR #10](https://github.com/bransondang3307-beep/RepOne/pull/10):** its Windows job now runs
`npm ci` with the npm cache (commit `2aab1de`; CI run 38992310677 ✅). Without it the policy tests could not load
`yaml`. Measured `npm ci` time is 60–79 s, so the job takes about 1.8 minutes: roughly **4 billed Windows minutes per CI
run instead of 2**. The boundary checker itself is still dependency-free.

## Review round 3 — owner-approved final round (option A, PR #11 comment 6300812749); Codex review 5555447195 on `9d649e2` (2 × P1, fixed in `c6dc754`)

| # | Codex finding | Reproduced before the fix? | Fix | Regression tests |
|---|---|---|---|---|
| P1 | Wildcard read of the secrets context: `${{ join(secrets.*, ',') }}` | yes — exit 0 | `secrets` is judged by **parsing each expression**: only `secrets.GITHUB_TOKEN` is allowed (any case, dotted or bracket). Wildcards, bare `secrets`, dynamic indexes and other names are rejected, in every value and in bare `if:` conditions. This replaces the old text regexes, which missed `SECRETS.X` and flagged plain text | Negative control, plus `toJSON(secrets)`, `format(…, secrets)`, a dynamic index and spaced `secrets . *`; `SECRETS.X`, bracket form, `}}` inside a literal, bare `if:`, reusable-workflow `secrets:`; positive control (`GITHUB_TOKEN` in three spellings; plain text about secrets) |
| P1 | AWS Bedrock client not in the AI-SDK denylist (`@aws-sdk/client-bedrock-runtime`, manifest and lockfile) | yes — exit 0 | Added `@aws-sdk/client-bedrock*`, SageMaker Runtime, Azure OpenAI / `@azure(-rest)/ai-*`, IBM watsonx, `together-ai`, `llamaindex` and `@openrouter/*`, across manifests, aliases, overrides and the lockfile. Also Bedrock, Azure and watsonx endpoints and `aws bedrock-runtime`. **Denylist limits are documented**: it is defense in depth, and the $0 guarantee rests on no credentials and no billing | Negative control (manifest + lockfile); seven other cloud SDKs, npm alias, transitive lockfile entry, CLI, install and endpoint; positive control (`@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage`, `aws s3`) |

**Also fixed in this round:**
- **Same mechanism, found while fixing the secrets rule:** `${{ format('}}{0}', github.event.issue.title) }}` in `run:` passed. The expression extractor ended at the `}}` inside the string literal. It now scans literals the way GitHub does. Covered by a regression test and a positive control.
- **Optional robustness fix:** a malformed `package.json` or lockfile (invalid JSON, or not an object) now gets a clean `package-manifest` diagnostic with file and line, instead of an unhandled crash. Covered by a test asserting there is no stack trace.

| Check (round 3) | Result |
|---|---|
| Linux, Node 22.22.0: `npm ci` | exit 0 |
| `npm run verify` | exit 0. Boundaries OK; `✓ workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files …)`; typecheck clean; script tests **62/62** (8 boundaries + **54 policy**, was 46); Jest **48/48** |
| `npm run test:scripts` / `npm run check:workflows` | exit 0 (62/62) / exit 0 |
| New test file against the **round-2** checker (`9d649e2`) | **7 of 54 fail**: both round-3 negative controls, their variant tests, the `}}` literal fix and the crash case, plus one positive control the old text rule got wrong (it rejected `secrets['GITHUB_TOKEN']`) |
| Rule coverage: each of the 17 rules disabled in turn (`package-manifest` is new) | every mutation fails 1–9 tests |
| **Native Windows + Linux**, preview run [39495052546](https://github.com/bransondang3307-beep/RepOne/actions/runs/39495052546) (`c6dc754` + PR #10's Windows job) | Windows, Node 24, CRLF checkout: `npm ci`, script tests 62 ✅, boundaries ✅ (90 s). Linux: all steps incl. Workflow policy ✅ |
| PR #11 CI on `c6dc754`, run [39495064660](https://github.com/bransondang3307-beep/RepOne/actions/runs/39495064660) | success |

## Decisions / ADRs
- ADR 0005 (Accepted on merge): subscription-only AI collaboration, AI-free CI, a policy enforced in CI, least
  privilege, and PR #4 archived.

## Known limitations / risks
- Since round 2 the checker **parses YAML** (YAML 1.2) and is **fail-closed**, so the main risk is a false positive,
  not a silent pass. Codex review remains the second line. **Residual risks, for the owner's awareness (not
  regressions; inherent to a static check):**
  - **Parser differential.** GitHub uses its own YAML parser. The features where parsers disagree are rejected:
    tags, directives, anchors/aliases, merge keys, non-string or duplicate keys, multiple documents and unknown
    top-level keys. Anything else is a theoretical gap.
  - **Arbitrary code in `run:`** (e.g. `curl … | sh`) or a job `container:`/`services:` image could still use a
    write-scoped token to merge. No static check can prevent that. The real control is least privilege: write scopes
    need a `# least-privilege:` reason that the owner and Codex review, and today no workflow has any write scope.
  - **Code inside a local JavaScript/Docker action** is not scanned, only its `action.yml`. None exist here.
  - **The AI SDK, endpoint and CLI lists are denylists** and can never be complete. They are defense in depth; see
    `claude-codex-workflow.md` §7 "Limits of the denylist". A dependency allowlist (option C) would close this and
    remains an owner option.
- The lockfile check also fails on an AI SDK pulled in **transitively** by a legitimate dependency. That is
  intentional (fail-closed); the owner would then decide.
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
