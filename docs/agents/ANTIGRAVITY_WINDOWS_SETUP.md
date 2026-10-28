# RepOne — Antigravity onboarding on the Lenovo Windows laptop

Prepared 2026-10-16; refreshed 2026-10-28 against `main` @ `2959751`. This is a
setup guide, not an installation or device-test report. Use native Windows
PowerShell; WSL, a Mac, an emulator, and a second computer are not required. A
phone is still needed for the owner's Expo Go checks.

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

RepOne requires Node 22+ because tests use `node:sqlite`. CI runs Node 22 on Linux
and Node 24 in its Windows job; inspect `.github/workflows/ci.yml` and any future
engine/version pin first. If Node is
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

These guides live on `main`. In a clean checkout with no other agent using it:

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
```

Read [the entry point](../../ANTIGRAVITY.md), then attach/read
[session instructions](ANTIGRAVITY.md) in the agent chat. Paste its first-session
prompt. Ask it to identify the files it actually read and its branch/SHA.

Google documents automatic loading for `AGENTS.md`, `GEMINI.md`, and modular
`.agents/rules/*.md`; `ANTIGRAVITY.md` itself is not an automatic filename.
These guides deliberately use explicit attachment instead of adding workspace rules,
so no shared instruction file changes. Do not assume `GEMINI.md` imports were expanded:
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
to bypass a failure. Then run the full check:

```powershell
npm.cmd run verify
```

It runs the module-boundary check, the workflow policy (no paid AI integrations),
typecheck and all tests. Capture the branch, SHA, Node/npm versions, command results,
and actual counts. In a Linux container on `main` @ `2959751` it reported script
tests 62/62 and Jest 48/48. That is not this laptop's result. Do not report a
missing script as a successful check. Lint is not configured on `main` (RO-017);
report that limitation instead of adding it here.

## 6. Owner Expo Go checks

Device acceptance is the owner's step for each milestone. Milestone 1's check
(RO-007) passed on 2026-10-16. Later PRs name the exact commit to test. In a
clean, coordinated checkout:

```powershell
git fetch origin --prune
git switch <branch named in the PR>
git pull --ff-only origin <branch named in the PR>
git log -1 --format=%H
npm.cmd ci
npm.cmd run verify
```

`git log -1 --format=%H` must print the commit the PR names. Use
`git switch --track origin/<branch>` if the local branch does not exist. Stop on any
failure, then start the app:

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

Owner acceptance steps: follow the checklist in the PR or its handoff, and record
device/OS, Expo Go version, branch/SHA, each outcome and exact errors on that PR.
Keep private data out.

A JS export or a server QR code does not prove device acceptance, real IMU data,
or real-world accuracy. The owner performs this check; an agent must not invent it.

## 7. Exact next steps after onboarding

1. Finish the local read-only setup audit, then the dependency and check commands above.
2. For each task, use the sync/assignment/branch/check/handoff/PR protocol in
   `AGENTS.md` and [the session guide](ANTIGRAVITY.md). Status updates follow
   `AGENTS.md` §3 step 9.
3. Continue RO-018 hardware bring-up with the owner. Research the unresolved
   H0-to-phone transport only under an assigned task; neither Expo Go nor Antigravity
   supplies a USB/BLE bridge automatically.
4. Milestone 2 (RO-012) is paused by the owner. Its PRs #14–#17 stay unmerged until
   the owner resumes it.
