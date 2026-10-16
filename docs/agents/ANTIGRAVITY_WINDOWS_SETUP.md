# RepOne — Antigravity onboarding on the Lenovo Windows laptop

Prepared 2026-10-16. This is a setup guide, not an installation or device-test
report. Use native Windows PowerShell; WSL, a Mac, an emulator, and a second
computer are not required. A phone is still needed for the existing Expo Go gate.

## 1. Verify tools before installing anything

In a new PowerShell window, run these separately:

```powershell
git --version
node --version
npm.cmd --version
Get-Command git,node,npm.cmd -ErrorAction SilentlyContinue | Select-Object Name,Source
```

Record all output. A number such as `0.64.0` alone does not identify which tool
was checked. Do not infer Node or Antigravity readiness from it.

RepOne requires Node 22+ because tests use `node:sqlite`. Match the repository's
current CI version when possible (the inspected CI uses Node 22); inspect
`.github/workflows/ci.yml` and any future engine/version pin first. If Node is
missing or too old, install a supported matching version from
[Node.js downloads](https://nodejs.org/en/download). Install missing Git from
[Git for Windows](https://git-scm.com/install/windows). Reopen PowerShell and
Antigravity after installation so PATH refreshes. Do not reinstall tools that work.
Use `npm.cmd` / `npx.cmd` if PowerShell blocks the `.ps1` wrappers; do not weaken
machine-wide execution policy to run npm.

## 2. Install/open Antigravity

Use Google's [official download](https://antigravity.google/download) and
[getting-started guide](https://antigravity.google/docs/getting-started/).
Select Windows and the architecture shown under Windows Settings > System >
About > System type (x64 or ARM64); Lenovo branding does not establish architecture.
Run the official installer and complete its account sign-in. Keep review/approval
controls enabled for terminal execution and changes. Do not install unofficial
extensions or paste API keys. If Antigravity is already installed, record its
version from its About screen and use that installation first.

## 3. Locate or clone RepOne

Reuse an existing suitable clone. In that folder, run:

```powershell
git rev-parse --show-toplevel
git remote -v
git status --short --branch
git log -1 --oneline
```

Confirm origin is `bransondang3307-beep/RepOne`. If the checkout is dirty, preserve
it and coordinate before switching branches. Do not clone over it or let two
agents change its active branch at once.

Only if no clone exists, this is a **suggested new location**, not a detected path:

```powershell
$reponeParent = Join-Path $env:USERPROFILE 'source'
New-Item -ItemType Directory -Force -Path $reponeParent | Out-Null
Set-Location $reponeParent
git clone https://github.com/bransondang3307-beep/RepOne.git
```

Wait for a successful clone before continuing. The repo is private: complete Git's
credential-manager/browser authentication with an account that has access. Do not
embed a token in a remote URL. If `RepOne` already exists, stop and inspect it.

```powershell
Set-Location (Join-Path $reponeParent 'RepOne')
git status --short --branch
git fetch origin --prune
```

Open this **repository root**, containing `AGENTS.md`, `package.json`, `apps/`
and `packages/`, as the Antigravity workspace. Do not open only `apps/mobile`.

## 4. Load instructions explicitly

Fetch this onboarding branch to preview before merge:

```powershell
git fetch origin --prune
git switch --track origin/codex/RO-004-antigravity-onboarding
```

Run the switch only in a clean checkout with no other agent using it. If the local
branch already exists, use `git switch codex/RO-004-antigravity-onboarding` instead.
After the owner merges, use clean `main` plus `git pull --ff-only origin main`.

Read [the entry point](../../ANTIGRAVITY.md), then attach/read
[session instructions](ANTIGRAVITY.md) in the agent chat. Paste its first-session
prompt. Ask it to identify the files it actually read and its branch/SHA.

Google documents automatic loading for `AGENTS.md`, `GEMINI.md`, and modular
`.agents/rules/*.md`; `ANTIGRAVITY.md` itself is not an automatic filename.
This PR deliberately uses explicit attachment so it can coexist with the open
PRs editing shared instructions. Do not assume `GEMINI.md` imports were expanded:
directly read `AGENTS.md`. No global rules or existing shared files are replaced.

Optional future integration: after checking the installed version's documentation,
propose a dedicated workspace rule in a separate assigned PR. Current modular
rules require valid YAML `trigger` frontmatter (for example `always_on`), and
can point the agent to this guide. Do not silently add global or workspace rules
during the read-only setup audit. See [Google's rule documentation](https://antigravity.google/docs/rules/).

## 5. Install locked dependencies and check the chosen branch

Once the repository path and tools are confirmed, from the repository root:

```powershell
npm.cmd ci
```

Stop on a nonzero exit code. `npm ci` recreates `node_modules`; it should preserve
the lockfile. Do not substitute a dependency upgrade or regenerate the lockfile
to bypass a failure. Inspect `npm.cmd run` and choose **one** check path:

```powershell
# When package.json defines verify:
npm.cmd run verify
```

Or, on the inspected main where verify is absent, run separately and stop if either fails:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Capture the branch, SHA, Node/npm versions, command results, and actual counts.
Earlier 45 core + 1 mobile results are historical evidence, not this laptop's
result. Do not report a missing script as a successful check. Lint is not configured
on inspected main (RO-017); report that limitation instead of adding it here.

## 6. Owner Expo Go check (RO-007)

RO-007 targets Milestone 1 / PR #3, not merely the onboarding branch. Check the
latest PR head/review state on GitHub first. In a clean, coordinated checkout:

```powershell
git fetch origin --prune
git switch sprint-1-alignment
git pull --ff-only origin sprint-1-alignment
git rev-parse HEAD
npm.cmd ci
```

If that local branch does not exist, use
`git switch --track origin/sprint-1-alignment` for the switch. Stop on any failure.
Run that branch's `npm.cmd run verify` before starting the app. After PR #3 merges,
use clean updated main instead and record the exact tested commit.

```powershell
Set-Location apps/mobile
npx.cmd expo start --go
```

Use Expo Go on a compatible phone and scan the QR code. Phone and laptop should
share trusted Wi-Fi. If prompted by Windows Firewall, allow Node only on the
trusted private network; do not turn the firewall off. If LAN access is blocked,
stop the server with Ctrl+C, then consider `npx.cmd expo start --go --tunnel`;
review any requested tunnel dependency and network exposure before accepting.
On physical iOS, current Expo guidance requires CLI and Expo Go to use the same
Expo account. See [Expo's device instructions](https://docs.expo.dev/get-started/start-developing/).

If Expo Go reports an unsupported SDK, record the exact message and compare
`apps/mobile/package.json` with the installed Expo Go support. Do not upgrade
Expo, generate native folders, or commission a paid build to make onboarding pass.
Windows does not run Apple's local iOS simulator; use a physical iPhone if relevant.

Owner acceptance steps:

1. Open the simulated workout screen and confirm the simulated provenance label.
2. Start a simulated set; verify the rep count increases.
3. Stop the set; open History and verify it appears. Switch away/back to check refresh.
4. Record device/OS, Expo Go version, branch/SHA, each outcome and exact errors
   on [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3). Keep private data out.

A JS export or a server QR code does not prove device acceptance, real IMU data,
or real-world accuracy. The owner performs this check; an agent must not invent it.

## 7. Exact next steps after onboarding

1. Owner reviews this documentation PR; merge only after review and green CI.
2. Finish local read-only setup audit, then dependency/check commands above.
3. Check PR #3's current review status; complete RO-007. Owner merges only after
   its independent review, green CI and acceptance gates are satisfied.
4. Preserve PR #2's owner decision on per-agent status PRs and PR #5's record of
   the RO-019 pause. Do not merge or enable paused PR #4.
5. Continue RO-018 hardware bring-up with the owner. Research the unresolved
   H0-to-phone transport under an assigned task; neither Expo Go nor Antigravity
   supplies a USB/BLE bridge automatically. Milestones 2–5 still need their gates.
6. For each later task, use the sync/assignment/branch/check/handoff/PR protocol
   in `AGENTS.md` and [the session guide](ANTIGRAVITY.md).
