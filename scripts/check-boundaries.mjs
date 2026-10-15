#!/usr/bin/env node
// Enforces RepOne module boundaries (docs/architecture.md §3) and detects
// circular imports — including cycles that pass through a workspace package's
// public entry (`@repone/*`). Zero dependencies; run with `npm run check:boundaries`.
// Usage: node scripts/check-boundaries.mjs [repoRoot]   (root defaults to this repo;
// the argument lets scripts/check-boundaries.test.mjs run it against fixtures)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const SOURCE_DIRS = [
  'packages/sensor-contracts/src',
  'packages/sensor-contracts/test',
  'packages/rep-engine/src',
  'packages/rep-engine/test',
  'packages/workout-domain/src',
  'packages/workout-domain/test',
  'apps/mobile/app',
  'apps/mobile/src',
];

/** Allowed @repone/* dependencies per package (contract layer at the bottom). */
const PACKAGE_DEPS = {
  'sensor-contracts': [],
  'rep-engine': ['sensor-contracts'],
  'workout-domain': ['sensor-contracts'],
};
/** Platform libraries that must never appear in packages/ or application services. */
const PLATFORM_LIB = /^(react|react-native|react-dom|zustand|expo|expo-.*|@expo\/.*|.*sqlite.*|.*ble.*|.*bluetooth.*)(\/.*)?$/;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;
const importsOf = (file) =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]);

const resolveRelative = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

/** Workspace packages by name (`@repone/x`) → directory + manifest, read from packages/*\/package.json. */
const WORKSPACE = new Map(
  (existsSync(join(ROOT, 'packages')) ? readdirSync(join(ROOT, 'packages')) : [])
    .map((dir) => join(ROOT, 'packages', dir))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return [manifest.name, { dir, manifest }];
    }),
);

/**
 * Resolve `@repone/x` or `@repone/x/sub` to the source file its package.json `exports`
 * (or `main`) points at, so workspace imports become real edges in the cycle graph.
 */
const resolveWorkspace = (spec) => {
  const m = spec.match(/^(@repone\/[^/]+)(\/.*)?$/);
  const pkg = m && WORKSPACE.get(m[1]);
  if (!pkg) return null;
  const subpath = m[2] ? `.${m[2]}` : '.';
  const { exports, main } = pkg.manifest;
  let target = typeof exports === 'string' ? (subpath === '.' ? exports : undefined) : exports?.[subpath];
  if (target && typeof target === 'object') target = target.default ?? target.import ?? target.require;
  if (!target && subpath === '.' && !exports) target = main;
  if (typeof target !== 'string') return null;
  const file = resolve(pkg.dir, target);
  return existsSync(file) && statSync(file).isFile() ? file : null;
};

const isTest = (rel) => /(__tests__|\/test\/|\.test\.tsx?$)/.test(rel);

/** Classify a repo-relative path into a layer. */
function layerOf(rel) {
  let m = rel.match(/^packages\/([^/]+)\//);
  if (m) return { kind: 'package', name: m[1] };
  if (rel.startsWith('apps/mobile/app/')) return { kind: 'route' };
  if (rel.startsWith('apps/mobile/src/application/services/')) return { kind: 'service' };
  if (rel.startsWith('apps/mobile/src/application/')) return { kind: 'application' };
  m = rel.match(/^apps\/mobile\/src\/features\/([^/]+)\//);
  if (m) return { kind: 'feature', name: m[1] };
  if (rel.startsWith('apps/mobile/src/shared/')) return { kind: 'shared' };
  if (rel.startsWith('apps/mobile/src/infrastructure/')) return { kind: 'infrastructure' };
  return { kind: 'other' };
}

/** Public entry of a layer: imports from outside must target its index file. */
const isLayerIndex = (rel) =>
  /^apps\/mobile\/src\/(application|shared|features\/[^/]+|infrastructure\/[^/]+)\/index\.tsx?$/.test(rel);

const errors = [];
const graph = new Map();
const files = SOURCE_DIRS.map((d) => join(ROOT, d)).filter(existsSync).flatMap(walk);

for (const file of files) {
  const rel = relative(ROOT, file);
  const from = layerOf(rel);
  const test = isTest(rel);
  const edges = [];
  const fail = (spec, why) => errors.push(`${rel}: import '${spec}' — ${why}`);

  for (const spec of importsOf(file)) {
    // ---- workspace packages ------------------------------------------------
    const pkg = spec.match(/^@repone\/([^/]+)(\/.*)?$/);
    if (pkg) {
      const [, name, sub] = pkg;
      if (sub && sub !== '/testing') fail(spec, 'deep import into a package; use its public entry point');
      if (sub === '/testing' && !test && !rel.includes('/src/testing/')) fail(spec, 'testing utilities are for tests only');
      if (from.kind === 'package' && !(PACKAGE_DEPS[from.name] ?? []).includes(name) && name !== from.name) {
        fail(spec, `@repone/${from.name} may only depend on: ${PACKAGE_DEPS[from.name]?.join(', ') || 'nothing'}`);
      }
      // Permitted workspace imports are still graph edges: a cycle through a package's
      // own barrel (or across packages) must not be hidden from the cycle check.
      const target = resolveWorkspace(spec);
      if (target) edges.push(target);
      else if (!sub || sub === '/testing') fail(spec, 'cannot resolve workspace package entry (check its package.json "exports")');
      continue;
    }

    // ---- third-party / platform libraries ----------------------------------
    if (!spec.startsWith('.')) {
      if ((from.kind === 'package' || from.kind === 'service') && PLATFORM_LIB.test(spec)) {
        fail(spec, `${from.kind === 'package' ? 'packages' : 'application services'} must stay platform-independent`);
      }
      continue;
    }

    // ---- relative imports ---------------------------------------------------
    const target = resolveRelative(file, spec);
    if (!target) {
      fail(spec, 'cannot resolve');
      continue;
    }
    edges.push(target);
    const trel = relative(ROOT, target);
    const to = layerOf(trel);

    if (from.kind === 'package' || to.kind === 'package') {
      if (from.kind !== to.kind || from.name !== to.name) fail(spec, 'relative import crosses a package boundary');
      continue;
    }
    if (test) continue; // tests may reach into the unit they exercise

    const viaIndex = isLayerIndex(trel);
    const sameLayer = from.kind === to.kind && from.name === to.name;
    if (sameLayer) continue;

    switch (from.kind) {
      case 'shared':
        fail(spec, 'shared/ must not depend on features, application or infrastructure');
        break;
      case 'feature':
        if (to.kind === 'feature') fail(spec, 'features must not depend on other features');
        else if (to.kind === 'infrastructure') fail(spec, 'features must use application services, not infrastructure');
        else if (!viaIndex) fail(spec, `import ${to.kind} through its index`);
        break;
      case 'service':
        fail(spec, 'application services may only import packages and other services');
        break;
      case 'application':
        if (to.kind === 'feature' || to.kind === 'shared' || to.kind === 'route')
          fail(spec, 'application layer must not depend on UI');
        break;
      case 'infrastructure':
        fail(spec, 'infrastructure adapters may only import packages and their own module');
        break;
      case 'route':
        if (to.kind === 'infrastructure') fail(spec, 'routes must not touch infrastructure');
        else if (!viaIndex) fail(spec, `import ${to.kind} through its index`);
        break;
    }
  }
  graph.set(file, edges);
}

// ---- circular import detection (relative edges) ------------------------------
const state = new Map(); // 1 = visiting, 2 = done
const stack = [];
const cycles = [];
const visit = (node) => {
  state.set(node, 1);
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (state.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next].map((f) => relative(ROOT, f)));
    else if (!state.has(next)) visit(next);
  }
  stack.pop();
  state.set(node, 2);
};
for (const node of graph.keys()) if (!state.has(node)) visit(node);
for (const cycle of cycles) errors.push(`circular import: ${cycle.join(' → ')}`);

if (errors.length) {
  console.error(`✗ ${errors.length} boundary violation(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ module boundaries OK (${files.length} files checked, no circular imports)`);
