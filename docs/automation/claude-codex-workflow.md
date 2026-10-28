# Claude Code ↔ Codex workflow — zero additional AI API cost (RO-019)

> **Status:** adopted with [ADR 0005](../decisions/0005-zero-cost-claude-codex-collaboration.md) when the RO-019
> replacement PR merges. It replaces the API-powered review loop of PR #4, which was archived and never enabled
> ([`future-api-loop.md`](future-api-loop.md)).
>
> **Owner rule (2026-10-17):** separately billed AI API usage stays at **$0**. Development uses the owner's
> existing subscriptions only. GitHub Actions automates testing and CI; AI work is started by a person.

## 1. Principles

1. **No AI API anywhere in automation.** There are no AI API keys or tokens, no AI actions, and no AI SDKs.
   `npm run check:workflows` fails CI if one appears (§7).
2. **CI is fully automatic and AI-free.** It runs module boundaries, the workflow policy, typecheck and all tests on
   every PR. The Windows checker job is proposed in PR #10, and lint arrives with RO-017.
3. **AI work runs through supported subscription interfaces.**
   - **Codex** reviews PRs through its GitHub integration (ChatGPT Plus).
   - **Claude Code** sessions are started by the owner (Claude Pro).
   - Nobody scripts the ChatGPT or Claude consumer apps.
4. **Nothing merges or approves on its own.** A Codex review is a comment, not an approval. The owner merges.

## 2. Who does what, and who pays

| Step | Tool and interface | Billed to | Can it charge extra? |
|---|---|---|---|
| Implement, fix findings | Claude Code (web at claude.ai/code, desktop, CLI), signed in with **Claude Pro** | Pro usage limits. Cloud sessions always use the subscription | Only if *extra usage* is enabled, or an `ANTHROPIC_API_KEY` is used. Both are forbidden (§7) |
| Review PRs | **Codex code review on GitHub** (ChatGPT Plus, Codex cloud) | Plus Codex limits | Only if Codex credits are bought. Forbidden (§7) |
| Optional local review | Codex CLI or IDE on the Lenovo, **signed in with ChatGPT** | Plus Codex limits | Only if logged in with an API key. Forbidden (§7) |
| Research and architecture | Gemini / Antigravity (Google AI Pro) | Subscription | No API keys used |
| Tests, typecheck, boundaries, policy, Windows checker | GitHub Actions, `GITHUB_TOKEN` only, no secrets | GitHub's free Actions minutes (private repo) | Only above the free minutes if the Actions budget is above $0 (§7) |
| Merge, device tests | Owner | — | — |

When a subscription limit is reached, the work **waits for the limit to reset**. It is never paid for with API
credits.

## 3. The loop for every pull request

```text
Claude Code session (owner starts it) ── branch claude/RO-xxx ── npm run verify ── handoff ── open PR
        │
        ├─► GitHub Actions CI (automatic, AI-free): boundaries · workflow policy · typecheck · tests
        └─► Codex code review (automatic on PR open / ready for review): findings [P0]–[P3] on the PR
                │
                ├─ no P0/P1 findings (P2 answered) + CI green on the head commit ─► owner merges
                └─ findings ─► owner asks Claude to address them (prompt in §6)
                                │
                                Claude: fix commit → reply to each finding → npm run verify → push
                                        → round summary comment → "@codex review"
                                │
                                Codex re-reviews the new head ─► (back to the top; max 2 fix rounds)
```

1. **Claude** opens the PR from a `claude/<TASK-ID>-<slug>` branch, with the PR template, a handoff and a green
   `npm run verify`.
2. **Codex** reviews automatically when the PR is opened or marked ready for review. If no review appears within a
   few minutes, anyone can comment `@codex review`.
3. **Owner** reads the review and starts or continues a Claude Code session with the prompt in §6.
4. **Claude** addresses the findings (conventions in §4), pushes **one fix commit per round** and comments
   `@codex review`. Codex does **not** re-review on its own after a push.
5. **Round cap.** After **two** fix rounds, or on any disagreement, Claude stops and writes
   "Needs owner decision". The owner decides, as in PR #4's rule.
6. **Owner** merges when the merge gate in §5 is met.

## 4. Comment conventions (Claude and Codex)

- **Codex findings:** `[P0]`–`[P3]` with `file:line`, why, and a suggested fix. The format is defined in `AGENTS.md`
  → "Review guidelines". On GitHub, Codex reports only P0/P1 by default; those guidelines ask it for P2 as well.
- **Claude's reply to each finding**, in its thread:
  - `Fixed in <sha>: <one line>` — the fix plus any test that pins it, or
  - `Not changed: <reason>` — e.g. a false positive (explain how it was checked), or
  - `Needs owner decision: <question>`.
- **Claude's round summary** (one PR comment):
  `Round <n>/2 at <sha> — fixed: …; not changed: …; npm run verify: <summary>` followed by `@codex review`.
  `@codex review for <focus>` narrows the re-review.
- **Handoff:** Claude adds a "Review round n" section to the PR's handoff file. It links the Codex review and lists
  findings, commits and the verify result.
- **Never** approve, merge, force-push or delete review threads. Codex does not push to Claude's branch. If Codex
  should implement something, that becomes its own task on a `codex/…` branch.

## 5. Merge gate (owner)

Merge only when all of these hold **for the same head commit**:

- [ ] CI is green on the head SHA: boundaries, workflow policy, typecheck, tests, and the handoff check.
- [ ] Codex reviewed **that head SHA** with no open P0/P1, and every P2 is fixed or answered.
- [ ] The handoff records the review rounds and the exact test results.
- [ ] Device or physical tests are done where the change needs them (UI, sensors).

On GitHub Free private repositories, branch protection cannot enforce this. It is a process rule, made visible by
the PR template's "Reviewed head SHA" line.

## 6. Copy-paste prompts

**Claude Code (owner → Claude), to address findings:**

```text
Address the Codex review findings on PR #<N> (branch <branch>). Read AGENTS.md, CLAUDE.md and
docs/automation/claude-codex-workflow.md first. Fix P0/P1, fix or answer P2, treat P3 as optional.
Reply to each finding (Fixed in <sha> / Not changed / Needs owner decision), add tests that pin each fix,
run npm run verify, push one fix commit, post the round summary and comment "@codex review".
This is round <n> of 2. Do not merge or approve. Do not use any API key.
```

**Codex, local review on the Lenovo (CLI or IDE signed in with ChatGPT, optional):** run `/review` against `main`,
or ask:

```text
Review PR #<N> at <head sha> against main using the "Review guidelines" in AGENTS.md. Report [P0]–[P3]
findings with file:line and a suggested fix. Do not edit files.
```

## 7. Keeping it at $0

**Enforced in the repository (every CI run):** `npm run check:workflows` (`scripts/check-workflow-policy.mjs`,
regression tests in `scripts/check-workflow-policy.test.mjs`) fails on the rules below.
Workflows and actions are **parsed as YAML** with the `yaml` package (YAML 1.2; a pinned root devDependency, so run
`npm ci` first). Every key and value is checked **after** quoting and escapes are decoded, so `"u\u0073es"` is
`uses`. Keys are matched case-insensitively. The checker is **fail-closed**: YAML features it does not model are
rejected, never assumed safe.

| Rule | Detects |
|---|---|
| `ai-action` | Actions from AI vendors (`openai/*`, `anthropics/*`, `google-gemini/*`) or named after an AI product (claude, codex, gemini, gpt…) |
| `ai-credential` | AI API keys or tokens by name — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `GEMINI_API_KEY`, … — from secrets, variables or literals |
| `ai-endpoint` | Direct calls to AI API hosts: api.openai.com, api.anthropic.com, generativelanguage.googleapis.com, Vertex `aiplatform.googleapis.com`, Azure OpenAI / Azure AI (`*.openai.azure.com`, `*.services.ai.azure.com`, `*.cognitiveservices.azure.com`), **AWS Bedrock** (`bedrock*.…amazonaws.com`), SageMaker Runtime, IBM watsonx, … |
| `ai-cli` | Installing or running AI CLIs/SDKs: `@openai/codex`, `@anthropic-ai/*`, `@google/gemini-cli`, `npm:openai` aliases, `pip install openai`, `codex exec`, `claude -p`, **`aws bedrock-runtime …`**, and cloud AI SDK installs (`@aws-sdk/client-bedrock*`, `@azure/openai`, `@azure/ai-*`, …) |
| `ai-dependency` | AI SDKs under any name: direct dependencies, `npm:` aliases (`"helper": "npm:openai@5"`), `overrides`/`resolutions`, and **anything installed in `package-lock.json`**, including transitively. Covered SDKs:<br>• model vendors: `openai`, `@anthropic-ai/*`, `@google/genai`, `@mistralai/*`, `cohere-ai`, `groq-sdk`, …<br>• **cloud AI platforms:** AWS Bedrock `@aws-sdk/client-bedrock*` and SageMaker Runtime, Vertex AI, Azure OpenAI and `@azure/ai-*`, IBM watsonx<br>• frameworks: `ai`, `@ai-sdk/*`, `langchain`, `llamaindex`, … |
| `dependency-source` | Dependencies or overrides from non-registry sources (git, GitHub shorthand, tarball URLs, `file:`). The policy cannot see which package those are |
| `secret` | Any reference to the `secrets` context except `secrets.GITHUB_TOKEN`. Expressions are parsed, so the check is case-insensitive (`SECRETS.X`) and covers bracket form (`secrets['X']`), **wildcards (`join(secrets.*, ',')`), bare contexts (`toJSON(secrets)`) and dynamic indexes**, in every value and in bare `if:` conditions. Also rejects `secrets: inherit`. A `}}` inside a string literal does not end an expression |
| `permissions` | Missing or non-read-only workflow-level `permissions`, `write-all`, and job-level write scopes without a `# least-privilege: <reason>` comment. The reason must be a real YAML comment on that value (or on its inline `{ … }` map); a string that only looks like one does not count. Values must be exactly `read`, `write` or `none` after decoding |
| `trigger` | `pull_request_target` and `workflow_run` **declared under `on:`**, in any form: a string, a list or a mapping. Ordinary text that mentions them (a name, a script, an env value) is fine |
| `merge-or-approve` | Actions that merge or approve (`*automerge*`, `*auto-approve*`, `mergify`, …, even if allowlisted), `gh pr merge`, `gh pr review --approve`/`-a`, `event=APPROVE`, REST `…/pulls/N/merge`, GraphQL `mergePullRequest`/auto-merge, force-push, pushes to `main`/`master` |
| `script-injection` | `${{ }}` inside `run:`/`script:` that is not a fixed-format value. Expressions are parsed: dotted, bracket (`github['event']`) and mixed forms are judged alike. `github.*` is allowed only for identifiers such as `sha`, `event_name`, `run_id`. `inputs`, `env`, `steps`, `needs`, whole contexts (`toJSON(github)`) and dynamic indexes are rejected. **`matrix.*` is trusted only when the job's `strategy:` contains no expression at all**: a matrix built with `fromJSON(…)` or `${{ }}` may carry PR text, so its values must go through `env:` |
| `third-party-action` | Actions outside `actions/*` and `github/*` that are not in the owner-reviewed allowlist `.github/workflow-policy.json`, or not pinned to a full commit SHA; Docker-image actions (`docker://`) |
| `policy-config` | An invalid allowlist, or an allowlist entry that is an AI or merge/approve action |
| `yaml-feature` | YAML anchors, aliases, merge keys (`<<`), explicit tags (`!!str`), directives (`%YAML`) and keys that are not plain strings (e.g. `true:`). They could change meaning between parsers |
| `yaml-parse` | Invalid YAML, duplicate keys, an empty file, or more than one document |
| `workflow-schema` | Unknown top-level workflow keys (only `name`, `run-name`, `on`, `permissions`, `env`, `defaults`, `concurrency`, `jobs`), and jobs, steps or `steps:` that are not mappings or lists |
| `package-manifest` | A `package.json` or lockfile that is not valid JSON (or not a JSON object). It gets a clean diagnostic with file and line instead of a crash, and the check fails because its dependencies cannot be verified |

Local actions (`uses: ./path`) are scanned wherever they live, including actions nested inside them.

**Limits of the denylist, and why it is still worth having.** The AI-SDK, endpoint and CLI rules are **denylists**.
They can never be complete: new SDKs, wrappers and OpenAI-compatible gateways appear all the time. Codex's final
review found the AWS Bedrock client missing, and other gaps will exist. These rules are **defense in depth**. The $0
guarantee rests on layers that do not depend on knowing every SDK:
1. **No credential, no paid call.** No AI API keys or tokens exist in repository secrets, and the `secret` rule allows
   only `GITHUB_TOKEN` to reach any step. An AI SDK without a key cannot make a billed request.
2. **No billing to charge.** There are no API billing accounts or payment methods, Claude extra usage is off and no
   Codex credits are bought (owner checklist below).
3. **Review.** Every new dependency and workflow change is in a PR that Codex and the owner review.

A dependency **allowlist** (every new package needs owner approval) would close the denylist gap completely. It was
considered (option C, 2026-10-20) and not adopted because it adds friction to every dependency change.

Least privilege does **not** mean "never write". A job may get, for example, `pull-requests: write` if the line says
why: `pull-requests: write # least-privilege: posts the coverage comment`.

**Owner account settings.** The repository cannot see these:

1. GitHub → repo Settings → Secrets and variables → Actions:
   - No `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` secret.
   - No `AI_LOOP_MODE` variable.
2. GitHub → account Billing → budgets: Actions budget **$0** with "stop usage". Over the free minutes, CI pauses
   instead of charging.
3. ChatGPT → Codex settings → Code review: enabled for this repository, automatic reviews on. Do **not** buy Codex
   credits.
4. Codex CLI or IDE: `codex login status` shows a ChatGPT sign-in. Never run `codex login --with-api-key`. Keep
   `OPENAI_API_KEY` out of the environment and out of `.env` files.
5. claude.ai → Settings → Usage: **extra usage off**. It is billed at API rates.
6. Claude Code CLI: `ANTHROPIC_API_KEY` unset; in PowerShell, `echo $env:ANTHROPIC_API_KEY` prints nothing. `/status`
   shows the subscription. Never approve "use this API key". Cloud sessions always use the subscription.

## 8. Automated vs. manual

| Automated (no AI, no cost beyond free CI minutes) | Manual (a person starts it) |
|---|---|
| CI on every PR and push to `main`; manual re-run via `workflow_dispatch` | Starting or continuing Claude Code sessions |
| Codex review when a PR is opened or marked ready | `@codex review` after each fix push |
| Workflow policy check | Deciding after two fix rounds or a disagreement; merging |

## 9. Troubleshooting

- **No Codex review appeared.** Check that Codex code review is enabled for the repository in Codex settings, then
  comment `@codex review`.
- **"Usage limit reached"** (Claude or Codex). Wait for the window to reset, or review manually. Never buy credits or
  enable extra usage.
- **Review is about an older commit.** Comment `@codex review`. The merge gate needs a review of the head SHA.
- **`check:workflows` fails.** Read the rule ID in the output. If a write scope is really needed, add a
  `# least-privilege:` reason. A third-party action needs the owner's review, an entry in `.github/workflow-policy.json`
  and a SHA pin. AI integrations and merge/approve automation need the owner and a new ADR, not a policy edit.

## 10. Options that are *not* enabled (each needs the owner's approval)

- **Claude Code on the web "Auto-fix"** for a single PR. Claude responds to review comments and CI failures
  automatically, on the Pro subscription, and needs the Claude GitHub App. It is **off** for now. If ever enabled,
  the round cap becomes an instruction only.
- **Claude Code GitHub Action with a subscription OAuth token** (`CLAUDE_CODE_OAUTH_TOKEN`). It is documented and billed
  to the subscription, but it stores a credential to the owner's personal plan in repository secrets, and an
  `ANTHROPIC_API_KEY` secret would silently take precedence. The policy blocks it.
- **The API-powered loop.** Archived; see [`future-api-loop.md`](future-api-loop.md).
