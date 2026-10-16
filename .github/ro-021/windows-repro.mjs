// RO-021 (temporary — removed again before review): reproduce RO-011 finding 1 on native Windows.
// Runs against a checkout of the commit under test and reports through workflow annotations,
// because the raw log is the only other output. Usage:
//   node windows-repro.mjs <before-fix|after-fix> <target-checkout> <fixed-sha>
// Exit 0 = observations match the hypothesis for <label>; exit 1 = they do not (see "verdict").
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [label, targetArg, fixedSha] = process.argv.slice(2);
if (!['before-fix', 'after-fix'].includes(label) || !targetArg || !fixedSha) {
  console.error('usage: windows-repro.mjs <before-fix|after-fix> <target-checkout> <fixed-sha>');
  process.exit(2);
}
const target = path.resolve(targetArg);

const sh = (command) => {
  const r = spawnSync(command, { cwd: target, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  console.log(`::group::${command} (exit ${r.status})`);
  console.log(out);
  console.log('::endgroup::');
  return { code: r.status, out };
};
const git = (...args) => (spawnSync('git', args, { cwd: target, encoding: 'utf8' }).stdout ?? '').trim();
const escapeData = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const notice = (title, lines) => console.log(`::notice title=${title}::${escapeData(lines.join('\n'))}`);
const linesMatching = (out, re, max = 12) => out.split(/\r?\n/).filter((l) => re.test(l)).slice(0, max);
const write = (rel, content) => {
  mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
  writeFileSync(path.join(target, rel), content);
};
const tap = (out) => ({
  tests: Number(out.match(/^# tests (\d+)/m)?.[1] ?? NaN),
  pass: Number(out.match(/^# pass (\d+)/m)?.[1] ?? NaN),
  fail: Number(out.match(/^# fail (\d+)/m)?.[1] ?? NaN),
  failed: [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]),
});

// 1. Environment and the root cause in isolation.
const sample = path.relative(target, path.join(target, 'apps', 'mobile', 'src', 'features', 'x.ts'));
notice('env', [
  `label=${label} HEAD=${git('rev-parse', 'HEAD')}`,
  `platform=${process.platform} arch=${process.arch} node=${process.version} os=${os.version?.() ?? ''} ${os.release()}`,
  `npm=${sh('npm --version').out.trim()} core.autocrlf=${git('config', '--get', 'core.autocrlf') || '(unset)'}`,
  `path.sep=${JSON.stringify(path.sep)} path.relative(root, apps/mobile/src/features/x.ts)=${JSON.stringify(sample)}`,
]);

// 2. Checker on the real repository as committed.
const real = sh('node scripts/check-boundaries.mjs');
notice('real-repo-checker', [`exit=${real.code}`, ...linesMatching(real.out, /boundar|✗|✓/)]);

// 3. Two known violations that do not create cycles, so only the layer rules can catch them.
const PROBES = {
  'apps/mobile/src/features/workouts/ro021Probe.ts': "import { x } from '../rep-tracking';\nexport const probe = x;\n",
  'packages/sensor-contracts/src/ro021Probe.ts': "import { y } from '@repone/rep-engine';\nexport const probe = y;\n",
};
for (const [rel, content] of Object.entries(PROBES)) write(rel, content);
const probe = sh('node scripts/check-boundaries.mjs');
for (const rel of Object.keys(PROBES)) rmSync(path.join(target, rel));
const probeFeature = /apps\/mobile\/src\/features\/workouts\/ro021Probe\.ts: import '\.\.\/rep-tracking' — features must not depend on other features/.test(probe.out);
const probePackage = /packages\/sensor-contracts\/src\/ro021Probe\.ts: import '@repone\/rep-engine' — @repone\/sensor-contracts may only depend on: nothing/.test(probe.out);
notice('injected-violations', [
  `exit=${probe.code} feature-rule-reported=${probeFeature} package-rule-reported=${probePackage} backslash-in-output=${probe.out.includes('\\')}`,
  ...linesMatching(probe.out, /ro021Probe|✗|✓/),
]);

// 4. The checker's regression tests as committed at this revision.
const own = sh('node --test --test-reporter=tap scripts/check-boundaries.test.mjs');
const ownTap = tap(own.out);
notice('checker-tests-at-commit', [
  `exit=${own.code} tests=${ownTap.tests} pass=${ownTap.pass} fail=${ownTap.fail}`,
  ...ownTap.failed.map((n) => `not ok: ${n}`),
  ...linesMatching(own.out, /circular import: \S*\\/, 2).map((l) => `sample: ${l.trim().slice(0, 200)}`),
]);

// 5. Before the fix only: the fixed revision's test file (incl. the new Windows test) against the old checker.
let fixedTap = null;
if (label === 'before-fix') {
  const show = (p) => spawnSync('git', ['show', `${fixedSha}:${p}`], { cwd: target, encoding: 'utf8' }).stdout;
  write('scripts/ro021-fixed.test.mjs', show('scripts/check-boundaries.test.mjs'));
  write('scripts/test-support/simulate-windows-paths.mjs', show('scripts/test-support/simulate-windows-paths.mjs'));
  const fixedTests = sh('node --test --test-reporter=tap scripts/ro021-fixed.test.mjs');
  rmSync(path.join(target, 'scripts', 'ro021-fixed.test.mjs'));
  rmSync(path.join(target, 'scripts', 'test-support'), { recursive: true });
  fixedTap = tap(fixedTests.out);
  notice('fixed-tests-vs-old-checker', [
    `exit=${fixedTests.code} tests=${fixedTap.tests} pass=${fixedTap.pass} fail=${fixedTap.fail}`,
    ...fixedTap.failed.map((n) => `not ok: ${n}`),
  ]);
}

// 6. What the owner runs: npm run verify (cmd.exe via npm, as on the Lenovo).
const verify = sh('npm run verify');
notice('npm-run-verify', [
  `exit=${verify.code}`,
  ...linesMatching(verify.out, /module boundaries|✗|^# (tests|pass|fail)|Tests:|Test Suites:|error TS|ERR!/, 20),
]);

// 7. Verdict.
const clean = git('status', '--porcelain');
const checks =
  label === 'before-fix'
    ? {
        'injected violations missed (exit 0)': probe.code === 0 && !probeFeature && !probePackage,
        'checker tests at commit fail': own.code !== 0 && ownTap.fail > 0,
        'fixed tests fail against old checker': fixedTap !== null && fixedTap.fail > 0,
        'npm run verify fails': verify.code !== 0,
      }
    : {
        'injected violations reported (exit 1)': probe.code === 1 && probeFeature && probePackage,
        'no backslashes in diagnostics': !probe.out.includes('\\'),
        'checker tests all pass': own.code === 0 && ownTap.fail === 0 && ownTap.pass === ownTap.tests,
        'real repository passes': real.code === 0,
        'npm run verify passes': verify.code === 0,
      };
const ok = Object.values(checks).every(Boolean);
notice('verdict', [
  `${label}: hypothesis ${ok ? 'CONFIRMED' : 'NOT confirmed'}`,
  ...Object.entries(checks).map(([k, v]) => `${v ? 'yes' : 'NO '} ${k}`),
  `working tree clean after run: ${clean === '' ? 'yes' : `no\n${clean}`}`,
]);
process.exit(ok ? 0 : 1);
