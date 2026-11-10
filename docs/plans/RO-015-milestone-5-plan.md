# RO-015 — Milestone 5 plan (integration and Sprint 1 close-out)

- **Status:** **proposed** (2026-11-10). Not started.
- **Author:** Claude Code, at the owner's direction ("keep going on the milestones").
- **Starts when** both are true:
  - Milestone 4 is merged and accepted: PRs #29 → #30 → #35 → #37 → #45 → #46 → #47, after the owner's iPhone checks;
  - the owner says go (`TASKS.md`: "each starts only after the previous one is merged and the owner approves").
- **Scope from `TASKS.md`:** "boundary validation, full test run, Expo Go, docs + Sprint 1 summary. Codex runs the
  independent review."

## 1. What Milestone 5 delivers

1. **Boundary validation.**
   - `npm run check:boundaries` and the Windows boundary job pass on `main`.
   - `docs/architecture.md` §1–§3 match the code: each module's status, each layer rule, and each folder that exists.
2. **Full test run on `main`**, after the last Milestone 4 merge:
   - `npm ci` and `npm run verify`;
   - `npm run test:firmware`;
   - Android and iOS `expo export`;
   - `expo-doctor`, where the network allows;
   - `npm audit --omit=dev`, compared with the 2026-11-10 dry run (§3).
3. **Expo Go.**
   - If `main`'s app code and lockfile equal the Milestone 4 candidate the owner accepted, that acceptance stands.
     The equality is shown by diff, as for Milestone 2.
   - Otherwise the owner runs one short smoke pass on `main`: Today → workout → record → History, in light and dark.
4. **Docs and the Sprint 1 summary.**
   - The stale statements in §4 are corrected.
   - A new `docs/sprint-1-summary.md` covers:
     - what was built, by milestone, with merge commits;
     - what was verified, and how;
     - what is simulated only;
     - what is carried to Sprint 2.
   - The `PROJECT_STATUS.md` and `TASKS.md` closeout records Milestones 4 and 5.
5. **An independent review by Codex** of `main` at the Milestone 5 head: architecture, boundaries, provenance
   labelling, and test strength. Its findings become tasks; none is fixed silently inside the closeout.

**Out of scope:**
- new features;
- detector tuning;
- real-sensor claims;
- the parked PRs #28 and #31, unless the owner decides otherwise (§5).

## 2. Delivery

| PR | Contents | Who |
|---|---|---|
| 5.1 | Docs sync (§4), `docs/sprint-1-summary.md`, and the full-run evidence (§1.2) | Claude Code |
| 5.2 | Codex's independent review report (`docs/research/…-RO-015-sprint-1-review.md`) on its own branch, with findings as `[P0]`–`[P3]` | Codex. The owner starts it; the prompt is in §6 |
| 5.3 | Closeout status: RO-014 and RO-015 `done`, Sprint 1 closed in `PROJECT_STATUS.md` | Claude Code, after 5.1 and 5.2 merge |

Each PR follows the repo rules:
- CI is green on the head;
- Codex reviews the head, with at most two fix rounds;
- each is merged pinned to its head under the standing authorization;
- `main` CI is checked after each merge.

## 3. Dry run, 2026-11-10 (software only; nothing merged)

This ran on the Milestone 4 candidate `4c6eee7`: the head of PR #47, which is `main` @ `4986606` + #29 + #30 + #45
+ #46 + #47. Node 22.22.0, a clean `npm ci`.

| Check | Result |
|---|---|
| `npm run verify` | exit 0 — boundaries OK (138 files, no cycles); workflow policy OK; typecheck OK; script tests 124/124; Jest mobile 173, rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 38 |
| `npm run test:firmware` | exit 0 — protocol layer 62/62, MPU-6050 driver 16/16 (fake bus), `node --test` 9/9 (decoder 4, firmware → decoder boundary 5) |
| `expo export` Android / iOS | exit 0 / exit 0 (1370 / 1375 modules) |
| `npx expo-doctor` | 18/20 checks pass. The 2 failures need Expo's servers, which this environment cannot reach (`getaddrinfo ENOTFOUND exp.host`; React Native Directory). They must be rerun where the network allows |
| `npm audit --omit=dev` | **8 moderate, 0 high** on the candidate (SDK 58), against **13, 5 of them high**, on `main` @ `4986606` (SDK 57) |

All 8 remaining advisories come through `glob` / `minimatch` in Expo's build tooling: `@expo/cli`,
`@expo/fingerprint`, `@expo/metro-config` and `@expo/config(-plugins)`. npm's suggested "fix" is a downgrade to
`expo@57.0.32`, so they wait for an Expo patch release. See decision 4 in §5.

Every test result above is from **synthetic or replayed** data. No phone, sensor or hardware was used.

## 4. Docs audit: statements to correct in PR 5.1

| File | Statement now | Correct to | Stale since |
|---|---|---|---|
| `README.md` §"Actual state" (line 6) | "Sprint 1, Milestone 1 … 2026-10-15" | The Sprint 1 close state, dated | Milestone 2 |
| `README.md` (line 16) | Mobile app "not yet run on a device/simulator" | Run on an iPhone in Expo Go (owner checks 2026-10-30 and later); simulated data only | 2026-10-30 |
| `README.md` (line 17) | BLE, USB serial "Not started" | Protocol, codec and Uno USB firmware merged and host-tested, never flashed. The BLE adapter is parked (#28) | 2026-11-08 |
| `README.md` (line 29) | `features/` "(exercises, machines, device-connection: planned)" | `rep-tracking`, `workouts`, `device-connection` | Milestone 2 |
| `docs/architecture.md` (line 3) | "Milestone 1, plus Milestone 2 / RO-012 parts" | "Sprint 1 (Milestones 1–5)" | Milestone 3 |
| `docs/architecture.md` §2 D (line 31) | Workout domain: exercises, sets, resistance, lifecycle "*planned (M3)*" | Implemented (ADR 0010 Accepted, #33) | 2026-11-08 |
| `docs/architecture.md` §2 E (line 32) | New tables "*planned (M3)*" | Migration v2 and the workout repositories (#35) | Milestone 3 merge |
| `docs/architecture.md` §2 F (line 33) | Dashboard, exercise selection, pause "*planned (M4)*" | The workout flow, Today and History (#46, #47) | Milestone 4 merge |
| `docs/architecture.md` §2, application services | `WorkoutSessionController` only | Also `WorkoutController` (#45) | Milestone 4 merge |
| `docs/architecture.md` (line 37) | `features/device-connection` "have no code yet" | Exists since Milestone 2 | Milestone 2 |

PR 5.1 also checks `docs/hardware-protocol.md` and the agent guides (`docs/agents/*`) against the code.

## 5. Owner decisions (recommendations first)

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | Where does RO-029 (the real-sensor BLE pipeline) stand in Sprint 1? | (a) report it as in progress, carried to Sprint 2; (b) hold the Sprint 1 close until part 3 lands | **(a).** Parts 1 and 2 are merged; part 3 needs hardware and a development build |
| 2 | The parked PRs #28 (BLE adapter) and #31 (pause-aware detection, ADR 0009 Proposed) | (a) carry both to Sprint 2, findings visible; (b) resolve them before the close | **(a).** Both are at their fix-round limits, and #31 changes rep counting, which needs real-data evidence |
| 3 | ADR 0008 (wire protocol) at the close | (a) stays Proposed until hardware evidence (RO-018); (b) accept now | **(a).** Nothing has been flashed or physically verified |
| 4 | The 8 moderate npm advisories in Expo's build tooling | (a) record them as a known limitation and recheck at each Expo patch; (b) block the close | **(a).** They are build-time tooling, and no non-downgrade fix exists for SDK 58 |
| 5 | Milestone 5's Expo Go check | (a) reuse the Milestone 4 acceptance when `main` equals the accepted candidate; (b) always a fresh pass | **(a)**, with a diff to prove the equality, as done for Milestone 2 |

## 6. Prompt for Codex's independent review (PR 5.2)

> Review RepOne `main` at `<the Milestone 5 head>` as RO-015's independent Sprint 1 review, following `AGENTS.md`
> (roles, review guidelines, $0 AI API rule). Read `REPONE_SOURCE_OF_TRUTH.md`, `docs/architecture.md`, ADRs
> 0003–0010 and `docs/sprint-1-summary.md`.
>
> Check:
> 1. the module boundaries and layering against the code;
> 2. that every rep count shown or stored carries its provenance, and that simulated data is never presented as real;
> 3. that resistance is always "entered";
> 4. that the tests are strong (could a real defect pass?);
> 5. that the docs match the code.
>
> Report each finding as `[P0]`–`[P3]` with `file:line`, why it matters and a fix. Write the report to
> `docs/research/<date>-codex-RO-015-sprint-1-review.md` on a `codex/RO-015-…` branch, with a handoff. Do not change
> app code in that PR.

## 7. Risks
- **Waiting on the phone checks.** Milestone 5 waits for the owner's phone checks (redesign, upgrade, Milestone 4).
  The docs-sync rows depend on the merge commits.
- **Coverage.** The Codex review can only check what the PR diff and the repository show. Hardware behaviour stays
  in `docs/acceptance/hardware-acceptance-tests.md`.
