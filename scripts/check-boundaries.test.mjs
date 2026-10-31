// Regression tests for scripts/check-boundaries.mjs (node:test, zero dependencies).
// Each case writes a throwaway fixture repo and runs the checker against it.
// Run: `npm run test:scripts` (also part of `npm test` / `npm run verify`).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-boundaries.mjs');
const REPO_ROOT = resolve(dirname(SCRIPT), '..');
const SIMULATE_WINDOWS = join(dirname(SCRIPT), 'test-support', 'simulate-windows-paths.mjs');

/** Minimal valid workspace: contracts at the bottom, rep-engine depending on it. */
const BASE_FILES = {
  'packages/sensor-contracts/package.json': JSON.stringify({
    name: '@repone/sensor-contracts',
    main: 'src/index.ts',
    exports: { '.': './src/index.ts', './testing': './src/testing/index.ts' },
  }),
  'packages/sensor-contracts/src/index.ts': 'export const contract: number = 1;\n',
  'packages/sensor-contracts/src/testing/index.ts': 'export const helper: number = 2;\n',
  'packages/rep-engine/package.json': JSON.stringify({
    name: '@repone/rep-engine',
    main: 'src/index.ts',
    exports: { '.': './src/index.ts' },
  }),
  'packages/rep-engine/src/index.ts':
    "import { contract } from '@repone/sensor-contracts';\nexport const engine: number = contract + 1;\n",
};

function runChecker(files, nodeArgs = []) {
  const root = mkdtempSync(join(tmpdir(), 'repone-boundaries-'));
  try {
    for (const [path, content] of Object.entries({ ...BASE_FILES, ...files })) {
      if (content === null) continue; // null removes a base file
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return check(root, nodeArgs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function check(root, nodeArgs = []) {
  const result = spawnSync(process.execPath, [...nodeArgs, SCRIPT, root], { encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

test('clean workspace with package and /testing imports passes', () => {
  const { code, output } = runChecker({
    'apps/mobile/src/application/services/Thing.ts':
      "import { engine } from '@repone/rep-engine';\nexport const thing: number = engine;\n",
    'apps/mobile/src/application/services/__tests__/Thing.test.ts':
      "import { helper } from '@repone/sensor-contracts/testing';\nimport { thing } from '../Thing';\nexport const t: number = helper + thing;\n",
  });
  assert.equal(code, 0, output);
  assert.match(output, /no circular imports/);
});

// RO-006 finding 1 (Codex): cycle through the package's own public entry was not detected.
test('detects a cycle through a package barrel (@repone self-import)', () => {
  const { code, output } = runChecker({
    'packages/sensor-contracts/src/cycleA.ts':
      "import { cycleB } from '@repone/sensor-contracts';\nexport const cycleA: number = cycleB + 1;\n",
    'packages/sensor-contracts/src/cycleB.ts':
      "import { cycleA } from './cycleA';\nexport const cycleB: number = cycleA + 1;\n",
    'packages/sensor-contracts/src/index.ts':
      "export const contract: number = 1;\nexport { cycleB } from './cycleB';\n",
  });
  assert.equal(code, 1, output);
  assert.match(
    output,
    /circular import: packages\/sensor-contracts\/src\/cycleA\.ts → packages\/sensor-contracts\/src\/index\.ts → packages\/sensor-contracts\/src\/cycleB\.ts → packages\/sensor-contracts\/src\/cycleA\.ts/,
  );
});

test('detects a cycle through a package exports subpath (@repone/x/testing)', () => {
  const { code, output } = runChecker({
    'packages/sensor-contracts/src/testing/index.ts': "export { fake } from './fake';\n",
    'packages/sensor-contracts/src/testing/fake.ts':
      "import { other } from '@repone/sensor-contracts/testing';\nexport const fake = () => other;\nexport const other: number = 3;\n",
  });
  assert.equal(code, 1, output);
  assert.match(output, /circular import: .*testing\/fake\.ts → .*testing\/index\.ts → .*testing\/fake\.ts/);
});

test('detects a cross-package cycle and the forbidden dependency', () => {
  const { code, output } = runChecker({
    'packages/sensor-contracts/src/index.ts':
      "import { engine } from '@repone/rep-engine';\nexport const contract: number = 1;\nexport const e: number = engine;\n",
  });
  assert.equal(code, 1, output);
  assert.match(output, /@repone\/sensor-contracts may only depend on: nothing/);
  assert.match(output, /circular import: .*sensor-contracts\/src\/index\.ts → .*rep-engine\/src\/index\.ts → .*sensor-contracts\/src\/index\.ts/);
});

test('still detects a plain relative-import cycle', () => {
  const { code, output } = runChecker({
    'packages/rep-engine/src/a.ts': "import { b } from './b';\nexport const a: number = b;\n",
    'packages/rep-engine/src/b.ts': "import { a } from './a';\nexport const b: number = a;\n",
  });
  assert.equal(code, 1, output);
  assert.match(output, /circular import: .*rep-engine\/src\/a\.ts → .*rep-engine\/src\/b\.ts → .*rep-engine\/src\/a\.ts/);
});

test('reports a workspace import that cannot be resolved', () => {
  const { code, output } = runChecker({
    'apps/mobile/src/shared/x.ts': "import { y } from '@repone/does-not-exist';\nexport const x = y;\n",
  });
  assert.equal(code, 1, output);
  assert.match(output, /'@repone\/does-not-exist' — cannot resolve workspace package entry/);
});

test('the real repository passes', () => {
  const { code, output } = check(REPO_ROOT);
  assert.equal(code, 0, output);
  assert.match(output, /module boundaries OK/);
});

// Owner runs `npm run verify` on Windows: relative() there returns '\\'-separated paths, which made
// every layer rule silently miss and the diagnostics above fail to match. Simulated here on any OS.
test('Windows-style path separators: rules still apply and diagnostics use forward slashes', () => {
  const { code, output } = runChecker(
    {
      'packages/sensor-contracts/src/index.ts':
        "import { engine } from '@repone/rep-engine';\nexport const contract: number = 1;\nexport const e: number = engine;\n",
      'apps/mobile/src/features/rep-tracking/index.ts': 'export const tracking: number = 1;\n',
      'apps/mobile/src/features/workouts/history.ts':
        "import { tracking } from '../rep-tracking';\nexport const h: number = tracking;\n",
    },
    ['--import', pathToFileURL(SIMULATE_WINDOWS).href],
  );
  assert.equal(code, 1, output);
  assert.match(output, /packages\/sensor-contracts\/src\/index\.ts: import '@repone\/rep-engine' — @repone\/sensor-contracts may only depend on: nothing/);
  assert.match(output, /apps\/mobile\/src\/features\/workouts\/history\.ts: import '\.\.\/rep-tracking' — features must not depend on other features/);
  assert.match(output, /circular import: packages\/sensor-contracts\/src\/index\.ts → packages\/rep-engine\/src\/index\.ts → packages\/sensor-contracts\/src\/index\.ts/);
  assert.ok(!output.includes('\\'), `diagnostics must not contain backslashes:\n${output}`);
});

// RO-025 (RO-011 finding 2): all of infrastructure/ used to be one layer, so one adapter could import another's
// internals, and application/ could skip an adapter's index. Each adapter is now its own layer.
const ADAPTERS = {
  'apps/mobile/src/infrastructure/database/index.ts': "export { openDb } from './openDb';\n",
  'apps/mobile/src/infrastructure/database/openDb.ts': 'export const openDb = (): number => 1;\n',
  'apps/mobile/src/infrastructure/bluetooth/index.ts': "export { scan } from './scan';\n",
  'apps/mobile/src/infrastructure/bluetooth/scan.ts': 'export const scan = (): number => 2;\n',
};
const ADAPTER_VIOLATIONS = {
  ...ADAPTERS,
  'apps/mobile/src/infrastructure/bluetooth/store.ts':
    "import { openDb } from '../database/openDb';\nexport const store = (): number => openDb();\n",
  'apps/mobile/src/application/createAppContainer.ts':
    "import { scan } from '../infrastructure/bluetooth/scan';\nimport { openDb } from '../infrastructure/database';\nexport const c = (): number => scan() + openDb();\n",
};

test('adapters may use their own files; application imports adapters through their index', () => {
  const { code, output } = runChecker({
    ...ADAPTERS,
    'apps/mobile/src/application/createAppContainer.ts':
      "import { scan } from '../infrastructure/bluetooth';\nimport { openDb } from '../infrastructure/database';\nexport const c = (): number => scan() + openDb();\n",
    'apps/mobile/src/infrastructure/bluetooth/__tests__/scan.test.ts':
      "import { openDb } from '../../database/openDb';\nimport { scan } from '../scan';\nexport const t: number = openDb() + scan();\n",
  });
  assert.equal(code, 0, output);
});

test("reports an adapter importing another adapter's internals, and application skipping an adapter's index", () => {
  const { code, output } = runChecker(ADAPTER_VIOLATIONS);
  assert.equal(code, 1, output);
  assert.match(output, /apps\/mobile\/src\/infrastructure\/bluetooth\/store\.ts: import '\.\.\/database\/openDb' — infrastructure adapters may only import packages and their own module/);
  assert.match(output, /apps\/mobile\/src\/application\/createAppContainer\.ts: import '\.\.\/infrastructure\/bluetooth\/scan' — import infrastructure through its index/);
  assert.ok(!output.includes("'../infrastructure/database' —"), `the index import must stay allowed:\n${output}`);
});

test('adapter rules also hold with Windows-style path separators', () => {
  const { code, output } = runChecker(ADAPTER_VIOLATIONS, ['--import', pathToFileURL(SIMULATE_WINDOWS).href]);
  assert.equal(code, 1, output);
  assert.match(output, /apps\/mobile\/src\/infrastructure\/bluetooth\/store\.ts: import '\.\.\/database\/openDb' — infrastructure adapters may only import packages and their own module/);
  assert.match(output, /apps\/mobile\/src\/application\/createAppContainer\.ts: import '\.\.\/infrastructure\/bluetooth\/scan' — import infrastructure through its index/);
  assert.ok(!output.includes('\\'), `diagnostics must not contain backslashes:\n${output}`);
});
