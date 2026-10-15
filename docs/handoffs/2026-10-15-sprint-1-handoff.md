# RepOne Agent Handoff — Sprint 1 (Claude Code → main agent)

- **Date:** 2026-10-15
- **From:** Claude Code (implementation agent)
- **Objective:** Sprint 1, a modular software foundation (React Native + Expo + TypeScript, SQLite, Zustand, Jest) that can go from simulated hardware to a real BLE device later.
- **Branch / commit:** local repo `/home/user/RepOne`, branch `main`, single commit "Sprint 1: modular RepOne foundation (core + Expo app)". **Not pushed to GitHub yet.** No repository was reachable from the session, and the owner still has to provide `owner/repo` and connect GitHub.
- **Status:**
  - **Implemented and verified by tests:** core package, sensor abstraction, simulation, rep detector, evaluation, SQLite persistence.
  - **Implemented, type-checked and bundled, NOT run on a device/simulator:** Expo app.
  - **Not started:** BLE, USB serial, machine profiles, routines, AI, weight.
- **Note:** the owner's original Sprint 1 brief was cut off mid-message (at section 3, "Required Project Structure"). Sprint 1 scope was then agreed with the owner through a multiple-choice question; the decisions are recorded below.

> **Data honesty:** no real sensor has been connected. Every rep count and accuracy number in this document comes from **synthetic, simulated data**. None of it is a measured real-world result.

---

## 1. Owner decisions made this sprint

| Decision | Choice | Record |
|---|---|---|
| Sprint 1 scope | Expo+TS monorepo shell. Pure-TS core with a `SensorSource` interface (Simulated + Replay), synthetic labelled traces, finite-state rep detector, repository interfaces + SQLite, Zustand store, minimal UI, Jest. Excludes BLE, AI and weight detection. | This doc |
| Repo layout | `apps/mobile` + `packages/core` (npm workspaces) | ADR 0001 |
| Version control | Existing GitHub repo. **Blocked:** repo name not yet provided, and GitHub access not connected to the session | Open |
| Source-of-truth §12 open decision 4 (app stack) | Resolved by the owner's stack choice | ADR 0001 |

**Not changed:** `REPONE_SOURCE_OF_TRUTH.md` is copied verbatim into the repo and unedited. Its §6 layout suggestion differs from the adopted layout; the mapping is in ADR 0001. Updating §6 needs owner approval.

## 2. Architecture

```
RepOne/
  apps/mobile/        Expo SDK 57 app (Expo Router, expo-sqlite, Zustand) — UI + composition root only
    app/              Routes: _layout.tsx (boots DI), index.tsx (workout), history.tsx
    src/di/           Composition root — the ONLY place concrete implementations are chosen
    src/persistence/  expo-sqlite adapter for the core SqlDatabase port
    src/state/        Zustand store mirroring core controller snapshots
    src/ui/           Presentational components + theme tokens
  packages/core/      @repone/core — pure TypeScript, zero React / React Native imports
    src/sensors/      SensorSource interface + SimulatedSensorSource / ReplaySensorSource
    src/simulation/   Seeded PRNG, motion synthesiser, labelled trace generator, demo scripts
    src/processing/   Calibration, MotionDetector interface, RotationalRepDetector (FSM)
    src/evaluation/   evaluateReps: precision / recall / class agreement / explicit failure lists
    src/persistence/  Repository interfaces; in-memory + SQLite (driver-agnostic) implementations; migrations
    src/session/      WorkoutSessionController: sensor → raw store → detector → event store
  docs/decisions/     ADR 0001 (stack/layout), ADR 0002 (sensor contract + detector)
```

**Data flow:** `SensorSource` → `WorkoutSessionController` → (a) raw samples are batched to `RawSampleRepository`, (b) each sample goes to `MotionDetector.push()`, which returns `RepEvent[]` for `RepEventRepository` → a `SessionSnapshot` is published to the Zustand store → UI.

**Rules enforced by structure:**
- The app imports core only through `packages/core/src/index.ts`. Dependencies run one way only: app → core.
- Core receives every dependency through injection (`SqlDatabase`, `Clock`, `Scheduler`, `IdGenerator`, `DetectorFactory`, `SensorSource`).
- New sensors (USB serial, BLE) must pass the shared contract suite `packages/core/test/sensorSources.test.ts`. New stores must pass `repositories.test.ts`.
- Units are encoded in field and column names: `_m_s2`, `_rad_s`, `_rad`, `_ms` (device-relative), `_epoch_ms` (wall clock).
- Every session stores `provenance ∈ {simulated, replay, sensor}`, enforced by a DB CHECK constraint, along with `source_kind`, `calibration_id` and `algorithm_version`. The UI shows a provenance badge next to every rep count.

## 3. Data contracts

- `RawSensorSample` keeps source-of-truth §7 field names and units verbatim: `timestamp_ms`, `source_id`, `accel_m_s2`, `gyro_rad_s`, `quality_flags`. Synthetic samples carry the flag `"synthetic"`.
- `RepEvent` matches §7 and adds three fields (ADR 0002):
  - `start_timestamp_ms`
  - `peak_excursion_rad`: algorithm-derived, not a direct measurement
  - `quality_flags`
- `confidence` is typed as `null`: no confidence is produced until a calibrated model exists.

## 4. Rep detector `rotational-rep-fsm-0.1.0`

**Scope:** rotating mechanisms only. Linear (translation) machines are NOT supported.

**Method:** integrate bias-corrected gyro about the calibrated axis. The detector runs a three-state machine:
- **SYNCING:** the reference position is unknown. This applies at start, after a sample gap > 200 ms, or after a rep is abandoned for exceeding 10 s. The detector waits for 300 ms of stillness (low-pass-filtered |ω| < 0.05 rad/s, τ = 50 ms), then zeros the angle.
- **IDLE → MOVING** once excursion reaches ≥ 20 % of the calibrated full range of motion (ROM).
- **MOVING → rep event** once excursion falls back to ≤ 10 % of ROM.

**Classification:** peak ≥ 80 % of ROM → `full`, otherwise `partial`. While idle, the detector re-zeros during stillness to control drift. All thresholds are **unvalidated hypotheses**.

**Calibration:** gyro bias is estimated from a still period. The rotation axis is the gyro axis with the most energy. ROM is the peak integrated excursion of one reference rep.

**Synthetic results:** 10-rep labelled set (8 full, 2 partial), 20 seeds per noise level, so 200 reps per row.

| Gyro noise σ (rad/s) | False positives | Missed | Misclassified |
|---|---|---|---|
| 0.01–0.06 | 0 | 0 | 0 |
| 0.08 | 0 | 8 | 0 |
| 0.12 | 1 | 65 | 0 |

**Failure modes, both covered by tests:**
- At high noise, stillness is rarely detected, so the detector can't resync.
- A large uncorrected gyro bias with no rest between reps causes drift errors.

**Bug found and fixed during the sprint:** a sample gap in the middle of a rep used to leave the FSM stuck and miss the following reps. This was fixed by adding the SYNCING state.

## 5. Tests executed (exact results)

| Command | Result |
|---|---|
| `npm test` → core (`packages/core`, ts-jest, Node 22) | 7 suites, **45/45 passed** |
| `npm test` → mobile (`apps/mobile`, jest-expo) | 1 suite, **1/1 passed** |
| `npm run typecheck` (tsc --noEmit, both workspaces) | exit 0, no errors |
| `EXPO_OFFLINE=1 npx expo export --platform android` | JS bundle built (2.9 MB Hermes bytecode) |

**SQLite coverage:** SQLite repositories are tested against Node's built-in `node:sqlite` through the same `SqlDatabase` port the app uses with expo-sqlite.

**Environment limits:**
- Expo's online API was blocked by the network proxy, so packages were installed with SDK-matched versions using `EXPO_OFFLINE=1`.
- `expo-doctor` and `expo lint` were not run.

## 6. Known limitations / risks

1. **No real hardware data.** Nothing has been validated against the MPU-6050 or the H0 rig.
2. **Detector thresholds are guesses.** The simulator assumes 50 Hz; the sampling rate and serial packet schema are still open (source of truth §12, decision 2).
3. **Unverified expo-sqlite adapter.** The adapter (`apps/mobile/src/persistence/expoSqliteDatabase.ts`) has not run on a device. `withTransactionAsync` is non-exclusive; this is safe only because the controller serialises all writes.
4. **App never launched on a device or simulator.**
5. **Work exists only in a temporary cloud container** until it's pushed to GitHub.
6. **No project license.** The Expo template's MIT LICENSE (Expo copyright) was removed; the owner needs to choose a license.
7. **No ESLint config yet.**

## 7. Questions needing owner approval

1. GitHub `owner/repo` to push to. The owner also needs to connect GitHub at https://claude.ai/connect-github.
2. Whether to record the `apps/mobile` + `packages/core` layout in source-of-truth §6.
3. Project license.

## 8. Recommended next tasks (in order)

1. Push to GitHub, then run the app on a device or simulator (`cd apps/mobile && npx expo start`). Verify the screens and SQLite persistence.
2. **Build `UsbSerialSensorSource`, or a desktop recorder that writes `RawSensorSample` JSON**, for the Uno + GY-521 (H0-A/B). It must pass the shared `SensorSource` contract suite.
3. Record labelled real traces on a controlled, unloaded rotational rig. Replay them through `ReplaySensorSource` + `evaluateReps`, and re-tune the thresholds, reporting failure cases (H0-B/C).
4. Only after that: machine profiles, routines, and the BLE source (H1).

---

## Appendix A — Full source code

Below is every hand-written source, config and doc file in the commit, so the code can be reviewed without repo access. The following are omitted: `package-lock.json`, binary assets, the Expo template's `apps/mobile/AGENTS.md`, and `REPONE_SOURCE_OF_TRUTH.md` / root `AGENTS.md` (unchanged copies of the canonical files).

### `.gitignore`

```text
node_modules/
.expo/
dist/
web-build/
coverage/
*.tsbuildinfo
.DS_Store
ios/
android/
*.log
.env*
!.env.example
```

### `README.md`

````markdown
# RepOne

Portable gym-machine rep-tracking device + companion mobile app. Read
[`REPONE_SOURCE_OF_TRUTH.md`](./REPONE_SOURCE_OF_TRUTH.md) and [`AGENTS.md`](./AGENTS.md) first.

## Actual state (Sprint 1 — 2026-10-15)

| Area | State |
|---|---|
| Hardware / real IMU data | **Not implemented.** No real sensor has been connected to this software. |
| Sensor abstraction (`SensorSource`) | Implemented: simulated + replay sources, shared contract tests |
| Synthetic labelled traces | Implemented, seeded and reproducible |
| Rotational rep detector (FSM) + full/partial | Implemented; verified **only on synthetic data** |
| Evaluation (precision / recall / failure cases) | Implemented |
| SQLite persistence + migrations | Implemented; tested via `node:sqlite`; expo-sqlite adapter type-checked, not run on device |
| Mobile app (Expo Router + Zustand) | Workout + history screens; JS bundle builds; **not yet run on a device/simulator** |
| BLE, USB serial, machine profiles, routines, AI, weight | Not started (out of Sprint 1 scope) |

All rep counts currently shown in the app come from **simulated data** and are labelled as such.

## Layout

See [ADR 0001](docs/decisions/0001-app-stack-and-monorepo-layout.md).

```
apps/mobile/     Expo app — UI, Zustand store, composition root, expo-sqlite adapter
packages/core/   Pure TypeScript domain logic (no React Native) — sensors, simulation,
                 detection, evaluation, persistence, session orchestration
docs/decisions/  Architecture decision records
```

## Getting started

Requires Node 22+ (core tests use the built-in `node:sqlite`).

```bash
npm install
npm test             # core + mobile Jest suites
npm run typecheck    # tsc --noEmit in every workspace
cd apps/mobile && npx expo start   # run in Expo Go / simulator
```

## Architecture rules

- `apps/mobile` imports `@repone/core` only through its public `src/index.ts`.
- Core receives its dependencies (SQL driver, clock, scheduler, ID generator, detector factory).
- Any new sensor (USB serial, BLE) implements `SensorSource` and must pass
  `packages/core/test/sensorSources.test.ts`; any new store must pass `repositories.test.ts`.
- Units live in field/column names (`_m_s2`, `_rad_s`, `_rad`, `_ms`, `_epoch_ms`).
````

### `apps/mobile/.gitignore`

```text
# Learn more https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files

# dependencies
node_modules/

# Expo
.expo/
dist/
web-build/
expo-env.d.ts

# Native
.kotlin/
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# debug
npm-debug.*
yarn-debug.*
yarn-error.*

# macOS
.DS_Store
*.pem

# local env files
.env*.local

# typescript
*.tsbuildinfo

# generated native folders
/ios
/android
```

### `apps/mobile/app.json`

```json
{
  "expo": {
    "name": "RepOne",
    "slug": "repone",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "scheme": "repone",
    "plugins": [
      "expo-router",
      "expo-sqlite"
    ]
  }
}
```

### `apps/mobile/app/_layout.tsx`

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppContainer } from '../src/di/useAppContainer';
import { WorkoutStoreProvider } from '../src/state/WorkoutStoreProvider';
import { colors, spacing } from '../src/ui/theme/tokens';

export default function RootLayout() {
  const boot = useAppContainer();

  if (boot.status !== 'ready') {
    return (
      <View style={styles.center}>
        {boot.status === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.error}>Could not open local storage: {boot.message}</Text>
        )}
      </View>
    );
  }

  return (
    <WorkoutStoreProvider container={boot.container}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ title: 'RepOne' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
      </Stack>
    </WorkoutStoreProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  error: { color: colors.danger, textAlign: 'center' },
});
```

### `apps/mobile/app/history.tsx`

```tsx
import type { WorkoutSessionSummary } from '@repone/core';
import { useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useWorkout } from '../src/state/WorkoutStoreProvider';
import { ProvenanceBadge } from '../src/ui/components/ProvenanceBadge';
import { colors, spacing } from '../src/ui/theme/tokens';

function formatDuration(s: WorkoutSessionSummary): string {
  if (s.ended_at_epoch_ms === null) return 'in progress';
  const seconds = Math.round((s.ended_at_epoch_ms - s.started_at_epoch_ms) / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function HistoryScreen() {
  const history = useWorkout((s) => s.history);
  const historyError = useWorkout((s) => s.historyError);
  const refreshHistory = useWorkout((s) => s.refreshHistory);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={history}
      keyExtractor={(s) => s.id}
      ListEmptyComponent={
        <Text style={styles.empty}>{historyError ?? 'No sets recorded yet. Data is stored only on this device.'}</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.title}>{item.machine_label ?? 'Unlabelled set'}</Text>
            <Text style={styles.reps}>
              {item.full_rep_count} full · {item.partial_rep_count} partial
            </Text>
          </View>
          <Text style={styles.meta}>
            {new Date(item.started_at_epoch_ms).toLocaleString()} · {formatDuration(item)}
          </Text>
          <ProvenanceBadge provenance={item.provenance} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 },
  reps: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
```

### `apps/mobile/app/index.tsx`

```tsx
import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useWorkout } from '../src/state/WorkoutStoreProvider';
import { PrimaryButton } from '../src/ui/components/PrimaryButton';
import { ProvenanceBadge } from '../src/ui/components/ProvenanceBadge';
import { RepCounter } from '../src/ui/components/RepCounter';
import { colors, spacing } from '../src/ui/theme/tokens';

const STATUS_TEXT = {
  idle: 'Ready',
  starting: 'Starting…',
  recording: 'Recording',
  stopping: 'Saving…',
  finished: 'Set saved',
  error: 'Error',
} as const;

export default function WorkoutScreen() {
  const session = useWorkout((s) => s.session);
  const startSimulatedSet = useWorkout((s) => s.startSimulatedSet);
  const stop = useWorkout((s) => s.stop);
  const dismissResult = useWorkout((s) => s.dismissResult);
  const [machineLabel, setMachineLabel] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const recording = session.status === 'recording';
  const busy = session.status === 'starting' || session.status === 'stopping';
  const done = session.status === 'finished' || session.status === 'error';

  const run = (action: () => Promise<void>) => {
    setActionError(null);
    action().catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.status}>{STATUS_TEXT[session.status]}</Text>
          <ProvenanceBadge provenance={session.provenance ?? 'simulated'} />
        </View>
        <View style={styles.counters}>
          <RepCounter label="Full reps" value={session.fullReps} emphasis />
          <RepCounter label="Partial" value={session.partialReps} />
        </View>
        <Text style={styles.meta}>
          {session.samplesReceived} samples · algorithm-derived counts, unvalidated on real hardware
        </Text>
      </View>

      {!recording && !busy && !done && (
        <TextInput
          style={styles.input}
          placeholder="Machine / exercise (optional)"
          placeholderTextColor={colors.textMuted}
          value={machineLabel}
          onChangeText={setMachineLabel}
          maxLength={60}
        />
      )}

      {recording || busy ? (
        <PrimaryButton label="Stop set" tone="danger" disabled={busy} onPress={() => run(stop)} />
      ) : done ? (
        <PrimaryButton label="New set" onPress={dismissResult} />
      ) : (
        <PrimaryButton label="Start simulated set" onPress={() => run(() => startSimulatedSet(machineLabel))} />
      )}

      {(session.error ?? actionError) && <Text style={styles.error}>{session.error ?? actionError}</Text>}

      <Link href="/history" style={styles.link}>
        View history
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  status: { fontSize: 16, fontWeight: '600', color: colors.text },
  counters: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md },
  meta: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger },
  link: { color: colors.primary, fontSize: 16, textAlign: 'center', paddingVertical: spacing.sm },
});
```

### `apps/mobile/package.json`

```json
{
  "name": "@repone/mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "dependencies": {
    "@repone/core": "*",
    "expo": "~57.0.30",
    "expo-constants": "~57.0.22",
    "expo-linking": "~57.0.13",
    "expo-router": "~57.0.28",
    "expo-sqlite": "~57.0.4",
    "expo-status-bar": "~57.0.1",
    "react": "19.2.3",
    "react-native": "0.86.3",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "~4.26.0",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/react": "~19.2.2",
    "jest": "^29.7.0",
    "jest-expo": "~57.0.6",
    "typescript": "~6.0.3"
  },
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "private": true,
  "jest": {
    "preset": "jest-expo"
  }
}
```

### `apps/mobile/src/di/createAppContainer.ts`

```ts
import {
  DEMO_LOOP_SCRIPT,
  RotationalRepDetector,
  SimulatedSensorSource,
  WorkoutSessionController,
  createSqliteRepositories,
  createSyntheticCalibration,
  migrate,
  systemClock,
  type Clock,
  type RepCalibration,
  type Repositories,
  type SensorSource,
} from '@repone/core';
import { openExpoSqliteDatabase } from '../persistence/expoSqliteDatabase';

/** Everything screens and stores are allowed to depend on. */
export interface AppContainer {
  readonly repositories: Repositories;
  readonly controller: WorkoutSessionController;
  /** Source for the next session. Sprint 1: simulated only; BLE will plug in here. */
  readonly createSensor: () => SensorSource;
  readonly getCalibration: () => RepCalibration;
}

export const createLocalId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Wire concrete implementations to core interfaces given a repositories bundle. */
export function assembleContainer(repositories: Repositories, clock: Clock = systemClock): AppContainer {
  const controller = new WorkoutSessionController({
    repositories,
    clock,
    createId: createLocalId,
    createDetector: (sessionId, calibration) => new RotationalRepDetector(sessionId, calibration),
  });
  return {
    repositories,
    controller,
    createSensor: () =>
      new SimulatedSensorSource({
        script: DEMO_LOOP_SCRIPT,
        simulation: {
          sourceId: 'simulated-imu-01',
          sampleRateHz: 50,
          seed: Math.floor(Math.random() * 2 ** 31),
          gyroNoiseRadS: 0.02,
          accelNoiseMS2: 0.05,
        },
      }),
    getCalibration: () => createSyntheticCalibration(clock.now()),
  };
}

/** Composition root: the only place concrete implementations are chosen. */
export async function createAppContainer(): Promise<AppContainer> {
  const db = await openExpoSqliteDatabase('repone.db');
  await migrate(db);
  return assembleContainer(createSqliteRepositories(db));
}
```

### `apps/mobile/src/di/useAppContainer.ts`

```ts
import { useEffect, useState } from 'react';
import { createAppContainer, type AppContainer } from './createAppContainer';

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; container: AppContainer }
  | { status: 'error'; message: string };

/** Boots the composition root once (opens + migrates the local database). */
export function useAppContainer(): BootState {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    createAppContainer().then(
      (container) => !cancelled && setState({ status: 'ready', container }),
      (error: unknown) =>
        !cancelled && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
```

### `apps/mobile/src/persistence/expoSqliteDatabase.ts`

```ts
import { openDatabaseAsync } from 'expo-sqlite';
import type { SqlDatabase } from '@repone/core';

/**
 * Adapts expo-sqlite to the core `SqlDatabase` port. This is the only file in
 * the app that touches the SQLite driver directly.
 *
 * Note: `withTransactionAsync` is not exclusive; that is safe here because
 * `WorkoutSessionController` serialises all writes through one queue.
 */
export async function openExpoSqliteDatabase(name: string): Promise<SqlDatabase> {
  const db = await openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, [...params]);
    },
    all: <T>(sql: string, params: readonly (string | number | null)[] = []) => db.getAllAsync<T>(sql, [...params]),
    transaction: (work) => db.withTransactionAsync(work),
  };
}
```

### `apps/mobile/src/state/WorkoutStoreProvider.tsx`

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { AppContainer } from '../di/createAppContainer';
import { createWorkoutStore, type WorkoutState, type WorkoutStore } from './workoutStore';

const WorkoutStoreContext = createContext<WorkoutStore | null>(null);

export function WorkoutStoreProvider({ container, children }: { container: AppContainer; children: ReactNode }) {
  const store = useMemo(() => createWorkoutStore(container), [container]);
  return <WorkoutStoreContext.Provider value={store}>{children}</WorkoutStoreContext.Provider>;
}

export function useWorkout<T>(selector: (state: WorkoutState) => T): T {
  const store = useContext(WorkoutStoreContext);
  if (!store) throw new Error('useWorkout must be used inside WorkoutStoreProvider');
  return useStore(store, selector);
}
```

### `apps/mobile/src/state/__tests__/workoutStore.test.ts`

```ts
import { DEMO_LOOP_SCRIPT, SimulatedSensorSource, createInMemoryRepositories, type Scheduler } from '@repone/core';
import { assembleContainer } from '../../di/createAppContainer';
import { createWorkoutStore } from '../workoutStore';

/** Advance-on-demand scheduler so the simulated sensor runs deterministically. */
function manualScheduler() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const scheduler: Scheduler = {
    setInterval: (cb) => {
      timers.set(next, cb);
      return next++;
    },
    clearInterval: (h) => void timers.delete(h as number),
  };
  return { scheduler, tick: (n: number) => { for (let i = 0; i < n; i++) timers.forEach((cb) => cb()); } };
}

describe('workoutStore', () => {
  it('mirrors controller snapshots and refreshes history when a set finishes', async () => {
    const { scheduler, tick } = manualScheduler();
    const base = assembleContainer(createInMemoryRepositories(), { now: () => 1_700_000_000_000 });
    const container = {
      ...base,
      // Same simulated sensor as the app, but driven by a test scheduler.
      createSensor: () =>
        new SimulatedSensorSource({
          script: DEMO_LOOP_SCRIPT,
          simulation: { sourceId: 'sim-test', sampleRateHz: 50, seed: 1, gyroNoiseRadS: 0.02 },
          scheduler,
        }),
    };
    const store = createWorkoutStore(container);

    await store.getState().startSimulatedSet('  Lat pulldown  ');
    expect(store.getState().session.status).toBe('recording');
    expect(store.getState().session.provenance).toBe('simulated');

    tick(200); // 20 s of simulated motion at 100 ms per tick
    expect(store.getState().session.fullReps).toBeGreaterThan(0);

    await store.getState().stop();
    expect(store.getState().session.status).toBe('finished');
    await store.getState().refreshHistory();

    const [latest] = store.getState().history;
    expect(latest).toMatchObject({
      machine_label: 'Lat pulldown',
      provenance: 'simulated',
      full_rep_count: store.getState().session.fullReps,
    });

    store.getState().dismissResult();
    expect(store.getState().session.status).toBe('idle');
  });
});
```

### `apps/mobile/src/state/workoutStore.ts`

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SessionSnapshot, WorkoutSessionSummary } from '@repone/core';
import type { AppContainer } from '../di/createAppContainer';

export interface WorkoutState {
  readonly session: SessionSnapshot;
  readonly history: readonly WorkoutSessionSummary[];
  readonly historyError: string | null;
  startSimulatedSet(machineLabel?: string): Promise<void>;
  stop(): Promise<void>;
  dismissResult(): void;
  refreshHistory(): Promise<void>;
}

export type WorkoutStore = StoreApi<WorkoutState>;

/**
 * Thin UI-state adapter over the core session controller. Business rules live
 * in @repone/core; this store only mirrors snapshots and exposes actions.
 */
export function createWorkoutStore(
  container: Pick<AppContainer, 'controller' | 'repositories' | 'createSensor' | 'getCalibration'>,
): WorkoutStore {
  const { controller, repositories } = container;

  const store = createStore<WorkoutState>()((set) => ({
    session: controller.getSnapshot(),
    history: [],
    historyError: null,

    async startSimulatedSet(machineLabel) {
      await controller.start({
        sensor: container.createSensor(),
        calibration: container.getCalibration(),
        machineLabel: machineLabel?.trim() || null,
      });
    },

    async stop() {
      await controller.stop();
    },

    dismissResult() {
      controller.reset();
    },

    async refreshHistory() {
      try {
        set({ history: await repositories.sessions.listRecent(50), historyError: null });
      } catch (error) {
        set({ historyError: error instanceof Error ? error.message : String(error) });
      }
    },
  }));

  controller.subscribe((session) => {
    store.setState({ session });
    if (session.status === 'finished') void store.getState().refreshHistory();
  });

  return store;
}
```

### `apps/mobile/src/ui/components/PrimaryButton.tsx`

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger';
}

export function PrimaryButton({ label, onPress, disabled = false, tone = 'primary' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tone === 'danger' ? colors.danger : colors.primary },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 12, paddingVertical: spacing.md, alignItems: 'center' },
  dimmed: { opacity: 0.6 },
  label: { color: colors.primaryText, fontSize: 17, fontWeight: '600' },
});
```

### `apps/mobile/src/ui/components/ProvenanceBadge.tsx`

```tsx
import type { DataProvenance } from '@repone/core';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';

const LABELS: Record<DataProvenance, string> = {
  simulated: 'Simulated data — not a real measurement',
  replay: 'Replayed recording',
  sensor: 'Live sensor',
};

/** Always shown next to rep counts so synthetic numbers are never mistaken for real ones. */
export function ProvenanceBadge({ provenance }: { provenance: DataProvenance }) {
  return (
    <View style={[styles.badge, provenance !== 'sensor' && styles.warning]}>
      <Text style={[styles.text, provenance !== 'sensor' && styles.warningText]}>{LABELS[provenance]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    backgroundColor: colors.border,
  },
  warning: { backgroundColor: colors.warningBg },
  text: { fontSize: 12, fontWeight: '600', color: colors.text },
  warningText: { color: colors.warningText },
});
```

### `apps/mobile/src/ui/components/RepCounter.tsx`

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';

export function RepCounter({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <View style={styles.container} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.value, emphasis && styles.emphasis]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  value: { fontSize: 44, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  emphasis: { fontSize: 72, color: colors.text },
  label: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
});
```

### `apps/mobile/src/ui/theme/tokens.ts`

```ts
export const colors = {
  background: '#F7F7F5',
  surface: '#FFFFFF',
  text: '#16181D',
  textMuted: '#5F6672',
  border: '#E3E4E8',
  primary: '#1F5EFF',
  primaryText: '#FFFFFF',
  danger: '#C62D2D',
  warningBg: '#FFF4DB',
  warningText: '#7A5200',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
```

### `apps/mobile/tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

### `docs/decisions/0001-app-stack-and-monorepo-layout.md`

````markdown
# ADR 0001 — App stack and monorepo layout

- **Date:** 2026-10-15
- **Status:** Accepted (owner approved layout option "apps/mobile + packages/core" on 2026-10-15)
- **Resolves:** Source of truth §12 open decision 4 ("Initial app stack/platform and repo status")

## Context

The repository did not exist before Sprint 1 — nothing to migrate. The owner specified
React Native + Expo + TypeScript, SQLite (offline-first), Zustand, Expo Router / React
Navigation, and Jest. The source of truth (§6) *suggests* a `software/{capture,processing,app}`
layout; the Sprint 1 brief requested `apps/mobile/`. Business logic must be testable without
React Native (principle 7) and replaceable (principle 8).

## Decision

npm-workspaces monorepo:

```
RepOne/
  apps/mobile/        Expo SDK 57 app (Expo Router, expo-sqlite, Zustand). UI + composition root only.
    app/              Routes (screens) — Expo Router file-based routing
    src/di/           Composition root: picks concrete implementations
    src/persistence/  expo-sqlite adapter for the core SqlDatabase port
    src/state/        Zustand store mirroring core controller snapshots
    src/ui/           Presentational components + theme tokens
  packages/core/      @repone/core — pure TypeScript, no React / React Native imports
    src/sensors/      SensorSource interface + Simulated / Replay implementations
    src/simulation/   Seeded synthetic motion + labelled traces
    src/processing/   Calibration, MotionDetector interface, rotational rep FSM
    src/evaluation/   Precision / recall / failure-case evaluation vs labels
    src/persistence/  Repository interfaces, in-memory + SQLite (driver-agnostic) implementations
    src/session/      WorkoutSessionController (sensor → store → detector → events)
  docs/decisions/     ADRs
```

Dependency direction is one-way: `apps/mobile` → `@repone/core` public API (`src/index.ts`) only.
Core never imports a concrete SQLite driver, timer or UI; those are injected (`SqlDatabase`,
`Scheduler`, `Clock`, `IdGenerator`, `DetectorFactory`).

Mapping to source-of-truth §6: `packages/core/src/sensors` ≈ `software/capture`,
`packages/core/src/{processing,evaluation}` ≈ `software/processing`, `apps/mobile` ≈ `software/app`.
`firmware/`, `data/`, `docs/{experiments,hardware,product}` remain as suggested and will be added
when there is content.

## Consequences

- Core logic is tested under plain Node/Jest (ts-jest); SQLite repositories are tested against
  Node's built-in `node:sqlite` through the same port the app uses with expo-sqlite.
- Metro consumes `@repone/core` as TypeScript source via workspaces (no build step).
- A future Python analysis toolchain (§4 H0) can live alongside without affecting the app.
- **Source of truth §6 has not been edited**; update it if the owner wants this layout recorded there.
````

### `docs/decisions/0002-sensor-contract-and-rep-detector.md`

````markdown
# ADR 0002 — Sensor contract, provenance and baseline rep detector

- **Date:** 2026-10-15
- **Status:** Proposed (implemented in Sprint 1; thresholds unvalidated on real hardware)

## Sensor contract

`RawSensorSample` keeps the source-of-truth §7 field names and units **verbatim**
(`timestamp_ms`, `source_id`, `accel_m_s2`, `gyro_rad_s`, `quality_flags`). `timestamp_ms` is
device-relative, not wall-clock; wall-clock fields are explicitly named `*_epoch_ms`.

`SensorSource` (start / stop / subscribe / subscribeStatus, plus `kind` and `provenance`) is the
only hardware boundary. Implemented: `SimulatedSensorSource` (live, seeded synthetic motion) and
`ReplaySensorSource` (immediate or real-time replay). A shared Jest contract suite runs against
every implementation; USB-serial / BLE sources must pass the same suite.

## Provenance

Every session stores `provenance ∈ {simulated, replay, sensor}` (DB `CHECK` constraint), the
`source_kind`, `calibration_id` and `algorithm_version`. Synthetic samples carry the
`synthetic` quality flag; calibrations carry `provenance: synthetic | user_reference_rep`. The UI
shows a provenance badge next to every rep count.

## Derived event — additive fields

`RepEvent` matches §7 and adds three fields: `start_timestamp_ms`, `peak_excursion_rad`
(integrated, algorithm-derived — not a direct measurement) and `quality_flags`.
`confidence` is typed as `null` — no confidence is produced until a calibrated model exists.

## Baseline detector: `rotational-rep-fsm-0.1.0`

For rotating mechanisms only (the SoT's recommended first rig). Integrates bias-corrected
gyro about the calibrated axis; states SYNCING → IDLE → MOVING:

- SYNCING: reference position unknown (session start, after a sample gap > 200 ms, or after an
  abandoned rep > 10 s). Waits for 300 ms of stillness (low-pass-filtered |ω| < 0.05 rad/s,
  τ = 50 ms), then zeros the angle.
- IDLE → MOVING at ≥ 20 % of calibrated full ROM; MOVING → rep event when back to ≤ 10 %.
- Classification: peak ≥ 80 % ROM → `full`, else `partial`.
- Re-zeros during stillness while idle (drift control).

These thresholds are **starting hypotheses**, not tuned values.

### Synthetic results (not real-world accuracy)

On the seeded 10-rep labelled set (8 full, 2 partial), sweep of 20 seeds per noise level:

| Gyro noise σ (rad/s) | FP | FN | Misclassified (of 200) |
|---|---|---|---|
| 0.01–0.06 | 0 | 0 | 0 |
| 0.08 | 0 | 8 | 0 |
| 0.12 | 1 | 65 | 0 |

Failure mode at high noise: stillness is rarely detected, so the detector cannot (re)sync.
Also documented by test: large uncorrected gyro bias with no rest between reps drifts and
causes errors. Translation (linear-ROM) machines are **not supported** by this detector.

## Open questions

- Real MPU-6050 noise, vibration and bias on the H0 rig; re-tune thresholds against labelled
  recordings (SoT H0-B/C).
- Sample rate and serial packet schema (SoT §12 decision 2) — the simulator assumes 50 Hz.
````

### `package.json`

```json
{
  "name": "repone",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

### `packages/core/jest.config.js`

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'Node16', moduleResolution: 'Node16', isolatedModules: true } }],
  },
};
```

### `packages/core/package.json`

```json
{
  "name": "@repone/core",
  "version": "0.1.0",
  "private": true,
  "description": "UI-free RepOne domain logic: sensor contracts, simulation, rep detection, persistence, session orchestration.",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.4.15",
    "typescript": "~6.0.3"
  }
}
```

### `packages/core/src/common/types.ts`

```ts
/** A 3-axis vector. Units are always given by the field name that holds it. */
export type Vec3 = readonly [number, number, number];

/** Index of a sensor axis: 0 = x, 1 = y, 2 = z (sensor frame). */
export type AxisIndex = 0 | 1 | 2;

export type Unsubscribe = () => void;

/** Monotonic-enough wall clock, injected so logic is testable. Epoch milliseconds. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export type IdGenerator = () => string;

/** Timer abstraction so streaming sources can be driven deterministically in tests. */
export interface Scheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Where a piece of data came from. Every persisted session and metric carries one,
 * so simulated/synthetic numbers can never be mistaken for real measurements.
 */
export type DataProvenance = 'simulated' | 'replay' | 'sensor';
```

### `packages/core/src/evaluation/evaluateReps.ts`

```ts
import type { RepEvent } from '../processing/events';
import type { GroundTruthRep } from '../simulation/motion';

export interface RepEvaluation {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /** null when undefined (no detections / no labels) rather than a misleading 0 or 1. */
  readonly precision: number | null;
  readonly recall: number | null;
  /** Of matched reps, fraction whose full/partial class agrees with the label. */
  readonly classificationAgreement: number | null;
  readonly unmatchedDetections: readonly RepEvent[];
  readonly missedLabels: readonly GroundTruthRep[];
  readonly misclassified: ReadonlyArray<{ label: GroundTruthRep; event: RepEvent }>;
}

/**
 * One-to-one match detections against labelled reps. A detection matches a
 * label when its completion time falls within [label.startMs, label.endMs + toleranceMs].
 * Failure cases are returned explicitly, not just aggregate rates.
 */
export function evaluateReps(
  detections: readonly RepEvent[],
  labels: readonly GroundTruthRep[],
  toleranceMs = 250,
): RepEvaluation {
  const used = new Set<number>();
  const matched: Array<{ label: GroundTruthRep; event: RepEvent }> = [];
  const missedLabels: GroundTruthRep[] = [];

  for (const label of labels) {
    const index = detections.findIndex(
      (e, i) => !used.has(i) && e.timestamp_ms >= label.startMs && e.timestamp_ms <= label.endMs + toleranceMs,
    );
    if (index === -1) {
      missedLabels.push(label);
    } else {
      used.add(index);
      matched.push({ label, event: detections[index]! });
    }
  }

  const unmatchedDetections = detections.filter((_, i) => !used.has(i));
  const misclassified = matched.filter((m) => m.event.classification !== m.label.classification);
  const tp = matched.length;
  const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

  return {
    truePositives: tp,
    falsePositives: unmatchedDetections.length,
    falseNegatives: missedLabels.length,
    precision: ratio(tp, detections.length),
    recall: ratio(tp, labels.length),
    classificationAgreement: ratio(tp - misclassified.length, tp),
    unmatchedDetections,
    missedLabels,
    misclassified,
  };
}
```

### `packages/core/src/index.ts`

```ts
// Public API of @repone/core. Consumers import from here only — never from internal paths.

export * from './common/types';

export type { RawSensorSample, SensorSource, SensorSourceKind, SensorStatus } from './sensors/types';
export { SimulatedSensorSource, type SimulatedSensorSourceDeps } from './sensors/SimulatedSensorSource';
export { ReplaySensorSource, type ReplaySensorSourceDeps } from './sensors/ReplaySensorSource';

export { createRandom, type Random } from './simulation/prng';
export {
  GRAVITY_M_S2,
  MotionSynthesizer,
  generateTrace,
  type GroundTruthRep,
  type MotionScript,
  type MotionSegment,
  type SimulationOptions,
  type SyntheticTrace,
} from './simulation/motion';
export { DEMO_FULL_ROM_RAD, DEMO_LOOP_SCRIPT, LABELLED_SET_SCRIPT, createSyntheticCalibration } from './simulation/scripts';

export {
  calibrateFromReferenceRep,
  dominantAxis,
  estimateGyroBias,
  measurePeakExcursionRad,
  type CalibrateFromReferenceInput,
  type RepCalibration,
} from './processing/calibration';
export type { MotionDetector, RepEvent } from './processing/events';
export {
  DEFAULT_ROTATIONAL_REP_CONFIG,
  ROTATIONAL_REP_ALGORITHM_VERSION,
  RotationalRepDetector,
  type RotationalRepDetectorConfig,
} from './processing/RotationalRepDetector';

export { evaluateReps, type RepEvaluation } from './evaluation/evaluateReps';

export type {
  CalibrationRepository,
  RawSampleRepository,
  RepEventRepository,
  Repositories,
  SessionRepository,
  WorkoutSession,
  WorkoutSessionSummary,
} from './persistence/types';
export { createInMemoryRepositories } from './persistence/memory/createInMemoryRepositories';
export type { SqlDatabase, SqlValue } from './persistence/sqlite/SqlDatabase';
export { MIGRATIONS, migrate } from './persistence/sqlite/migrations';
export { createSqliteRepositories } from './persistence/sqlite/createSqliteRepositories';

export {
  WorkoutSessionController,
  type DetectorFactory,
  type SessionSnapshot,
  type SessionStatus,
  type StartSessionParams,
  type WorkoutSessionControllerDeps,
} from './session/WorkoutSessionController';
```

### `packages/core/src/persistence/memory/createInMemoryRepositories.ts`

```ts
import type { RepCalibration } from '../../processing/calibration';
import type { RepEvent } from '../../processing/events';
import type { RawSensorSample } from '../../sensors/types';
import type { Repositories, WorkoutSession } from '../types';

/** Non-persistent repositories for tests and previews. Same contract as SQLite. */
export function createInMemoryRepositories(): Repositories {
  const sessions = new Map<string, WorkoutSession>();
  const samples = new Map<string, RawSensorSample[]>();
  const events = new Map<string, RepEvent[]>();
  const calibrations = new Map<string, RepCalibration>();

  return {
    sessions: {
      async create(session) {
        if (sessions.has(session.id)) throw new Error(`Session ${session.id} already exists`);
        sessions.set(session.id, session);
      },
      async markEnded(sessionId, endedAtEpochMs) {
        const session = sessions.get(sessionId);
        if (!session) throw new Error(`Unknown session ${sessionId}`);
        sessions.set(sessionId, { ...session, ended_at_epoch_ms: endedAtEpochMs });
      },
      async getById(sessionId) {
        return sessions.get(sessionId) ?? null;
      },
      async listRecent(limit) {
        return [...sessions.values()]
          .sort((a, b) => b.started_at_epoch_ms - a.started_at_epoch_ms)
          .slice(0, limit)
          .map((s) => {
            const list = events.get(s.id) ?? [];
            return {
              ...s,
              full_rep_count: list.filter((e) => e.classification === 'full').length,
              partial_rep_count: list.filter((e) => e.classification === 'partial').length,
            };
          });
      },
    },
    rawSamples: {
      async appendBatch(sessionId, batch) {
        samples.set(sessionId, [...(samples.get(sessionId) ?? []), ...batch]);
      },
      async listBySession(sessionId) {
        return [...(samples.get(sessionId) ?? [])];
      },
    },
    repEvents: {
      async append(event) {
        events.set(event.session_id, [...(events.get(event.session_id) ?? []), event]);
      },
      async listBySession(sessionId) {
        return [...(events.get(sessionId) ?? [])];
      },
    },
    calibrations: {
      async save(calibration) {
        calibrations.set(calibration.calibration_id, calibration);
      },
      async getById(calibrationId) {
        return calibrations.get(calibrationId) ?? null;
      },
    },
  };
}
```

### `packages/core/src/persistence/sqlite/SqlDatabase.ts`

```ts
export type SqlValue = string | number | null;

/**
 * Minimal async SQL port. The mobile app adapts expo-sqlite to it; tests adapt
 * Node's built-in `node:sqlite`. Core never imports a concrete driver.
 */
export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Runs `work` atomically; rolls back if it throws. */
  transaction(work: () => Promise<void>): Promise<void>;
}
```

### `packages/core/src/persistence/sqlite/createSqliteRepositories.ts`

```ts
import type { AxisIndex } from '../../common/types';
import type { RepCalibration } from '../../processing/calibration';
import type { RepEvent } from '../../processing/events';
import type { RawSensorSample } from '../../sensors/types';
import type { Repositories, WorkoutSession, WorkoutSessionSummary } from '../types';
import type { SqlDatabase } from './SqlDatabase';

interface SessionRow extends Omit<WorkoutSession, 'activity_type'> {
  activity_type: string;
}

interface RawSampleRow {
  timestamp_ms: number;
  source_id: string;
  accel_x_m_s2: number;
  accel_y_m_s2: number;
  accel_z_m_s2: number;
  gyro_x_rad_s: number;
  gyro_y_rad_s: number;
  gyro_z_rad_s: number;
  quality_flags: string;
}

interface RepEventRow {
  session_id: string;
  timestamp_ms: number;
  start_timestamp_ms: number;
  classification: 'full' | 'partial';
  peak_excursion_rad: number;
  calibration_id: string;
  algorithm_version: string;
  quality_flags: string;
}

interface CalibrationRow {
  calibration_id: string;
  axis: number;
  gyro_bias_x_rad_s: number;
  gyro_bias_y_rad_s: number;
  gyro_bias_z_rad_s: number;
  full_rom_rad: number;
  provenance: RepCalibration['provenance'];
  created_at_epoch_ms: number;
}

const SESSION_COLUMNS =
  'id, activity_type, provenance, source_id, source_kind, calibration_id, algorithm_version, machine_label, started_at_epoch_ms, ended_at_epoch_ms';

const toSession = (row: SessionRow): WorkoutSession => ({ ...row, activity_type: 'gym' });

/** SQLite-backed repositories. Call `migrate(db)` before use. */
export function createSqliteRepositories(db: SqlDatabase): Repositories {
  return {
    sessions: {
      async create(s) {
        await db.run(`INSERT INTO workout_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          s.id,
          s.activity_type,
          s.provenance,
          s.source_id,
          s.source_kind,
          s.calibration_id,
          s.algorithm_version,
          s.machine_label,
          s.started_at_epoch_ms,
          s.ended_at_epoch_ms,
        ]);
      },
      async markEnded(sessionId, endedAtEpochMs) {
        await db.run('UPDATE workout_sessions SET ended_at_epoch_ms = ? WHERE id = ?', [endedAtEpochMs, sessionId]);
      },
      async getById(sessionId) {
        const rows = await db.all<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`, [sessionId]);
        return rows[0] ? toSession(rows[0]) : null;
      },
      async listRecent(limit) {
        const rows = await db.all<SessionRow & { full_rep_count: number; partial_rep_count: number }>(
          `SELECT ${SESSION_COLUMNS.split(', ').map((c) => `s.${c}`).join(', ')},
             COALESCE(SUM(e.classification = 'full'), 0) AS full_rep_count,
             COALESCE(SUM(e.classification = 'partial'), 0) AS partial_rep_count
           FROM workout_sessions s
           LEFT JOIN rep_events e ON e.session_id = s.id
           GROUP BY s.id
           ORDER BY s.started_at_epoch_ms DESC
           LIMIT ?`,
          [limit],
        );
        return rows.map((r): WorkoutSessionSummary => ({
          ...toSession(r),
          full_rep_count: Number(r.full_rep_count),
          partial_rep_count: Number(r.partial_rep_count),
        }));
      },
    },

    rawSamples: {
      async appendBatch(sessionId, samples) {
        if (samples.length === 0) return;
        await db.transaction(async () => {
          for (const s of samples) {
            await db.run(
              `INSERT INTO raw_samples (session_id, timestamp_ms, source_id,
                 accel_x_m_s2, accel_y_m_s2, accel_z_m_s2, gyro_x_rad_s, gyro_y_rad_s, gyro_z_rad_s, quality_flags)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                sessionId,
                s.timestamp_ms,
                s.source_id,
                ...s.accel_m_s2,
                ...s.gyro_rad_s,
                JSON.stringify(s.quality_flags),
              ],
            );
          }
        });
      },
      async listBySession(sessionId) {
        const rows = await db.all<RawSampleRow>(
          'SELECT * FROM raw_samples WHERE session_id = ? ORDER BY timestamp_ms, rowid',
          [sessionId],
        );
        return rows.map(
          (r): RawSensorSample => ({
            timestamp_ms: r.timestamp_ms,
            source_id: r.source_id,
            accel_m_s2: [r.accel_x_m_s2, r.accel_y_m_s2, r.accel_z_m_s2],
            gyro_rad_s: [r.gyro_x_rad_s, r.gyro_y_rad_s, r.gyro_z_rad_s],
            quality_flags: JSON.parse(r.quality_flags) as string[],
          }),
        );
      },
    },

    repEvents: {
      async append(e) {
        await db.run(
          `INSERT INTO rep_events (session_id, timestamp_ms, start_timestamp_ms, classification, peak_excursion_rad,
             confidence, calibration_id, algorithm_version, provenance, quality_flags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.session_id,
            e.timestamp_ms,
            e.start_timestamp_ms,
            e.classification,
            e.peak_excursion_rad,
            e.confidence,
            e.calibration_id,
            e.algorithm_version,
            e.provenance,
            JSON.stringify(e.quality_flags),
          ],
        );
      },
      async listBySession(sessionId) {
        const rows = await db.all<RepEventRow>(
          'SELECT * FROM rep_events WHERE session_id = ? ORDER BY timestamp_ms, rowid',
          [sessionId],
        );
        return rows.map(
          (r): RepEvent => ({
            session_id: r.session_id,
            activity_type: 'gym',
            event_type: 'rep_completed',
            timestamp_ms: r.timestamp_ms,
            value: 1,
            classification: r.classification,
            confidence: null,
            calibration_id: r.calibration_id,
            algorithm_version: r.algorithm_version,
            provenance: 'imu_algorithm',
            start_timestamp_ms: r.start_timestamp_ms,
            peak_excursion_rad: r.peak_excursion_rad,
            quality_flags: JSON.parse(r.quality_flags) as string[],
          }),
        );
      },
    },

    calibrations: {
      async save(c) {
        await db.run(
          `INSERT OR REPLACE INTO calibrations (calibration_id, axis, gyro_bias_x_rad_s, gyro_bias_y_rad_s,
             gyro_bias_z_rad_s, full_rom_rad, provenance, created_at_epoch_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.calibration_id, c.axis, ...c.gyro_bias_rad_s, c.full_rom_rad, c.provenance, c.created_at_epoch_ms],
        );
      },
      async getById(calibrationId) {
        const rows = await db.all<CalibrationRow>('SELECT * FROM calibrations WHERE calibration_id = ?', [calibrationId]);
        const r = rows[0];
        if (!r) return null;
        return {
          calibration_id: r.calibration_id,
          axis: r.axis as AxisIndex,
          gyro_bias_rad_s: [r.gyro_bias_x_rad_s, r.gyro_bias_y_rad_s, r.gyro_bias_z_rad_s],
          full_rom_rad: r.full_rom_rad,
          provenance: r.provenance,
          created_at_epoch_ms: r.created_at_epoch_ms,
        };
      },
    },
  };
}
```

### `packages/core/src/persistence/sqlite/migrations.ts`

```ts
import type { SqlDatabase } from './SqlDatabase';

/**
 * Ordered, append-only schema migrations. Never edit a shipped migration —
 * add a new one. Units are encoded in column names.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE calibrations (
    calibration_id TEXT PRIMARY KEY NOT NULL,
    axis INTEGER NOT NULL CHECK (axis IN (0, 1, 2)),
    gyro_bias_x_rad_s REAL NOT NULL,
    gyro_bias_y_rad_s REAL NOT NULL,
    gyro_bias_z_rad_s REAL NOT NULL,
    full_rom_rad REAL NOT NULL,
    provenance TEXT NOT NULL,
    created_at_epoch_ms INTEGER NOT NULL
  );

  CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    activity_type TEXT NOT NULL,
    provenance TEXT NOT NULL CHECK (provenance IN ('simulated', 'replay', 'sensor')),
    source_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    calibration_id TEXT NOT NULL REFERENCES calibrations (calibration_id),
    algorithm_version TEXT NOT NULL,
    machine_label TEXT,
    started_at_epoch_ms INTEGER NOT NULL,
    ended_at_epoch_ms INTEGER
  );
  CREATE INDEX idx_workout_sessions_started ON workout_sessions (started_at_epoch_ms DESC);

  CREATE TABLE raw_samples (
    session_id TEXT NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
    timestamp_ms INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    accel_x_m_s2 REAL NOT NULL,
    accel_y_m_s2 REAL NOT NULL,
    accel_z_m_s2 REAL NOT NULL,
    gyro_x_rad_s REAL NOT NULL,
    gyro_y_rad_s REAL NOT NULL,
    gyro_z_rad_s REAL NOT NULL,
    quality_flags TEXT NOT NULL
  );
  CREATE INDEX idx_raw_samples_session ON raw_samples (session_id, timestamp_ms);

  CREATE TABLE rep_events (
    session_id TEXT NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
    timestamp_ms INTEGER NOT NULL,
    start_timestamp_ms INTEGER NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('full', 'partial')),
    peak_excursion_rad REAL NOT NULL,
    confidence REAL,
    calibration_id TEXT NOT NULL,
    algorithm_version TEXT NOT NULL,
    provenance TEXT NOT NULL,
    quality_flags TEXT NOT NULL
  );
  CREATE INDEX idx_rep_events_session ON rep_events (session_id, timestamp_ms);
  `,
];

/** Apply pending migrations, tracked via PRAGMA user_version. Returns the resulting version. */
export async function migrate(db: SqlDatabase): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  if (version > MIGRATIONS.length) {
    throw new Error(`Database schema v${version} is newer than this app supports (v${MIGRATIONS.length})`);
  }
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.transaction(async () => {
      await db.exec(MIGRATIONS[version]!);
      await db.exec(`PRAGMA user_version = ${next};`);
    });
    version = next;
  }
  return version;
}
```

### `packages/core/src/persistence/types.ts`

```ts
import type { DataProvenance } from '../common/types';
import type { RepCalibration } from '../processing/calibration';
import type { RepEvent } from '../processing/events';
import type { RawSensorSample, SensorSourceKind } from '../sensors/types';

export interface WorkoutSession {
  readonly id: string;
  readonly activity_type: 'gym';
  /** `simulated` / `replay` sessions must never be presented as real measurements. */
  readonly provenance: DataProvenance;
  readonly source_id: string;
  readonly source_kind: SensorSourceKind;
  readonly calibration_id: string;
  readonly algorithm_version: string;
  /** Free-text machine/exercise label entered by the user (machine profiles come later). */
  readonly machine_label: string | null;
  readonly started_at_epoch_ms: number;
  readonly ended_at_epoch_ms: number | null;
}

export interface WorkoutSessionSummary extends WorkoutSession {
  readonly full_rep_count: number;
  readonly partial_rep_count: number;
}

export interface SessionRepository {
  create(session: WorkoutSession): Promise<void>;
  markEnded(sessionId: string, endedAtEpochMs: number): Promise<void>;
  getById(sessionId: string): Promise<WorkoutSession | null>;
  /** Most recent first. */
  listRecent(limit: number): Promise<WorkoutSessionSummary[]>;
}

export interface RawSampleRepository {
  appendBatch(sessionId: string, samples: readonly RawSensorSample[]): Promise<void>;
  listBySession(sessionId: string): Promise<RawSensorSample[]>;
}

export interface RepEventRepository {
  append(event: RepEvent): Promise<void>;
  listBySession(sessionId: string): Promise<RepEvent[]>;
}

export interface CalibrationRepository {
  save(calibration: RepCalibration): Promise<void>;
  getById(calibrationId: string): Promise<RepCalibration | null>;
}

/** Everything the session layer needs from storage, injected as one bundle. */
export interface Repositories {
  readonly sessions: SessionRepository;
  readonly rawSamples: RawSampleRepository;
  readonly repEvents: RepEventRepository;
  readonly calibrations: CalibrationRepository;
}
```

### `packages/core/src/processing/RotationalRepDetector.ts`

```ts
import type { RawSensorSample } from '../sensors/types';
import type { RepCalibration } from './calibration';
import type { MotionDetector, RepEvent } from './events';

export const ROTATIONAL_REP_ALGORITHM_VERSION = 'rotational-rep-fsm-0.1.0';

/**
 * Thresholds are fractions of the calibrated full range of motion. Defaults are
 * unvalidated starting hypotheses (see ADR 0002), not tuned values.
 */
export interface RotationalRepDetectorConfig {
  /** Excursion that marks the start of a movement. */
  readonly startFraction: number;
  /** Excursion at/below which the movement is considered returned to start. */
  readonly returnFraction: number;
  /** Peak excursion at/above which a rep is classified `full`; otherwise `partial`. */
  readonly fullFraction: number;
  /** Smoothed |ω| below this (rad/s) counts as stationary. */
  readonly restOmegaRadS: number;
  /** Time constant of the low-pass filter applied to ω for stillness detection, ms. */
  readonly restSmoothingMs: number;
  /** Stationary this long (while not moving) → re-zero the integrated angle (drift control / sync). */
  readonly restWindowMs: number;
  /** Gap between samples above this aborts any rep in progress. */
  readonly maxSampleGapMs: number;
  /** A movement that has not returned within this time is abandoned. */
  readonly maxRepDurationMs: number;
}

export const DEFAULT_ROTATIONAL_REP_CONFIG: RotationalRepDetectorConfig = {
  startFraction: 0.2,
  returnFraction: 0.1,
  fullFraction: 0.8,
  restOmegaRadS: 0.05,
  restSmoothingMs: 50,
  restWindowMs: 300,
  maxSampleGapMs: 200,
  maxRepDurationMs: 10_000,
};

type State =
  /** Position reference unknown (start, after a gap or abandoned rep): wait for stillness. */
  | { kind: 'syncing'; restSinceMs: number | null }
  | { kind: 'idle'; restSinceMs: number | null }
  | { kind: 'moving'; startMs: number; peakRad: number; flags: Set<string> };

/**
 * Interpretable finite-state rep detector for rotating mechanisms:
 * integrate bias-corrected angular velocity about the calibrated axis, then
 * SYNCING → IDLE once the sensor has been still for `restWindowMs` (zeroing the
 * angle there), IDLE → MOVING when excursion exceeds the start threshold, and
 * MOVING → IDLE (emitting a rep) when it returns near the start position.
 * After a sample gap or an abandoned rep the reference position is unknown, so
 * the detector returns to SYNCING rather than guessing.
 */
export class RotationalRepDetector implements MotionDetector<RepEvent> {
  readonly algorithmVersion = ROTATIONAL_REP_ALGORITHM_VERSION;
  private readonly config: RotationalRepDetectorConfig;
  private state: State = { kind: 'syncing', restSinceMs: null };
  private angleRad = 0;
  private smoothedOmega = 0;
  private prev: { timestampMs: number; omega: number } | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly calibration: RepCalibration,
    config: Partial<RotationalRepDetectorConfig> = {},
  ) {
    if (!(calibration.full_rom_rad > 0)) throw new Error('Calibration full_rom_rad must be positive');
    this.config = { ...DEFAULT_ROTATIONAL_REP_CONFIG, ...config };
  }

  reset(): void {
    this.state = { kind: 'syncing', restSinceMs: null };
    this.angleRad = 0;
    this.smoothedOmega = 0;
    this.prev = null;
  }

  push(sample: RawSensorSample): RepEvent[] {
    const { axis, gyro_bias_rad_s: bias, full_rom_rad: rom } = this.calibration;
    const omega = sample.gyro_rad_s[axis] - bias[axis];
    const t = sample.timestamp_ms;

    if (this.prev === null) {
      this.prev = { timestampMs: t, omega };
      return [];
    }

    const dtMs = t - this.prev.timestampMs;
    if (dtMs <= 0) return []; // duplicate / out-of-order sample: ignore
    if (dtMs > this.config.maxSampleGapMs) {
      // Integration across a gap is meaningless; abandon any partial rep.
      this.reset();
      this.prev = { timestampMs: t, omega };
      return [];
    }

    this.angleRad += ((this.prev.omega + omega) / 2) * (dtMs / 1000);
    this.smoothedOmega += (dtMs / (this.config.restSmoothingMs + dtMs)) * (omega - this.smoothedOmega);
    this.prev = { timestampMs: t, omega };
    const excursion = Math.abs(this.angleRad);

    if (this.state.kind === 'syncing') {
      this.trackRest(t);
      return [];
    }

    if (this.state.kind === 'idle') {
      if (excursion >= this.config.startFraction * rom) {
        this.state = { kind: 'moving', startMs: t, peakRad: excursion, flags: new Set(sample.quality_flags) };
        return [];
      }
      this.trackRest(t);
      return [];
    }

    const moving = this.state;
    moving.peakRad = Math.max(moving.peakRad, excursion);
    for (const flag of sample.quality_flags) moving.flags.add(flag);

    if (t - moving.startMs > this.config.maxRepDurationMs) {
      this.reset();
      this.prev = { timestampMs: t, omega };
      return [];
    }

    if (excursion <= this.config.returnFraction * rom) {
      this.state = { kind: 'idle', restSinceMs: null };
      return [
        {
          session_id: this.sessionId,
          activity_type: 'gym',
          event_type: 'rep_completed',
          timestamp_ms: t,
          value: 1,
          classification: moving.peakRad >= this.config.fullFraction * rom ? 'full' : 'partial',
          confidence: null,
          calibration_id: this.calibration.calibration_id,
          algorithm_version: this.algorithmVersion,
          provenance: 'imu_algorithm',
          start_timestamp_ms: moving.startMs,
          peak_excursion_rad: moving.peakRad,
          quality_flags: [...moving.flags],
        },
      ];
    }
    return [];
  }

  /** While stationary for `restWindowMs`, re-zero the angle (drift control) and leave SYNCING. */
  private trackRest(t: number): void {
    if (this.state.kind === 'moving') return;
    if (Math.abs(this.smoothedOmega) >= this.config.restOmegaRadS) {
      this.state.restSinceMs = null;
      return;
    }
    this.state.restSinceMs ??= t;
    if (t - this.state.restSinceMs >= this.config.restWindowMs) {
      this.angleRad = 0;
      if (this.state.kind === 'syncing') this.state = { kind: 'idle', restSinceMs: this.state.restSinceMs };
    }
  }
}
```

### `packages/core/src/processing/calibration.ts`

```ts
import type { AxisIndex, Vec3 } from '../common/types';
import type { RawSensorSample } from '../sensors/types';

/**
 * Per-machine calibration for the rotational rep detector. Stored with every
 * session so derived metrics can be traced back to the calibration used.
 */
export interface RepCalibration {
  readonly calibration_id: string;
  /** Sensor axis the mechanism rotates about. */
  readonly axis: AxisIndex;
  /** Gyro zero-rate offset to subtract, rad/s. */
  readonly gyro_bias_rad_s: Vec3;
  /** Angular excursion of one reference full rep, radians (magnitude). */
  readonly full_rom_rad: number;
  /** `synthetic` calibrations come from simulation and are not validated against real hardware. */
  readonly provenance: 'synthetic' | 'user_reference_rep';
  readonly created_at_epoch_ms: number;
}

/** Mean gyro reading over samples taken while the sensor is held still. */
export function estimateGyroBias(restSamples: readonly RawSensorSample[]): Vec3 {
  if (restSamples.length === 0) throw new Error('estimateGyroBias needs at least one sample');
  const sum = [0, 0, 0];
  for (const s of restSamples) for (let i = 0; i < 3; i++) sum[i]! += s.gyro_rad_s[i]!;
  const n = restSamples.length;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

/** Axis with the largest angular-velocity energy — the likely rotation axis. */
export function dominantAxis(samples: readonly RawSensorSample[], bias: Vec3 = [0, 0, 0]): AxisIndex {
  const energy = [0, 0, 0];
  for (const s of samples) for (let i = 0; i < 3; i++) energy[i]! += (s.gyro_rad_s[i]! - bias[i]!) ** 2;
  const max = Math.max(...energy);
  return energy.indexOf(max) as AxisIndex;
}

/**
 * Peak |angle| reached while integrating the bias-corrected gyro over a single
 * reference rep (trapezoidal rule). Short windows only — integration drifts.
 */
export function measurePeakExcursionRad(samples: readonly RawSensorSample[], axis: AxisIndex, bias: Vec3): number {
  let angle = 0;
  let peak = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    const dt = (cur.timestamp_ms - prev.timestamp_ms) / 1000;
    const w0 = prev.gyro_rad_s[axis] - bias[axis];
    const w1 = cur.gyro_rad_s[axis] - bias[axis];
    angle += ((w0 + w1) / 2) * dt;
    peak = Math.max(peak, Math.abs(angle));
  }
  return peak;
}

export interface CalibrateFromReferenceInput {
  readonly calibrationId: string;
  readonly restSamples: readonly RawSensorSample[];
  readonly referenceRepSamples: readonly RawSensorSample[];
  readonly provenance: RepCalibration['provenance'];
  readonly createdAtEpochMs: number;
}

/** Build a calibration from a still period followed by one user-performed full rep. */
export function calibrateFromReferenceRep(input: CalibrateFromReferenceInput): RepCalibration {
  const bias = estimateGyroBias(input.restSamples);
  const axis = dominantAxis(input.referenceRepSamples, bias);
  const rom = measurePeakExcursionRad(input.referenceRepSamples, axis, bias);
  if (rom <= 0) throw new Error('Reference rep produced no measurable rotation');
  return {
    calibration_id: input.calibrationId,
    axis,
    gyro_bias_rad_s: bias,
    full_rom_rad: rom,
    provenance: input.provenance,
    created_at_epoch_ms: input.createdAtEpochMs,
  };
}
```

### `packages/core/src/processing/events.ts`

```ts
import type { RawSensorSample } from '../sensors/types';

/**
 * Derived event — mirrors the "Derived event" contract in
 * REPONE_SOURCE_OF_TRUTH.md §7, plus a few additive fields (marked below)
 * recorded in docs/decisions/0002-sensor-contract-and-rep-detector.md.
 */
export interface RepEvent {
  readonly session_id: string;
  readonly activity_type: 'gym';
  readonly event_type: 'rep_completed';
  /** Sensor timestamp at which the rep was completed, ms. */
  readonly timestamp_ms: number;
  readonly value: 1;
  readonly classification: 'full' | 'partial';
  /** Always null until a calibrated confidence model exists — never fabricated. */
  readonly confidence: null;
  readonly calibration_id: string;
  readonly algorithm_version: string;
  readonly provenance: 'imu_algorithm';
  /** Additive: sensor timestamp at which the rep began, ms. */
  readonly start_timestamp_ms: number;
  /** Additive: peak integrated angular excursion, radians. Algorithm-derived, not a direct measurement. */
  readonly peak_excursion_rad: number;
  /** Additive: quality flags raised while this rep was in progress (e.g. `sample_gap`). */
  readonly quality_flags: readonly string[];
}

/**
 * Pluggable activity detector. Gym rep detection is the first implementation;
 * a gait step detector would implement the same shape with its own event type.
 */
export interface MotionDetector<TEvent> {
  readonly algorithmVersion: string;
  /** Feed one sample; returns any events completed by it. */
  push(sample: RawSensorSample): TEvent[];
  reset(): void;
}
```

### `packages/core/src/sensors/BaseSensorSource.ts`

```ts
import type { DataProvenance, Unsubscribe } from '../common/types';
import type { RawSensorSample, SensorSource, SensorSourceKind, SensorStatus } from './types';

/** Shared listener/status bookkeeping for SensorSource implementations. */
export abstract class BaseSensorSource implements SensorSource {
  private readonly sampleListeners = new Set<(sample: RawSensorSample) => void>();
  private readonly statusListeners = new Set<(status: SensorStatus) => void>();
  private status: SensorStatus = 'idle';

  protected constructor(
    readonly id: string,
    readonly kind: SensorSourceKind,
    readonly provenance: DataProvenance,
  ) {}

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  getStatus(): SensorStatus {
    return this.status;
  }

  subscribe(listener: (sample: RawSensorSample) => void): Unsubscribe {
    this.sampleListeners.add(listener);
    return () => this.sampleListeners.delete(listener);
  }

  subscribeStatus(listener: (status: SensorStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  protected emit(sample: RawSensorSample): void {
    for (const listener of this.sampleListeners) listener(sample);
  }

  protected setStatus(status: SensorStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
```

### `packages/core/src/sensors/ReplaySensorSource.ts`

```ts
import { systemScheduler, type DataProvenance, type Scheduler } from '../common/types';
import { BaseSensorSource } from './BaseSensorSource';
import type { RawSensorSample } from './types';

export interface ReplaySensorSourceDeps {
  readonly id: string;
  readonly samples: readonly RawSensorSample[];
  /**
   * `immediate` emits every sample synchronously inside start() — use for
   * reproducible offline evaluation. `realtime` paces samples by their timestamps.
   */
  readonly mode?: 'immediate' | 'realtime';
  readonly scheduler?: Scheduler;
  readonly tickMs?: number;
  /** Provenance of the recording being replayed. Default `replay`. */
  readonly provenance?: DataProvenance;
}

/** Replays a previously recorded (or synthetic) trace through the SensorSource contract. */
export class ReplaySensorSource extends BaseSensorSource {
  private readonly scheduler: Scheduler;
  private handle: unknown = null;

  constructor(private readonly deps: ReplaySensorSourceDeps) {
    super(deps.id, 'replay', deps.provenance ?? 'replay');
    this.scheduler = deps.scheduler ?? systemScheduler;
  }

  async start(): Promise<void> {
    if (this.getStatus() === 'streaming') return;
    const { samples } = this.deps;
    this.setStatus('streaming');

    if ((this.deps.mode ?? 'immediate') === 'immediate') {
      for (const sample of samples) this.emit(sample);
      this.setStatus('stopped');
      return;
    }

    const tickMs = this.deps.tickMs ?? 100;
    const origin = samples[0]?.timestamp_ms ?? 0;
    let cursor = 0;
    let elapsedMs = 0;
    this.handle = this.scheduler.setInterval(() => {
      elapsedMs += tickMs;
      while (cursor < samples.length && samples[cursor]!.timestamp_ms - origin < elapsedMs) {
        this.emit(samples[cursor]!);
        cursor += 1;
      }
      if (cursor >= samples.length) void this.stop();
    }, tickMs);
  }

  async stop(): Promise<void> {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
  }
}
```

### `packages/core/src/sensors/SimulatedSensorSource.ts`

```ts
import { systemScheduler, type Scheduler } from '../common/types';
import { MotionSynthesizer, type MotionScript, type SimulationOptions } from '../simulation/motion';
import { BaseSensorSource } from './BaseSensorSource';

export interface SimulatedSensorSourceDeps {
  readonly script: MotionScript;
  readonly simulation: SimulationOptions;
  readonly scheduler?: Scheduler;
  /** How often samples are delivered in batches, ms. Default 100. */
  readonly tickMs?: number;
}

/**
 * Generates synthetic IMU samples live from a motion script. Every sample is
 * flagged `synthetic` and sessions are stamped with provenance `simulated`.
 */
export class SimulatedSensorSource extends BaseSensorSource {
  private readonly scheduler: Scheduler;
  private readonly tickMs: number;
  private handle: unknown = null;

  constructor(private readonly deps: SimulatedSensorSourceDeps) {
    super(deps.simulation.sourceId, 'simulated', 'simulated');
    this.scheduler = deps.scheduler ?? systemScheduler;
    this.tickMs = deps.tickMs ?? 100;
  }

  async start(): Promise<void> {
    if (this.handle !== null) return;
    // A fresh synthesiser per start keeps each run reproducible from the seed.
    const synth = new MotionSynthesizer(this.deps.script, this.deps.simulation);
    const samplesPerTick = Math.max(1, Math.round((this.deps.simulation.sampleRateHz * this.tickMs) / 1000));
    this.setStatus('streaming');
    this.handle = this.scheduler.setInterval(() => {
      for (let i = 0; i < samplesPerTick; i++) {
        const sample = synth.next();
        if (sample === undefined) {
          void this.stop();
          return;
        }
        if (sample) this.emit(sample);
      }
    }, this.tickMs);
  }

  async stop(): Promise<void> {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
  }
}
```

### `packages/core/src/sensors/types.ts`

```ts
import type { DataProvenance, Unsubscribe, Vec3 } from '../common/types';

/**
 * Raw sensor sample — mirrors the "Raw sensor sample" contract in
 * REPONE_SOURCE_OF_TRUTH.md §7. Field names (snake_case) and units are part of
 * the contract; do not rename or change units without an ADR.
 */
export interface RawSensorSample {
  /** Sensor/device-relative timestamp in milliseconds (NOT wall-clock epoch). */
  readonly timestamp_ms: number;
  readonly source_id: string;
  /** Linear acceleration, metres per second squared, sensor frame. */
  readonly accel_m_s2: Vec3;
  /** Angular velocity, radians per second, sensor frame. */
  readonly gyro_rad_s: Vec3;
  readonly quality_flags: readonly string[];
}

export type SensorSourceKind = 'simulated' | 'replay' | 'usb_serial' | 'ble';

export type SensorStatus = 'idle' | 'streaming' | 'stopped' | 'error';

/**
 * The single hardware-abstraction boundary. Simulated, replayed, USB-serial and
 * (future) BLE sources all implement this interface; nothing downstream may
 * depend on which concrete source is in use.
 */
export interface SensorSource {
  readonly id: string;
  readonly kind: SensorSourceKind;
  /** Provenance stamped onto sessions recorded from this source. */
  readonly provenance: DataProvenance;
  getStatus(): SensorStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Samples are delivered in non-decreasing timestamp order. */
  subscribe(listener: (sample: RawSensorSample) => void): Unsubscribe;
  subscribeStatus(listener: (status: SensorStatus) => void): Unsubscribe;
}
```

### `packages/core/src/session/WorkoutSessionController.ts`

```ts
import type { Clock, DataProvenance, IdGenerator, Unsubscribe } from '../common/types';
import type { RepCalibration } from '../processing/calibration';
import type { MotionDetector, RepEvent } from '../processing/events';
import type { Repositories } from '../persistence/types';
import type { RawSensorSample, SensorSource } from '../sensors/types';

export type SessionStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'finished' | 'error';

export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly sessionId: string | null;
  readonly provenance: DataProvenance | null;
  readonly fullReps: number;
  readonly partialReps: number;
  readonly samplesReceived: number;
  readonly lastEvent: RepEvent | null;
  readonly error: string | null;
}

export type DetectorFactory = (sessionId: string, calibration: RepCalibration) => MotionDetector<RepEvent>;

export interface WorkoutSessionControllerDeps {
  readonly repositories: Repositories;
  readonly clock: Clock;
  readonly createId: IdGenerator;
  readonly createDetector: DetectorFactory;
  /** Raw samples are persisted in batches of this size. Default 50. */
  readonly rawSampleBatchSize?: number;
}

export interface StartSessionParams {
  readonly sensor: SensorSource;
  readonly calibration: RepCalibration;
  readonly machineLabel?: string | null;
}

const INITIAL: SessionSnapshot = {
  status: 'idle',
  sessionId: null,
  provenance: null,
  fullReps: 0,
  partialReps: 0,
  samplesReceived: 0,
  lastEvent: null,
  error: null,
};

interface ActiveSession {
  readonly id: string;
  readonly sensor: SensorSource;
  readonly detector: MotionDetector<RepEvent>;
  readonly unsubscribers: Unsubscribe[];
  buffer: RawSensorSample[];
}

/**
 * Orchestrates one recording at a time: sensor → raw-sample store → detector →
 * event store, and publishes a UI-agnostic snapshot. Contains no React code.
 *
 * Sensor callbacks are synchronous; all writes go through a single ordered
 * queue so persistence order matches sample order.
 */
export class WorkoutSessionController {
  private snapshot: SessionSnapshot = INITIAL;
  private readonly listeners = new Set<(s: SessionSnapshot) => void>();
  private active: ActiveSession | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly batchSize: number;

  constructor(private readonly deps: WorkoutSessionControllerDeps) {
    this.batchSize = deps.rawSampleBatchSize ?? 50;
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: SessionSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(params: StartSessionParams): Promise<string> {
    if (this.active || this.snapshot.status === 'starting' || this.snapshot.status === 'stopping') {
      throw new Error('A session is already in progress');
    }
    const { sensor, calibration } = params;
    const id = this.deps.createId();
    this.update({ ...INITIAL, status: 'starting', sessionId: id, provenance: sensor.provenance });

    try {
      const { repositories, clock } = this.deps;
      await repositories.calibrations.save(calibration);
      const detector = this.deps.createDetector(id, calibration);
      await repositories.sessions.create({
        id,
        activity_type: 'gym',
        provenance: sensor.provenance,
        source_id: sensor.id,
        source_kind: sensor.kind,
        calibration_id: calibration.calibration_id,
        algorithm_version: detector.algorithmVersion,
        machine_label: params.machineLabel ?? null,
        started_at_epoch_ms: clock.now(),
        ended_at_epoch_ms: null,
      });

      const active: ActiveSession = { id, sensor, detector, unsubscribers: [], buffer: [] };
      this.active = active;
      active.unsubscribers.push(
        sensor.subscribe((sample) => this.onSample(active, sample)),
        sensor.subscribeStatus((status) => {
          // A finite source (e.g. replay) ending on its own finalises the session.
          if ((status === 'stopped' || status === 'error') && this.active === active) void this.stop();
        }),
      );
      this.update({ status: 'recording' });
      await sensor.start();
      return id;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.update({ status: 'stopping' });
    active.unsubscribers.forEach((u) => u());
    await active.sensor.stop();
    this.flush(active);
    this.enqueue(() => this.deps.repositories.sessions.markEnded(active.id, this.deps.clock.now()));
    await this.writeQueue;
    if (this.snapshot.status !== 'error') this.update({ status: 'finished' });
  }

  /** Clear a finished/errored snapshot back to idle. */
  reset(): void {
    if (this.active) throw new Error('Cannot reset while recording');
    this.update(INITIAL);
  }

  private onSample(active: ActiveSession, sample: RawSensorSample): void {
    active.buffer.push(sample);
    if (active.buffer.length >= this.batchSize) this.flush(active);

    const events = active.detector.push(sample);
    let { fullReps, partialReps } = this.snapshot;
    for (const event of events) {
      this.enqueue(() => this.deps.repositories.repEvents.append(event));
      if (event.classification === 'full') fullReps += 1;
      else partialReps += 1;
    }
    const samplesReceived = this.snapshot.samplesReceived + 1;
    // Publish on rep events and once per batch, not on every sample, to keep UI churn low.
    if (events.length > 0 || samplesReceived % this.batchSize === 0) {
      this.update({ fullReps, partialReps, samplesReceived, lastEvent: events.at(-1) ?? this.snapshot.lastEvent });
    } else {
      this.snapshot = { ...this.snapshot, samplesReceived };
    }
  }

  private flush(active: ActiveSession): void {
    if (active.buffer.length === 0) return;
    const batch = active.buffer;
    active.buffer = [];
    this.enqueue(() => this.deps.repositories.rawSamples.appendBatch(active.id, batch));
  }

  private enqueue(write: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(write).catch((error: unknown) => this.fail(error));
  }

  private fail(error: unknown): void {
    this.update({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
```

### `packages/core/src/simulation/motion.ts`

```ts
import type { AxisIndex, Vec3 } from '../common/types';
import type { RawSensorSample } from '../sensors/types';
import { createRandom, type Random } from './prng';

/** Standard gravity, m/s². */
export const GRAVITY_M_S2 = 9.80665;

/**
 * One segment of a scripted movement on a rotating mechanism (e.g. a pivoting
 * machine arm). Rotation is about a single sensor axis — the controlled,
 * rotational test-rig case the source of truth recommends starting with.
 */
export type MotionSegment =
  | { readonly kind: 'rest'; readonly durationMs: number }
  | {
      readonly kind: 'rep';
      readonly durationMs: number;
      /** Peak angular excursion of this rep, radians. */
      readonly amplitudeRad: number;
      /** Ground-truth label for evaluation. */
      readonly label: 'full' | 'partial';
    };

export interface MotionScript {
  readonly segments: readonly MotionSegment[];
  /** Repeat the script indefinitely (live simulation) instead of ending. */
  readonly loop?: boolean;
}

export interface SimulationOptions {
  readonly sourceId: string;
  readonly sampleRateHz: number;
  readonly seed: number;
  /** Rotation axis in the sensor frame. Default x (0). */
  readonly axis?: AxisIndex;
  /** Std-dev of white gyro noise, rad/s. */
  readonly gyroNoiseRadS?: number;
  /** Constant gyro bias added to every axis, rad/s (models uncalibrated offset). */
  readonly gyroBiasRadS?: Vec3;
  /** Std-dev of white accelerometer noise, m/s². */
  readonly accelNoiseMS2?: number;
  /** Probability [0,1) that any given sample is dropped (models packet loss). */
  readonly dropProbability?: number;
}

/** Ground-truth label for one scripted rep, in sensor timestamp milliseconds. */
export interface GroundTruthRep {
  readonly startMs: number;
  readonly endMs: number;
  readonly classification: 'full' | 'partial';
  readonly amplitudeRad: number;
}

interface Kinematics {
  angleRad: number;
  omegaRadS: number;
}

/** Raised-cosine excursion: 0 → amplitude → 0 over the segment. */
function repKinematics(tMs: number, durationMs: number, amplitudeRad: number): Kinematics {
  const phase = (2 * Math.PI * tMs) / durationMs;
  return {
    angleRad: (amplitudeRad * (1 - Math.cos(phase))) / 2,
    omegaRadS: ((amplitudeRad * Math.PI) / (durationMs / 1000)) * Math.sin(phase),
  };
}

function scriptDurationMs(script: MotionScript): number {
  return script.segments.reduce((sum, s) => sum + s.durationMs, 0);
}

/** Position in the script at time t, or undefined once a non-looping script has ended. */
function locate(script: MotionScript, tMs: number): { segment: MotionSegment; offsetMs: number } | undefined {
  const total = scriptDurationMs(script);
  if (total <= 0) return undefined;
  if (tMs >= total && !script.loop) return undefined;
  let t = script.loop ? tMs % total : tMs;
  for (const segment of script.segments) {
    if (t < segment.durationMs) return { segment, offsetMs: t };
    t -= segment.durationMs;
  }
  return undefined;
}

/**
 * Stateful sample synthesiser shared by the trace generator and the live
 * simulated sensor, so both produce identical signals for the same seed.
 */
export class MotionSynthesizer {
  private readonly random: Random;
  private readonly axis: AxisIndex;
  private index = 0;

  constructor(
    private readonly script: MotionScript,
    private readonly options: SimulationOptions,
  ) {
    this.random = createRandom(options.seed);
    this.axis = options.axis ?? 0;
  }

  get periodMs(): number {
    return 1000 / this.options.sampleRateHz;
  }

  /**
   * Produce the next sample, `null` if it was dropped (simulated packet loss),
   * or `undefined` when a non-looping script is finished.
   */
  next(): RawSensorSample | null | undefined {
    const timestampMs = Math.round(this.index * this.periodMs);
    this.index += 1;
    const position = locate(this.script, timestampMs);
    if (!position) return undefined;

    const { segment, offsetMs } = position;
    const k: Kinematics =
      segment.kind === 'rep'
        ? repKinematics(offsetMs, segment.durationMs, segment.amplitudeRad)
        : { angleRad: 0, omegaRadS: 0 };

    // Draw noise before the drop decision so dropping never shifts the random stream.
    const gyroNoise = this.options.gyroNoiseRadS ?? 0;
    const accelNoise = this.options.accelNoiseMS2 ?? 0;
    const bias = this.options.gyroBiasRadS ?? [0, 0, 0];
    const gyro = [0, 1, 2].map((i) => (i === this.axis ? k.omegaRadS : 0) + bias[i]! + gyroNoise * this.random.gaussian());
    const accel = gravityInSensorFrame(this.axis, k.angleRad).map((g) => g + accelNoise * this.random.gaussian());
    const dropped = this.random.next() < (this.options.dropProbability ?? 0);
    if (dropped) return null;

    return {
      timestamp_ms: timestampMs,
      source_id: this.options.sourceId,
      accel_m_s2: [accel[0]!, accel[1]!, accel[2]!],
      gyro_rad_s: [gyro[0]!, gyro[1]!, gyro[2]!],
      quality_flags: ['synthetic'],
    };
  }
}

/** Gravity vector as seen by a sensor rotated by `angleRad` about `axis` (starting flat, z up). */
function gravityInSensorFrame(axis: AxisIndex, angleRad: number): [number, number, number] {
  const s = GRAVITY_M_S2 * Math.sin(angleRad);
  const c = GRAVITY_M_S2 * Math.cos(angleRad);
  switch (axis) {
    case 0:
      return [0, s, c];
    case 1:
      return [-s, 0, c];
    case 2:
      return [0, 0, GRAVITY_M_S2];
  }
}

export interface SyntheticTrace {
  readonly samples: readonly RawSensorSample[];
  readonly labels: readonly GroundTruthRep[];
  readonly metadata: {
    readonly synthetic: true;
    readonly seed: number;
    readonly sampleRateHz: number;
    readonly axis: AxisIndex;
    readonly description?: string;
  };
}

/** Render a finite (non-looping) script into a labelled, reproducible trace. */
export function generateTrace(script: MotionScript, options: SimulationOptions, description?: string): SyntheticTrace {
  if (script.loop) throw new Error('generateTrace requires a non-looping script');
  const synth = new MotionSynthesizer(script, options);
  const samples: RawSensorSample[] = [];
  for (let sample = synth.next(); sample !== undefined; sample = synth.next()) {
    if (sample) samples.push(sample);
  }

  const labels: GroundTruthRep[] = [];
  let t = 0;
  for (const segment of script.segments) {
    if (segment.kind === 'rep') {
      labels.push({
        startMs: t,
        endMs: t + segment.durationMs,
        classification: segment.label,
        amplitudeRad: segment.amplitudeRad,
      });
    }
    t += segment.durationMs;
  }

  return {
    samples,
    labels,
    metadata: { synthetic: true, seed: options.seed, sampleRateHz: options.sampleRateHz, axis: options.axis ?? 0, description },
  };
}
```

### `packages/core/src/simulation/prng.ts`

```ts
/** Deterministic PRNG (mulberry32) so synthetic traces are reproducible from a seed. */
export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal via Box–Muller. */
  gaussian(): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    gaussian: () => {
      const u = Math.max(next(), Number.EPSILON);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
```

### `packages/core/src/simulation/scripts.ts`

```ts
import type { RepCalibration } from '../processing/calibration';
import type { MotionScript, MotionSegment } from './motion';

/** Nominal full range of motion used by the demo scripts, radians (~70°). */
export const DEMO_FULL_ROM_RAD = (70 * Math.PI) / 180;

const rest = (durationMs: number): MotionSegment => ({ kind: 'rest', durationMs });
const full = (durationMs = 2000, amplitudeRad = DEMO_FULL_ROM_RAD): MotionSegment => ({
  kind: 'rep',
  durationMs,
  amplitudeRad,
  label: 'full',
});
const partial = (fractionOfRom: number, durationMs = 1600): MotionSegment => ({
  kind: 'rep',
  durationMs,
  amplitudeRad: DEMO_FULL_ROM_RAD * fractionOfRom,
  label: 'partial',
});

/** Endless demo loop for the app's simulated sensor: mostly full reps, an occasional partial. */
export const DEMO_LOOP_SCRIPT: MotionScript = {
  loop: true,
  segments: [rest(1500), full(), rest(800), full(2200), rest(800), partial(0.5), rest(800), full(1800), rest(2000)],
};

/** Labelled set: 8 full reps with varying tempo, 2 partials, pauses. */
export const LABELLED_SET_SCRIPT: MotionScript = {
  segments: [
    rest(1000),
    full(2000),
    rest(600),
    full(1800),
    rest(600),
    full(2400, DEMO_FULL_ROM_RAD * 0.95),
    rest(600),
    partial(0.45),
    rest(800),
    full(1600),
    rest(600),
    full(2000, DEMO_FULL_ROM_RAD * 1.02),
    rest(1500),
    full(2200),
    rest(600),
    partial(0.6),
    rest(600),
    full(1500),
    rest(600),
    full(2600, DEMO_FULL_ROM_RAD * 0.9),
    rest(1000),
  ],
};

/**
 * A calibration that matches the demo scripts exactly. `synthetic` provenance:
 * it comes from simulation, not from a reference rep on real hardware.
 */
export function createSyntheticCalibration(createdAtEpochMs: number): RepCalibration {
  return {
    calibration_id: 'synthetic-demo-calibration-v1',
    axis: 0,
    gyro_bias_rad_s: [0, 0, 0],
    full_rom_rad: DEMO_FULL_ROM_RAD,
    provenance: 'synthetic',
    created_at_epoch_ms: createdAtEpochMs,
  };
}
```

### `packages/core/test/calibration.test.ts`

```ts
import {
  DEMO_FULL_ROM_RAD,
  calibrateFromReferenceRep,
  estimateGyroBias,
  generateTrace,
  type MotionScript,
} from '../src';
import { BASE_SIMULATION } from './helpers/fixtures';

const referenceScript: MotionScript = {
  segments: [
    { kind: 'rest', durationMs: 2000 },
    { kind: 'rep', durationMs: 2000, amplitudeRad: DEMO_FULL_ROM_RAD, label: 'full' },
  ],
};

describe('calibration', () => {
  it('estimates gyro bias from a still period', () => {
    const trace = generateTrace(referenceScript, { ...BASE_SIMULATION, gyroBiasRadS: [0.03, -0.02, 0.01] });
    const rest = trace.samples.filter((s) => s.timestamp_ms < 2000);
    const bias = estimateGyroBias(rest);
    expect(bias[0]).toBeCloseTo(0.03, 2);
    expect(bias[1]).toBeCloseTo(-0.02, 2);
    expect(bias[2]).toBeCloseTo(0.01, 2);
  });

  it.each([0, 1] as const)('recovers rotation axis %i and full ROM within 3%% from one reference rep', (axis) => {
    const trace = generateTrace(referenceScript, { ...BASE_SIMULATION, axis, gyroBiasRadS: [0.03, -0.02, 0.01] });
    const calibration = calibrateFromReferenceRep({
      calibrationId: 'cal-1',
      restSamples: trace.samples.filter((s) => s.timestamp_ms < 2000),
      referenceRepSamples: trace.samples.filter((s) => s.timestamp_ms >= 2000),
      provenance: 'synthetic',
      createdAtEpochMs: 0,
    });
    expect(calibration.axis).toBe(axis);
    expect(Math.abs(calibration.full_rom_rad - DEMO_FULL_ROM_RAD) / DEMO_FULL_ROM_RAD).toBeLessThan(0.03);
  });

  it('rejects an empty rest window', () => {
    expect(() => estimateGyroBias([])).toThrow();
  });
});
```

### `packages/core/test/evaluateReps.test.ts`

```ts
import { evaluateReps, type GroundTruthRep, type RepEvent } from '../src';

const label = (startMs: number, endMs: number, classification: 'full' | 'partial' = 'full'): GroundTruthRep => ({
  startMs,
  endMs,
  classification,
  amplitudeRad: 1,
});

const event = (timestamp_ms: number, classification: 'full' | 'partial' = 'full'): RepEvent => ({
  session_id: 's',
  activity_type: 'gym',
  event_type: 'rep_completed',
  timestamp_ms,
  value: 1,
  classification,
  confidence: null,
  calibration_id: 'c',
  algorithm_version: 'test',
  provenance: 'imu_algorithm',
  start_timestamp_ms: timestamp_ms - 500,
  peak_excursion_rad: 1,
  quality_flags: [],
});

describe('evaluateReps', () => {
  it('counts true/false positives, misses and misclassifications one-to-one', () => {
    const labels = [label(0, 1000), label(2000, 3000), label(4000, 5000, 'partial')];
    const detections = [event(900), event(950), event(4800, 'full'), event(7000)];
    const result = evaluateReps(detections, labels, 100);
    expect(result.truePositives).toBe(2);
    expect(result.falsePositives).toBe(2);
    expect(result.falseNegatives).toBe(1);
    expect(result.precision).toBeCloseTo(0.5);
    expect(result.recall).toBeCloseTo(2 / 3);
    expect(result.classificationAgreement).toBeCloseTo(0.5);
    expect(result.missedLabels).toEqual([labels[1]]);
    expect(result.misclassified).toHaveLength(1);
  });

  it('reports undefined rates as null rather than inventing 0 or 1', () => {
    const result = evaluateReps([], []);
    expect(result.precision).toBeNull();
    expect(result.recall).toBeNull();
    expect(result.classificationAgreement).toBeNull();
  });
});
```

### `packages/core/test/helpers/ManualScheduler.ts`

```ts
import type { Scheduler } from '../../src';

/** Deterministic Scheduler: intervals fire only when `advance()` is called. */
export class ManualScheduler implements Scheduler {
  private nextHandle = 1;
  private readonly timers = new Map<number, { callback: () => void; intervalMs: number; dueMs: number }>();
  private nowMs = 0;

  setInterval(callback: () => void, intervalMs: number): unknown {
    const handle = this.nextHandle++;
    this.timers.set(handle, { callback, intervalMs, dueMs: this.nowMs + intervalMs });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  get activeTimers(): number {
    return this.timers.size;
  }

  advance(ms: number): void {
    const target = this.nowMs + ms;
    for (;;) {
      let next: [number, { callback: () => void; intervalMs: number; dueMs: number }] | undefined;
      for (const entry of this.timers) if (entry[1].dueMs <= target && (!next || entry[1].dueMs < next[1].dueMs)) next = entry;
      if (!next) break;
      const [, timer] = next;
      this.nowMs = timer.dueMs;
      timer.dueMs += timer.intervalMs;
      timer.callback();
    }
    this.nowMs = target;
  }
}
```

### `packages/core/test/helpers/fixtures.ts`

```ts
import { LABELLED_SET_SCRIPT, generateTrace, type SimulationOptions } from '../../src';

export const BASE_SIMULATION: SimulationOptions = {
  sourceId: 'sim-test-01',
  sampleRateHz: 50,
  seed: 42,
  gyroNoiseRadS: 0.02,
  accelNoiseMS2: 0.05,
};

/** Clean-ish labelled set used across tests. Synthetic — not a real recording. */
export const labelledSetTrace = () => generateTrace(LABELLED_SET_SCRIPT, BASE_SIMULATION, 'labelled set, low noise');
```

### `packages/core/test/helpers/nodeSqliteDatabase.ts`

```ts
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '../../src';

/** Adapts Node's built-in SQLite to the core SqlDatabase port (tests only). */
export function openNodeSqliteDatabase(path = ':memory:'): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(path);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: readonly SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async transaction(work) {
      db.exec('BEGIN');
      try {
        await work();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
```

### `packages/core/test/repositories.test.ts`

```ts
import {
  MIGRATIONS,
  createInMemoryRepositories,
  createSqliteRepositories,
  createSyntheticCalibration,
  migrate,
  type RepEvent,
  type Repositories,
  type WorkoutSession,
} from '../src';
import { labelledSetTrace } from './helpers/fixtures';
import { openNodeSqliteDatabase } from './helpers/nodeSqliteDatabase';

const calibration = createSyntheticCalibration(1_700_000_000_000);

const session = (id: string, startedAt: number): WorkoutSession => ({
  id,
  activity_type: 'gym',
  provenance: 'simulated',
  source_id: 'sim-01',
  source_kind: 'simulated',
  calibration_id: calibration.calibration_id,
  algorithm_version: 'test-0.1',
  machine_label: 'Seated row (test rig)',
  started_at_epoch_ms: startedAt,
  ended_at_epoch_ms: null,
});

const repEvent = (sessionId: string, t: number, classification: 'full' | 'partial'): RepEvent => ({
  session_id: sessionId,
  activity_type: 'gym',
  event_type: 'rep_completed',
  timestamp_ms: t,
  value: 1,
  classification,
  confidence: null,
  calibration_id: calibration.calibration_id,
  algorithm_version: 'test-0.1',
  provenance: 'imu_algorithm',
  start_timestamp_ms: t - 1500,
  peak_excursion_rad: 1.1,
  quality_flags: ['synthetic'],
});

const implementations: Array<[string, () => Promise<Repositories>]> = [
  ['in-memory', async () => createInMemoryRepositories()],
  [
    'sqlite (node:sqlite)',
    async () => {
      const db = openNodeSqliteDatabase();
      await migrate(db);
      return createSqliteRepositories(db);
    },
  ],
];

// Shared contract: any Repositories implementation must pass this suite.
describe.each(implementations)('Repositories contract: %s', (_name, create) => {
  let repos: Repositories;
  beforeEach(async () => {
    repos = await create();
    await repos.calibrations.save(calibration);
  });

  it('round-trips calibrations', async () => {
    expect(await repos.calibrations.getById(calibration.calibration_id)).toEqual(calibration);
    expect(await repos.calibrations.getById('missing')).toBeNull();
  });

  it('creates, ends and fetches sessions', async () => {
    await repos.sessions.create(session('a', 1000));
    await repos.sessions.markEnded('a', 5000);
    expect(await repos.sessions.getById('a')).toEqual({ ...session('a', 1000), ended_at_epoch_ms: 5000 });
    expect(await repos.sessions.getById('missing')).toBeNull();
  });

  it('round-trips raw samples losslessly and in order', async () => {
    const { samples } = labelledSetTrace();
    await repos.sessions.create(session('a', 1000));
    await repos.rawSamples.appendBatch('a', samples.slice(0, 100));
    await repos.rawSamples.appendBatch('a', samples.slice(100, 250));
    expect(await repos.rawSamples.listBySession('a')).toEqual(samples.slice(0, 250));
    expect(await repos.rawSamples.listBySession('other')).toEqual([]);
  });

  it('round-trips rep events and summarises counts, most recent session first', async () => {
    await repos.sessions.create(session('old', 1000));
    await repos.sessions.create(session('new', 2000));
    const events = [repEvent('new', 3000, 'full'), repEvent('new', 6000, 'partial'), repEvent('new', 9000, 'full')];
    for (const e of events) await repos.repEvents.append(e);

    expect(await repos.repEvents.listBySession('new')).toEqual(events);
    const summaries = await repos.sessions.listRecent(10);
    expect(summaries.map((s) => [s.id, s.full_rep_count, s.partial_rep_count])).toEqual([
      ['new', 2, 1],
      ['old', 0, 0],
    ]);
    expect(await repos.sessions.listRecent(1)).toHaveLength(1);
  });
});

describe('SQLite migrations', () => {
  it('migrates a fresh database to the latest version and is idempotent', async () => {
    const db = openNodeSqliteDatabase();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  it('refuses to open a database from a newer app version', async () => {
    const db = openNodeSqliteDatabase();
    await db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1};`);
    await expect(migrate(db)).rejects.toThrow(/newer/);
    db.close();
  });

  it('enforces provenance values at the schema level', async () => {
    const db = openNodeSqliteDatabase();
    await migrate(db);
    const repos = createSqliteRepositories(db);
    await repos.calibrations.save(calibration);
    await expect(
      repos.sessions.create({ ...session('x', 1), provenance: 'made-up' as WorkoutSession['provenance'] }),
    ).rejects.toThrow();
    db.close();
  });
});
```

### `packages/core/test/rotationalRepDetector.test.ts`

```ts
import {
  LABELLED_SET_SCRIPT,
  ROTATIONAL_REP_ALGORITHM_VERSION,
  RotationalRepDetector,
  calibrateFromReferenceRep,
  createSyntheticCalibration,
  evaluateReps,
  generateTrace,
  type RawSensorSample,
  type RepCalibration,
  type RepEvent,
} from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './helpers/fixtures';

const calibration = createSyntheticCalibration(0);

function run(samples: readonly RawSensorSample[], cal: RepCalibration = calibration): RepEvent[] {
  const detector = new RotationalRepDetector('session-1', cal);
  return samples.flatMap((s) => detector.push(s));
}

describe('RotationalRepDetector', () => {
  it('detects every labelled rep and classifies full vs partial on the low-noise set', () => {
    const trace = labelledSetTrace();
    const result = evaluateReps(run(trace.samples), trace.labels);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
    expect(result.classificationAgreement).toBe(1);
  });

  it('emits events that follow the derived-event contract with provenance and no fabricated confidence', () => {
    const [event] = run(labelledSetTrace().samples);
    expect(event).toMatchObject({
      session_id: 'session-1',
      activity_type: 'gym',
      event_type: 'rep_completed',
      value: 1,
      confidence: null,
      calibration_id: calibration.calibration_id,
      algorithm_version: ROTATIONAL_REP_ALGORITHM_VERSION,
      provenance: 'imu_algorithm',
    });
    expect(event!.start_timestamp_ms).toBeLessThan(event!.timestamp_ms);
    expect(event!.peak_excursion_rad).toBeGreaterThan(0);
  });

  it('is deterministic: the same recording replays to identical events', () => {
    const trace = labelledSetTrace();
    expect(run(trace.samples)).toEqual(run(trace.samples));
  });

  it('emits nothing for a sensor at rest, even with noise and bias drift over 60 s', () => {
    const trace = generateTrace(
      { segments: [{ kind: 'rest', durationMs: 60_000 }] },
      { ...BASE_SIMULATION, gyroNoiseRadS: 0.03, gyroBiasRadS: [0.01, 0, 0] },
    );
    expect(run(trace.samples)).toEqual([]);
  });

  it('remains accurate with gyro noise up to 0.06 rad/s (seed sweep, synthetic)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const trace = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, seed, gyroNoiseRadS: 0.06 });
      const result = evaluateReps(run(trace.samples), trace.labels);
      expect({ seed, fp: result.falsePositives, fn: result.falseNegatives }).toEqual({ seed, fp: 0, fn: 0 });
    }
  });

  it('documents a known limitation: at 0.12 rad/s noise, stillness is rarely detected and reps are missed', () => {
    let missed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const trace = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, seed, gyroNoiseRadS: 0.12 });
      missed += evaluateReps(run(trace.samples), trace.labels).falseNegatives;
    }
    expect(missed).toBeGreaterThan(0);
  });

  it('works on a non-default axis when calibrated from a reference rep with gyro bias', () => {
    const sim = { ...BASE_SIMULATION, axis: 1 as const, gyroBiasRadS: [0.02, 0.04, -0.01] as const };
    const reference = generateTrace(
      {
        segments: [
          { kind: 'rest', durationMs: 2000 },
          { kind: 'rep', durationMs: 2000, amplitudeRad: calibration.full_rom_rad, label: 'full' },
        ],
      },
      sim,
    );
    const cal = calibrateFromReferenceRep({
      calibrationId: 'cal-axis-y',
      restSamples: reference.samples.filter((s) => s.timestamp_ms < 2000),
      referenceRepSamples: reference.samples.filter((s) => s.timestamp_ms >= 2000),
      provenance: 'synthetic',
      createdAtEpochMs: 0,
    });
    const trace = generateTrace(LABELLED_SET_SCRIPT, { ...sim, seed: 99 });
    const result = evaluateReps(run(trace.samples, cal), trace.labels);
    expect(result.falsePositives + result.falseNegatives).toBe(0);
    expect(result.classificationAgreement).toBe(1);
  });

  it('abandons a rep in progress across a sample gap instead of integrating through it', () => {
    const trace = labelledSetTrace();
    const firstLabel = trace.labels[0]!;
    const mid = (firstLabel.startMs + firstLabel.endMs) / 2;
    // Remove 500 ms of samples in the middle of the first rep.
    const gapped = trace.samples.filter((s) => s.timestamp_ms < mid - 250 || s.timestamp_ms > mid + 250);
    const result = evaluateReps(run(gapped), trace.labels);
    expect(result.missedLabels).toEqual([firstLabel]);
    expect(result.falsePositives).toBe(0);
  });

  it('documents a known limitation: with uncorrected gyro bias and no rest periods, drift causes errors', () => {
    // Back-to-back reps with no rest window → no re-zeroing; a large uncalibrated bias accumulates.
    const segments = Array.from({ length: 10 }, () => ({
      kind: 'rep' as const,
      durationMs: 2000,
      amplitudeRad: calibration.full_rom_rad,
      label: 'full' as const,
    }));
    const trace = generateTrace({ segments }, { ...BASE_SIMULATION, gyroBiasRadS: [0.15, 0, 0] });
    const result = evaluateReps(run(trace.samples), trace.labels);
    expect(result.falseNegatives + result.falsePositives + result.misclassified.length).toBeGreaterThan(0);
  });

  it('rejects an invalid calibration', () => {
    expect(() => new RotationalRepDetector('s', { ...calibration, full_rom_rad: 0 })).toThrow();
  });
});
```

### `packages/core/test/sensorSources.test.ts`

```ts
import {
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  type RawSensorSample,
  type SensorSource,
  type SensorStatus,
} from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './helpers/fixtures';
import { ManualScheduler } from './helpers/ManualScheduler';

interface Harness {
  source: SensorSource;
  /** Drive the source forward in time (no-op for immediate sources). */
  advance(ms: number): void;
}

const implementations: Array<[string, () => Harness]> = [
  [
    'SimulatedSensorSource',
    () => {
      const scheduler = new ManualScheduler();
      const source = new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: BASE_SIMULATION, scheduler });
      return { source, advance: (ms) => scheduler.advance(ms) };
    },
  ],
  [
    'ReplaySensorSource (realtime)',
    () => {
      const scheduler = new ManualScheduler();
      const source = new ReplaySensorSource({ id: 'replay-1', samples: labelledSetTrace().samples, mode: 'realtime', scheduler });
      return { source, advance: (ms) => scheduler.advance(ms) };
    },
  ],
];

// Shared contract: every SensorSource implementation must pass this suite.
describe.each(implementations)('SensorSource contract: %s', (_name, create) => {
  it('starts idle, streams ordered samples, and stops cleanly', async () => {
    const { source, advance } = create();
    const statuses: SensorStatus[] = [];
    const samples: RawSensorSample[] = [];
    source.subscribeStatus((s) => statuses.push(s));
    source.subscribe((s) => samples.push(s));

    expect(source.getStatus()).toBe('idle');
    await source.start();
    advance(1000);
    expect(samples.length).toBeGreaterThanOrEqual(45);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.timestamp_ms).toBeGreaterThanOrEqual(samples[i - 1]!.timestamp_ms);
    }
    await source.stop();
    const count = samples.length;
    advance(1000);
    expect(samples).toHaveLength(count);
    expect(statuses).toEqual(['streaming', 'stopped']);
  });

  it('stops delivering to unsubscribed listeners', async () => {
    const { source, advance } = create();
    const listener = jest.fn();
    const unsubscribe = source.subscribe(listener);
    await source.start();
    advance(200);
    unsubscribe();
    const calls = listener.mock.calls.length;
    advance(1000);
    expect(listener).toHaveBeenCalledTimes(calls);
    await source.stop();
  });

  it('reports itself stopped when a finite stream ends', async () => {
    const { source, advance } = create();
    await source.start();
    advance(60_000);
    expect(source.getStatus()).toBe('stopped');
  });
});

describe('SimulatedSensorSource', () => {
  it('delivers 50 Hz samples in 100 ms batches with simulated provenance', async () => {
    const scheduler = new ManualScheduler();
    const source = new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: BASE_SIMULATION, scheduler });
    const listener = jest.fn();
    source.subscribe(listener);
    await source.start();
    scheduler.advance(100);
    expect(listener).toHaveBeenCalledTimes(5);
    scheduler.advance(900);
    expect(listener).toHaveBeenCalledTimes(50);
    expect(source.provenance).toBe('simulated');
    await source.stop();
    expect(scheduler.activeTimers).toBe(0);
  });
});

describe('ReplaySensorSource', () => {
  it('in immediate mode emits the whole recording synchronously, identical to the input', async () => {
    const trace = labelledSetTrace();
    const source = new ReplaySensorSource({ id: 'replay-1', samples: trace.samples });
    const received: RawSensorSample[] = [];
    source.subscribe((s) => received.push(s));
    await source.start();
    expect(received).toEqual(trace.samples);
    expect(source.getStatus()).toBe('stopped');
    expect(source.provenance).toBe('replay');
  });
});
```

### `packages/core/test/simulation.test.ts`

```ts
import { DEMO_LOOP_SCRIPT, GRAVITY_M_S2, MotionSynthesizer, generateTrace } from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './helpers/fixtures';
import { LABELLED_SET_SCRIPT } from '../src';

describe('synthetic trace generation', () => {
  it('is reproducible for a given seed and differs across seeds', () => {
    expect(labelledSetTrace()).toEqual(labelledSetTrace());
    const other = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, seed: 7 });
    expect(other.samples[10]!.gyro_rad_s).not.toEqual(labelledSetTrace().samples[10]!.gyro_rad_s);
  });

  it('labels every scripted rep with ground truth', () => {
    const { labels, metadata } = labelledSetTrace();
    expect(labels.filter((l) => l.classification === 'full')).toHaveLength(8);
    expect(labels.filter((l) => l.classification === 'partial')).toHaveLength(2);
    expect(metadata.synthetic).toBe(true);
  });

  it('produces samples at the requested rate with explicit units and synthetic flag', () => {
    const { samples } = labelledSetTrace();
    const totalMs = LABELLED_SET_SCRIPT.segments.reduce((t, s) => t + s.durationMs, 0);
    expect(samples).toHaveLength((totalMs / 1000) * 50);
    expect(samples[1]!.timestamp_ms - samples[0]!.timestamp_ms).toBe(20);
    // At rest, flat: gravity on +z (m/s²), ~no rotation (rad/s).
    const first = samples[0]!;
    expect(first.accel_m_s2[2]).toBeCloseTo(GRAVITY_M_S2, 0);
    expect(Math.abs(first.gyro_rad_s[0])).toBeLessThan(0.1);
    expect(first.quality_flags).toContain('synthetic');
  });

  it('drops samples when packet loss is simulated', () => {
    const lossy = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, dropProbability: 0.1 });
    const ratio = lossy.samples.length / labelledSetTrace().samples.length;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(0.95);
  });

  it('refuses to render a looping script as a finite trace, but synthesises it live', () => {
    expect(() => generateTrace(DEMO_LOOP_SCRIPT, BASE_SIMULATION)).toThrow();
    const synth = new MotionSynthesizer(DEMO_LOOP_SCRIPT, BASE_SIMULATION);
    for (let i = 0; i < 5000; i++) expect(synth.next()).toBeTruthy();
  });
});
```

### `packages/core/test/workoutSessionController.test.ts`

```ts
import {
  DEMO_LOOP_SCRIPT,
  ReplaySensorSource,
  RotationalRepDetector,
  SimulatedSensorSource,
  WorkoutSessionController,
  createInMemoryRepositories,
  createSqliteRepositories,
  createSyntheticCalibration,
  migrate,
  type Repositories,
  type SessionSnapshot,
} from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './helpers/fixtures';
import { ManualScheduler } from './helpers/ManualScheduler';
import { openNodeSqliteDatabase } from './helpers/nodeSqliteDatabase';

function createController(repositories: Repositories = createInMemoryRepositories()) {
  let n = 0;
  let now = 1_700_000_000_000;
  const controller = new WorkoutSessionController({
    repositories,
    clock: { now: () => (now += 1000) },
    createId: () => `session-${++n}`,
    createDetector: (sessionId, calibration) => new RotationalRepDetector(sessionId, calibration),
  });
  return { controller, repositories };
}

const calibration = createSyntheticCalibration(0);

/** Wait until the controller reaches a terminal status. */
const settled = (controller: WorkoutSessionController) =>
  new Promise<SessionSnapshot>((resolve) => {
    const check = (s: SessionSnapshot) => (s.status === 'finished' || s.status === 'error') && resolve(s);
    check(controller.getSnapshot());
    controller.subscribe(check);
  });

describe('WorkoutSessionController', () => {
  it('records a replayed set end-to-end: raw samples, rep events, ended session', async () => {
    const { controller, repositories } = createController();
    const trace = labelledSetTrace();
    const sensor = new ReplaySensorSource({ id: 'replay-1', samples: trace.samples, provenance: 'simulated' });

    const sessionId = await controller.start({ sensor, calibration, machineLabel: 'Test rig' });
    const final = await settled(controller);

    expect(final).toMatchObject({ status: 'finished', fullReps: 8, partialReps: 2, provenance: 'simulated' });
    expect(await repositories.rawSamples.listBySession(sessionId)).toEqual(trace.samples);
    expect(await repositories.repEvents.listBySession(sessionId)).toHaveLength(10);
    const stored = await repositories.sessions.getById(sessionId);
    expect(stored).toMatchObject({ provenance: 'simulated', machine_label: 'Test rig', source_kind: 'replay' });
    expect(stored!.ended_at_epoch_ms).not.toBeNull();
  });

  it('records a live simulated session against SQLite and stops on demand', async () => {
    const db = openNodeSqliteDatabase();
    await migrate(db);
    const { controller, repositories } = createController(createSqliteRepositories(db));
    const scheduler = new ManualScheduler();
    const sensor = new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: BASE_SIMULATION, scheduler });

    const sessionId = await controller.start({ sensor, calibration });
    expect(controller.getSnapshot().status).toBe('recording');
    scheduler.advance(30_000);
    await controller.stop();

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('finished');
    expect(snapshot.samplesReceived).toBe(1500);
    expect(snapshot.fullReps).toBeGreaterThan(0);
    expect(scheduler.activeTimers).toBe(0);
    expect(await repositories.rawSamples.listBySession(sessionId)).toHaveLength(1500);
    const [summary] = await repositories.sessions.listRecent(1);
    expect(summary).toMatchObject({ id: sessionId, full_rep_count: snapshot.fullReps, partial_rep_count: snapshot.partialReps });
    db.close();
  });

  it('rejects a second concurrent session', async () => {
    const { controller } = createController();
    const sensor = new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: BASE_SIMULATION, scheduler: new ManualScheduler() });
    await controller.start({ sensor, calibration });
    await expect(controller.start({ sensor, calibration })).rejects.toThrow(/already in progress/);
    await controller.stop();
  });

  it('surfaces persistence failures as an error status instead of failing silently', async () => {
    const repositories = createInMemoryRepositories();
    repositories.rawSamples.appendBatch = async () => {
      throw new Error('disk full');
    };
    const { controller } = createController(repositories);
    const sensor = new ReplaySensorSource({ id: 'replay-1', samples: labelledSetTrace().samples });
    await controller.start({ sensor, calibration });
    const final = await settled(controller);
    expect(final).toMatchObject({ status: 'error', error: 'disk full' });
  });

  it('can be reset to idle after finishing', async () => {
    const { controller } = createController();
    await controller.start({ sensor: new ReplaySensorSource({ id: 'r', samples: [] }), calibration });
    await settled(controller);
    controller.reset();
    expect(controller.getSnapshot().status).toBe('idle');
  });
});
```

### `packages/core/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["jest", "node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```
