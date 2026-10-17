// Regression tests for scripts/check-workflow-policy.mjs (node:test, zero dependencies).
// Each case writes a throwaway fixture repo and runs the checker against it.
// Run: `npm run test:scripts` (also part of `npm test` / `npm run verify`).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-workflow-policy.mjs');
const REPO_ROOT = resolve(dirname(SCRIPT), '..');
const SIMULATE_WINDOWS = join(dirname(SCRIPT), 'test-support', 'simulate-windows-paths.mjs');
const SHA = 'a'.repeat(40);

/** The shape of RepOne's CI: read-only defaults, GitHub-owned actions, no secrets. */
const CLEAN_WORKFLOW = `name: CI
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - name: Handoff check
        env:
          PR_TITLE: \${{ github.event.pull_request.title }}
        run: |
          echo "$PR_TITLE"
          npm test
`;

const BASE_FILES = {
  'package.json': JSON.stringify({ name: 'fixture', private: true, workspaces: ['apps/*', 'packages/*'] }),
  'apps/mobile/package.json': JSON.stringify({ name: '@fixture/mobile', dependencies: { react: '19.0.0' } }),
  'packages/engine/package.json': JSON.stringify({ name: '@fixture/engine', devDependencies: { jest: '^29.7.0' } }),
  '.github/workflows/ci.yml': CLEAN_WORKFLOW,
};

function runPolicy(files, nodeArgs = []) {
  const root = mkdtempSync(join(tmpdir(), 'repone-policy-'));
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

/** A workflow with read-only defaults and the given job steps (each a YAML list item). */
const workflow = (steps, extra = '') => `name: x
on: pull_request
permissions:
  contents: read
jobs:
  job:
    runs-on: ubuntu-latest${extra}
    steps:
${steps}
`;

const expectViolation = (files, pattern) => {
  const { code, output } = runPolicy(files);
  assert.equal(code, 1, output);
  assert.match(output, pattern);
  return output;
};

const expectPass = (files) => {
  const { code, output } = runPolicy(files);
  assert.equal(code, 0, output);
  return output;
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A workflow that only declares the given workflow-level permissions. */
const withPermissions = (permissions) => `on: pull_request\n${permissions}\njobs: {}\n`;
const manifest = (fields) => JSON.stringify({ name: 'fixture', private: true, workspaces: ['apps/*', 'packages/*'], ...fields }, null, 2);

// ---- baseline --------------------------------------------------------------------------------

test('the real repository passes', () => {
  const { code, output } = check(REPO_ROOT);
  assert.equal(code, 0, output);
  assert.match(output, /workflow policy OK/);
});

test('a clean fixture passes (GitHub-owned actions on tags, untrusted input via env)', () => {
  const { code, output } = runPolicy({});
  assert.equal(code, 0, output);
  assert.match(output, /1 workflow, 0 action, 3 package, 0 lock files/);
});

// ---- prohibited AI API integrations ----------------------------------------------------------

test("negative control: PR #4's API-powered review loop is rejected", () => {
  // The paid integration points of the archived RO-019 v1 workflows (PR #4 @ af8acd9), reduced.
  const output = expectViolation(
    {
      '.github/workflows/ai-codex-review.yml': workflow(`      - uses: openai/codex-action@${SHA}
        with:
          openai-api-key: \${{ secrets.OPENAI_API_KEY }}
          sandbox: read-only`),
      '.github/workflows/ai-claude-fix.yml': workflow(`      - uses: anthropics/claude-code-action@${SHA}
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}`),
    },
    /\[ai-action\] 'openai\/codex-action'/,
  );
  assert.match(output, /\[ai-action\] 'anthropics\/claude-code-action'/);
  assert.match(output, /\[ai-credential\] 'openai-api-key'/);
  assert.match(output, /\[ai-credential\] 'anthropic_api_key'/);
  assert.match(output, /\[secret\] secrets\.OPENAI_API_KEY/);
  assert.match(output, /\[secret\] secrets\.ANTHROPIC_API_KEY/);
});

test('detects a subscription OAuth token passed to automation', () => {
  const output = expectViolation(
    { '.github/workflows/x.yml': workflow(`      - run: echo hi
        env:
          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`) },
    /\[ai-credential\] 'CLAUDE_CODE_OAUTH_TOKEN'/,
  );
  assert.match(output, /\[secret\] secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
});

test('detects AI credentials even when they come from variables instead of secrets', () => {
  expectViolation(
    { '.github/workflows/x.yml': workflow(`      - run: ./review.sh
        env:
          GEMINI_API_KEY: \${{ vars.GEMINI_API_KEY }}`) },
    /\[ai-credential\] 'GEMINI_API_KEY'/,
  );
});

test('detects third-party wrappers of AI agents and AI steps in composite actions', () => {
  expectViolation(
    { '.github/workflows/x.yml': workflow(`      - uses: someone/claude-pr-review@${SHA}`) },
    /\[ai-action\] 'someone\/claude-pr-review'/,
  );
  expectViolation(
    { '.github/actions/review/action.yml': `runs:
  using: composite
  steps:
    - uses: google-github-actions/run-gemini-cli@${SHA}
` },
    /\.github\/actions\/review\/action\.yml:4: \[ai-action\]/,
  );
});

test('detects direct calls to AI API endpoints', () => {
  expectViolation(
    { '.github/workflows/x.yml': workflow('      - run: curl -s https://api.anthropic.com/v1/messages -d @body.json') },
    /\[ai-endpoint\] calls the AI API host 'api\.anthropic\.com'/,
  );
});

test('detects AI CLIs and SDKs installed or run in automation', () => {
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: npx -y @openai/codex exec "review this PR"') }, /\[ai-cli\]/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: pip install anthropic') }, /\[ai-cli\]/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: npm install --global openai') }, /\[ai-cli\]/);
});

test('detects AI API SDK dependencies in any workspace', () => {
  expectViolation(
    { 'packages/engine/package.json': JSON.stringify({ name: '@fixture/engine', dependencies: { '@anthropic-ai/sdk': '^1.0.0' } }, null, 2) },
    /packages\/engine\/package\.json:4: \[ai-dependency\] dependencies '@anthropic-ai\/sdk'/,
  );
  expectViolation({ 'package.json': JSON.stringify({ name: 'fixture', workspaces: [], devDependencies: { openai: '^5.0.0' } }) }, /\[ai-dependency\] devDependencies 'openai'/);
});

test('comments may document the policy without tripping it', () => {
  const { code, output } = runPolicy({
    '.github/workflows/ci.yml': `${CLEAN_WORKFLOW}# Never add OPENAI_API_KEY / ANTHROPIC_API_KEY or anthropics/claude-code-action here.\n`,
  });
  assert.equal(code, 0, output);
});

// ---- secrets ----------------------------------------------------------------------------------

test('only secrets.GITHUB_TOKEN may be used; the whole secrets context may not be exposed', () => {
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}') }, /\[secret\] secrets\.NPM_TOKEN/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: echo "$S"\n        env:\n          S: ${{ toJSON(secrets) }}') }, /\[secret\] exposes the whole secrets context/);
  const { code, output } = runPolicy({
    '.github/workflows/x.yml': workflow('      - run: gh pr view "$PR"\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          PR: ${{ github.event.number }}'),
  });
  assert.equal(code, 0, output);
});

// ---- least privilege ------------------------------------------------------------------------

test('workflow-level permissions must be declared and read-only', () => {
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n' }, /\[permissions\] missing workflow-level 'permissions:'/);
  expectViolation(
    { '.github/workflows/x.yml': 'on: pull_request\npermissions:\n  contents: write # least-privilege: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n' },
    /x\.yml:3: \[permissions\] workflow-level 'contents: write'/,
  );
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\npermissions: write-all\njobs: {}\n' }, /'write-all' is never allowed/);
});

test('a job may get a write scope only with a documented least-privilege reason', () => {
  const steps = '      - run: gh pr comment "$PR" --body ok';
  expectViolation(
    { '.github/workflows/x.yml': workflow(steps, '\n    permissions:\n      contents: read\n      pull-requests: write') },
    /\[permissions\] 'pull-requests: write' needs an inline '# least-privilege: <reason>' comment/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow(steps, '\n    permissions: { issues: write }') }, /'issues: write' needs an inline/);
  const { code, output } = runPolicy({
    '.github/workflows/x.yml': workflow(steps, '\n    permissions:\n      contents: read\n      pull-requests: write # least-privilege: posts the CI summary comment'),
  });
  assert.equal(code, 0, output);
});

// ---- safe automation ------------------------------------------------------------------------

test('rejects privileged triggers that run on untrusted pull request input', () => {
  expectViolation({ '.github/workflows/x.yml': 'on:\n  pull_request_target:\npermissions: {}\njobs: {}\n' }, /\[trigger\] 'pull_request_target'/);
  expectViolation({ '.github/workflows/x.yml': 'on:\n  workflow_run:\n    workflows: [CI]\npermissions: {}\njobs: {}\n' }, /\[trigger\] 'workflow_run'/);
});

test('rejects merge, approve and force-push paths', () => {
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: gh pr merge --squash "$PR"') }, /\[merge-or-approve\] merges a pull request/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: gh pr review "$PR" --approve') }, /\[merge-or-approve\] approves a pull request/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: git push --force origin HEAD') }, /\[merge-or-approve\] force-pushes/);
});

test('rejects untrusted expressions inside run blocks (script injection)', () => {
  expectViolation(
    { '.github/workflows/x.yml': workflow('      - run: |\n          echo "checking"\n          echo "${{ github.event.pull_request.title }}"') },
    /x\.yml:11: \[script-injection\] 'github\.event\.pull_request\.title' interpolated into 'run:'/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: echo ${{ github.head_ref }}') }, /\[script-injection\]/);
});

// ---- Codex review of PR #11 — P1 #1: quoted and inline YAML write permissions ------------------

test('P1 #1 negative control: quoted and flow-style write permissions no longer pass as read-only', () => {
  // The original bypass: GitHub accepts quoted values, but only a bare `write` was matched.
  expectViolation({ '.github/workflows/x.yml': withPermissions("permissions:\n  contents: 'write'") }, /x\.yml:3: \[permissions\] workflow-level 'contents: write'/);
  expectViolation({ '.github/workflows/x.yml': withPermissions('permissions:\n  "contents": "write"') }, /x\.yml:3: \[permissions\] workflow-level 'contents: write'/);
  expectViolation({ '.github/workflows/x.yml': withPermissions('permissions: { contents: "write" }') }, /x\.yml:2: \[permissions\] workflow-level 'contents: write'/);
  expectViolation({ '.github/workflows/x.yml': withPermissions("permissions: 'write-all'") }, /'write-all' is never allowed/);
});

test('P1 #1: multi-line flow mappings, flow-style jobs and quoted job-level writes are checked', () => {
  expectViolation({ '.github/workflows/x.yml': withPermissions('permissions: {\n  contents: read,\n  issues: write }') }, /x\.yml:4: \[permissions\] workflow-level 'issues: write'/);
  // A whole job written as a flow mapping still has its permissions checked.
  expectViolation(
    { '.github/workflows/x.yml': 'on: pull_request\npermissions:\n  contents: read\njobs:\n  a: { runs-on: ubuntu-latest, permissions: { pull-requests: "write" }, steps: [ { run: "true" } ] }\n' },
    /x\.yml:5: \[permissions\] 'pull-requests: write' needs an inline '# least-privilege: <reason>' comment/,
  );
  const steps = '      - run: gh pr comment "$PR" --body ok';
  expectViolation({ '.github/workflows/x.yml': workflow(steps, "\n    permissions:\n      'pull-requests': 'write'") }, /'pull-requests: write' needs an inline/);
  expectPass({ '.github/workflows/x.yml': workflow(steps, "\n    permissions:\n      'pull-requests': 'write' # least-privilege: posts the CI summary comment") });
});

test('P1 #1: permissions the checker cannot read reliably are rejected (fail-closed)', () => {
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\nx: &perms\n  contents: write\npermissions: *perms\njobs: {}\n' }, /x\.yml:4: \[permissions\] unreadable permissions value '\*perms'/);
  expectViolation({ '.github/workflows/x.yml': withPermissions('permissions:\n  <<: *perms') }, /x\.yml:3: \[permissions\] unreadable permissions value '<<: \*perms'/);
  expectViolation({ '.github/workflows/x.yml': withPermissions('permissions:\n  contents: admin') }, /'contents: admin' — a permission level must be read, write or none/);
  // An unclosed flow mapping is invalid YAML: rejected by the parser before any rule runs.
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\npermissions: {\n  contents: read\n' }, /x\.yml:\d+: \[yaml-parse\]/);
});

test('P1 #1 positive control: quoted read/none values and read-all still pass', () => {
  expectPass({ '.github/workflows/x.yml': withPermissions(`permissions: { contents: 'read', "pull-requests": "none" }`) });
  expectPass({ '.github/workflows/x.yml': withPermissions("permissions:\n  contents: 'read'\n  issues: \"none\"") });
  expectPass({ '.github/workflows/x.yml': withPermissions('permissions: read-all') });
});

// ---- P1 #2: npm aliases (and other renames) of AI SDK packages -------------------------------

test('P1 #2 negative control: an npm alias can no longer hide an AI SDK', () => {
  // The original bypass: only dependency names were checked; this value installs the OpenAI SDK.
  expectViolation(
    { 'package.json': manifest({ dependencies: { 'internal-review': 'npm:openai@^5.0.0' } }) },
    /package\.json:\d+: \[ai-dependency\] dependencies 'internal-review' is an npm alias for 'openai'/,
  );
  expectViolation(
    { 'packages/engine/package.json': JSON.stringify({ name: '@fixture/engine', devDependencies: { helper: 'npm:@anthropic-ai/sdk@1.2.0' } }) },
    /packages\/engine\/package\.json:1: \[ai-dependency\] devDependencies 'helper' is an npm alias for '@anthropic-ai\/sdk'/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: npm install review-helper@npm:openai@5') }, /\[ai-cli\]/);
});

test('P1 #2: overrides, resolutions and non-registry sources cannot smuggle an AI SDK in', () => {
  expectViolation({ 'package.json': manifest({ overrides: { 'left-pad': 'npm:openai@5' } }) }, /\[ai-dependency\] overrides 'left-pad' is an npm alias for 'openai'/);
  expectViolation({ 'package.json': manifest({ overrides: { 'some-tool': { openai: '5.0.0' } } }) }, /\[ai-dependency\] overrides entry 'openai' targets 'openai'/);
  expectViolation({ 'package.json': manifest({ resolutions: { '@google/genai': '1.0.0' } }) }, /\[ai-dependency\] resolutions entry '@google\/genai'/);
  for (const source of [
    'github:openai/openai-node',
    'openai/openai-node',
    'git+https://github.com/openai/openai-node.git',
    'https://registry.npmjs.org/openai/-/openai-5.0.0.tgz',
    'file:../vendor/sdk',
  ]) {
    expectViolation({ 'package.json': manifest({ dependencies: { helper: source } }) }, /\[dependency-source\] dependencies 'helper' installs from a non-registry source/);
  }
});

test('P1 #2: the lockfile catches an AI SDK under any name or depth', () => {
  const lock = (packages) => JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages: { '': { name: 'fixture' }, ...packages } }, null, 2);
  expectViolation(
    { 'package-lock.json': lock({ 'node_modules/internal-review': { name: 'openai', version: '5.0.0' } }) },
    /package-lock\.json:\d+: \[ai-dependency\] installs 'openai' \(at node_modules\/internal-review\)/,
  );
  expectViolation({ 'package-lock.json': lock({ 'node_modules/some-tool/node_modules/@anthropic-ai/sdk': { version: '1.0.0' } }) }, /installs '@anthropic-ai\/sdk'/);
  expectViolation(
    { 'package-lock.json': JSON.stringify({ lockfileVersion: 1, dependencies: { 'some-tool': { version: '1.0.0', dependencies: { helper: { version: 'npm:openai@5.0.0' } } } } }) },
    /installs 'openai' \(at helper\)/,
  );
});

test('P1 #2 positive control: registry ranges, workspaces and harmless aliases still pass', () => {
  expectPass({
    'package.json': manifest({
      dependencies: { lodash: '^4.17.21', 'left-pad': 'npm:left-pad@1.3.0', '@fixture/engine': '*', tool: 'workspace:*', other: 'latest' },
      overrides: { react: '$react' },
    }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.21' } } }),
  });
});

// ---- P1 #3: bracket-style and mixed GitHub expressions in scripts ----------------------------

test('P1 #3 negative control: bracket and mixed event expressions in scripts are rejected', () => {
  // The original bypass: only dotted `github.event.` was recognised.
  expectViolation(
    { '.github/workflows/x.yml': workflow(`      - run: echo "\${{ github['event']['pull_request']['title'] }}"`) },
    /x\.yml:9: \[script-injection\] 'github\.event\.pull_request\.title' interpolated into 'run:'/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow(`      - run: echo "\${{ github.event['pull_request'].title }}"`) }, /'github\.event\.pull_request\.title'/);
  expectViolation({ '.github/workflows/x.yml': workflow(`      - run: echo "\${{ github [ "head_ref" ] }}"`) }, /'github\.head_ref'/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: echo "${{ GITHUB.Event.Issue.Body }}"') }, /'github\.event\.issue\.body'/);
});

test('P1 #3: whole contexts, dynamic indexes and indirect inputs are rejected', () => {
  for (const [expression, reference] of [
    ['toJSON(github.event)', 'github.event'],
    ['toJSON(github)', 'github'],
    ["github[format('{0}', 'event')].title", 'github[…]'],
    ["inputs['target']", 'inputs.target'],
    ['env.TITLE', 'env.title'],
    ['steps.meta.outputs.title', 'steps.meta.outputs.title'],
    ['needs.build.outputs.name', 'needs.build.outputs.name'],
  ]) {
    expectViolation(
      { '.github/workflows/x.yml': workflow(`      - run: echo "\${{ ${expression} }}"`) },
      new RegExp(`\\[script-injection\\] '${escapeRegExp(reference)}'`),
    );
  }
});

test('P1 #3: script bodies in every YAML shape are scanned', () => {
  // A plain scalar continued on the next line.
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: echo\n          ${{ github.event.pull_request.title }}') }, /x\.yml:10: \[script-injection\]/);
  // A flow-style step, and a quoted key with a block scalar.
  expectViolation({ '.github/workflows/x.yml': workflow('      - { run: "echo ${{ github.head_ref }}" }') }, /x\.yml:9: \[script-injection\] 'github\.head_ref'/);
  expectViolation({ '.github/workflows/x.yml': workflow("      - 'run': |\n          echo ${{ github.event.comment.body }}") }, /x\.yml:10: \[script-injection\]/);
  // After a "#" in a block scalar: still script text, and still expanded before the shell runs.
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: |\n          true # ${{ github.event.issue.title }}') }, /x\.yml:10: \[script-injection\]/);
  // actions/github-script bodies.
  expectViolation(
    { '.github/workflows/x.yml': workflow("      - uses: actions/github-script@v7\n        with:\n          script: |\n            core.info('${{ github.event.pull_request.body }}')") },
    /x\.yml:12: \[script-injection\] 'github\.event\.pull_request\.body' interpolated into 'script:'/,
  );
});

test('P1 #3 positive control: trusted identifiers in scripts and untrusted input via env still pass', () => {
  expectPass({
    '.github/workflows/x.yml': workflow(
      "      - run: echo \"${{ github.sha }} ${{ github['event_name'] }} ${{ matrix.os }} ${{ runner.temp }} ${{ vars.LEVEL }}\"\n" +
        '      - run: echo "$TITLE"\n        env:\n          TITLE: ${{ github.event.pull_request.title }}',
    ),
  });
});

// ---- P1 #4: merge- and approval-capable third-party actions ----------------------------------

test('P1 #4 negative control: merge- and approval-capable actions are rejected even when pinned', () => {
  // The original bypass: a pinned automerge action plus a justified pull-requests: write passed.
  expectViolation(
    { '.github/workflows/x.yml': workflow(`      - uses: pascalgn/automerge-action@${SHA}`, '\n    permissions:\n      contents: read\n      pull-requests: write # least-privilege: merge bot') },
    /x\.yml:12: \[merge-or-approve\] 'pascalgn\/automerge-action' automates merging or approving pull requests/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow(`      - uses: hmarr/auto-approve-action@${SHA}`) }, /\[merge-or-approve\] 'hmarr\/auto-approve-action'/);
  // As a flow-style step and as a reusable workflow.
  expectViolation({ '.github/workflows/x.yml': workflow(`      - { uses: "peter-evans/enable-pull-request-automerge@${SHA}" }`) }, /\[merge-or-approve\] 'peter-evans\/enable-pull-request-automerge'/);
  expectViolation(
    { '.github/workflows/x.yml': `on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    uses: someone/tools/.github/workflows/auto-merge.yml@${SHA}\n` },
    /x\.yml:6: \[merge-or-approve\]/,
  );
});

test('P1 #4: third-party actions need an owner-reviewed allowlist entry and a SHA pin', () => {
  expectViolation(
    { '.github/workflows/x.yml': workflow(`      - uses: some-org/helper@${SHA}`) },
    /\[third-party-action\] 'some-org\/helper' is not in the owner-reviewed allowlist \(\.github\/workflow-policy\.json\)/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow('      - uses: docker://ghcr.io/example/tool:latest') }, /\[third-party-action\] Docker image action/);
  expectViolation(
    { '.github/workflows/x.yml': `on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    uses: some-org/shared/.github/workflows/build.yml@${SHA}\n` },
    /\[third-party-action\] 'some-org\/shared\/\.github\/workflows\/build\.yml' is not in the owner-reviewed allowlist/,
  );
  const config = JSON.stringify({ allowedThirdPartyActions: ['some-org/helper'] });
  expectPass({ '.github/workflow-policy.json': config, '.github/workflows/x.yml': workflow(`      - uses: some-org/helper@${SHA}\n      - uses: actions/cache@v4`) });
  expectViolation(
    { '.github/workflow-policy.json': config, '.github/workflows/x.yml': workflow('      - uses: some-org/helper@v2') },
    /\[third-party-action\] 'some-org\/helper' must be pinned to a full 40-character commit SHA/,
  );
});

test('P1 #4: the allowlist itself cannot admit AI or merge/approve actions', () => {
  const output = expectViolation(
    { '.github/workflow-policy.json': JSON.stringify({ allowedThirdPartyActions: ['pascalgn/automerge-action', 'anthropics/claude-code-action', 'not a repo'] }, null, 2) },
    /\.github\/workflow-policy\.json:\d+: \[policy-config\] 'pascalgn\/automerge-action' is an AI or merge\/approve action/,
  );
  assert.match(output, /'anthropics\/claude-code-action' is an AI or merge\/approve action/);
  assert.match(output, /entry "not a repo" must be an 'owner\/repo' string/);
  expectViolation({ '.github/workflow-policy.json': '{ not json' }, /\[policy-config\] is not valid JSON/);
});

test('P1 #4: merging or approving through the API, short flags and default-branch pushes are rejected', () => {
  for (const [command, what] of [
    ['gh api -X PUT repos/o/r/pulls/1/merge', 'merges a pull request through the REST API'],
    ['gh pr review 1 -a', 'approves a pull request'],
    ['gh api repos/o/r/pulls/1/reviews -f event=APPROVE', 'approves a pull request'],
    ["|\n          gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'", 'merges a pull request'],
    ['git push origin HEAD:main', 'pushes to the default branch'],
    ['git push origin +HEAD:claude/x', 'force-pushes'],
  ]) {
    expectViolation({ '.github/workflows/x.yml': workflow(`      - run: ${command}`) }, new RegExp(`\\[merge-or-approve\\] ${escapeRegExp(what)}`));
  }
  expectPass({ '.github/workflows/x.yml': workflow('      - run: git push origin HEAD:claude/main-fix') });
});

test('local actions are scanned wherever they live, including nested ones', () => {
  expectViolation(
    {
      '.github/workflows/x.yml': workflow('      - uses: ./tools/outer'),
      'tools/outer/action.yml': 'runs:\n  using: composite\n  steps:\n    - uses: ./tools/inner\n',
      'tools/inner/action.yml': `runs:\n  using: composite\n  steps:\n    - uses: pascalgn/automerge-action@${SHA}\n`,
    },
    /tools\/inner\/action\.yml:4: \[merge-or-approve\]/,
  );
});

test('YAML anchors and aliases are rejected outside literal text', () => {
  expectViolation({ '.github/workflows/x.yml': workflow('      - &step\n        run: echo hi\n      - *step') }, /\[yaml-feature\]/);
  expectPass({ '.github/workflows/x.yml': workflow('      - run: |\n          ls *.md && echo done\n      - uses: actions/github-script@v7\n        with:\n          script: |\n            * not an alias in a literal block') });
});

// ---- Codex review round 2 — P1: escaped or encoded YAML keys ----------------------------------------

test('R2 P1 #1 negative control: escaped keys are decoded before any rule runs', () => {
  // The original bypass: "u\u0073es" is `uses` to YAML (and GitHub) but not to a text matcher.
  expectViolation({ '.github/workflows/x.yml': workflow(`      - "u\\u0073es": pascalgn/automerge-action@${SHA}`) }, /x\.yml:9: \[merge-or-approve\] 'pascalgn\/automerge-action'/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - "r\\x75n": echo "${{ github.event.issue.title }}"') }, /x\.yml:9: \[script-injection\] 'github\.event\.issue\.title'/);
  expectViolation({ '.github/workflows/x.yml': withPermissions('"perm\\u0069ssions": { contents: write }') }, /x\.yml:2: \[permissions\] workflow-level 'contents: write'/);
  expectViolation(
    { '.github/workflows/x.yml': workflow('      - run: gh pr comment "$PR" --body ok', '\n    "permissions": { "pull-requests": "wr\\x69te" }') },
    /\[permissions\] 'pull-requests: write' needs an inline '# least-privilege: <reason>' comment/,
  );
  expectViolation({ '.github/workflows/x.yml': 'on: { "pull_request\\u005ftarget": {} }\npermissions: {}\njobs: {}\n' }, /x\.yml:1: \[trigger\] 'pull_request_target'/);
});

test('R2 P1 #1: escaped values, explicit keys and upper-case keys are decoded too', () => {
  expectViolation({ '.github/workflows/x.yml': workflow(`      - uses: "pascalgn/auto\\u006derge-action@${SHA}"`) }, /\[merge-or-approve\] 'pascalgn\/automerge-action'/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: echo hi\n        env:\n          "OPENAI\\u005fAPI_KEY": x') }, /\[ai-credential\] 'OPENAI_API_KEY'/);
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: "echo \\x24{{ github.event.issue.title }}"') }, /\[script-injection\] 'github\.event\.issue\.title'/);
  expectViolation({ '.github/workflows/x.yml': workflow(`      - ? uses\n        : pascalgn/automerge-action@${SHA}`) }, /\[merge-or-approve\] 'pascalgn\/automerge-action'/);
  expectViolation({ '.github/workflows/x.yml': workflow(`      - USES: pascalgn/automerge-action@${SHA}`) }, /\[merge-or-approve\]/);
});

test('R2 P1 #1: tags, directives, documents, duplicate, non-string and unknown top-level keys are rejected', () => {
  expectViolation({ '.github/workflows/x.yml': workflow('      - !!str run: echo hi') }, /\[yaml-feature\] explicit tag 'tag:yaml\.org,2002:str'/);
  expectViolation({ '.github/workflows/x.yml': `%YAML 1.1\n---\n${CLEAN_WORKFLOW}` }, /x\.yml:1: \[yaml-feature\] YAML directives are not allowed/);
  expectViolation({ '.github/workflows/x.yml': `${CLEAN_WORKFLOW}---\non: push\n` }, /\[yaml-parse\] 2 YAML documents/);
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\npermissions: {}\npermissions:\n  contents: write\njobs: {}\n' }, /\[yaml-parse\]/);
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\npermissions: {}\ntrue: workflow_run\njobs: {}\n' }, /x\.yml:3: \[yaml-feature\] mapping key 'true' is not a plain string/);
  expectViolation({ '.github/workflows/x.yml': 'on: pull_request\npermissions: {}\n"true": workflow_run\njobs: {}\n' }, /x\.yml:3: \[workflow-schema\] unknown top-level key 'true'/);
});

test('R2 P1 #1 positive control: ordinary quoting and casing of a valid workflow still pass', () => {
  expectPass({
    '.github/workflows/x.yml':
      '"name": "CI"\n"on": [push, "pull_request"]\n"permissions": { "contents": "read" }\njobs:\n  "verify":\n    "runs-on": ubuntu-latest\n    steps:\n' +
      '      - "uses": actions/checkout@v4\n      - \'run\': echo ok\n',
  });
});

// ---- round 2 — P1: matrix values built from expressions -------------------------------------------

const matrixJob = (strategy, steps) => workflow(steps, `\n    strategy:\n${strategy}`);

test('R2 P1 #2 negative control: a matrix built from event data is untrusted in scripts', () => {
  // The original bypass: the matrix comes from PR text, and `matrix.command` was trusted in run:.
  expectViolation(
    { '.github/workflows/x.yml': matrixJob('      matrix: ${{ fromJSON(github.event.pull_request.body) }}', '      - run: echo "${{ matrix.command }}"') },
    /x\.yml:11: \[script-injection\] 'matrix\.command \(the matrix is built from an expression\)' interpolated into 'run:'/,
  );
});

test('R2 P1 #2: any expression under strategy makes every matrix value untrusted', () => {
  for (const strategy of [
    '      matrix:\n        os: ${{ fromJSON(needs.setup.outputs.list) }}',
    '      matrix:\n        os: [ubuntu-latest]\n        include:\n          - command: ${{ github.event.comment.body }}',
    '      matrix: ${{ fromJSON(vars.MATRIX) }}', // fail-closed: even trusted sources cannot be proven static
  ]) {
    expectViolation({ '.github/workflows/x.yml': matrixJob(strategy, '      - run: echo "${{ matrix[\'command\'] }}"') }, /\[script-injection\] 'matrix\.command \(the matrix is built from an expression\)'/);
  }
  expectViolation(
    { '.github/workflows/x.yml': workflow('      - run: echo "${{ matrix.os }}"', '\n    strategy: ${{ fromJSON(inputs.strategy) }}') },
    /\[script-injection\] 'matrix\.os \(the matrix is built from an expression\)'/,
  );
});

test('R2 P1 #2 positive control: static matrices and env-routed matrix values still pass', () => {
  expectPass({
    '.github/workflows/x.yml': matrixJob(
      '      matrix:\n        os: [ubuntu-latest, windows-latest]\n        include:\n          - node: 22',
      '      - run: echo "${{ matrix.os }} ${{ matrix.node }}"',
    ),
  });
  expectPass({
    '.github/workflows/x.yml': matrixJob(
      '      matrix: ${{ fromJSON(github.event.pull_request.body) }}',
      '      - name: Build ${{ matrix.command }}\n        run: echo "$COMMAND"\n        env:\n          COMMAND: ${{ matrix.command }}',
    ),
  });
});

// ---- round 2 — P2: privileged triggers only from the on: declaration --------------------------------

test('R2 P2 negative control: trigger names in ordinary text no longer fail the check', () => {
  // The original false positive: an otherwise read-only workflow failed because its name mentioned workflow_run.
  expectPass({
    '.github/workflows/x.yml':
      'name: Test workflow_run parsing\non: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n' +
      '      - run: echo "docs about pull_request_target"\n        env:\n          NOTE: workflow_run is not used here\n',
  });
});

test('R2 P2: privileged triggers are found in every form of the on: declaration', () => {
  for (const on of [
    'on: pull_request_target',
    'on: [push, pull_request_target]',
    'on: { workflow_run: { workflows: [CI] } }',
    'on:\n  push:\n  workflow_run:\n    workflows: [CI]',
    '"on": "workflow_run"',
  ]) {
    expectViolation({ '.github/workflows/x.yml': `${on}\npermissions: {}\njobs: {}\n` }, /\[trigger\] '(pull_request_target|workflow_run)' runs with elevated privileges/);
  }
});

test('structural rules: secrets: inherit and event: APPROVE inputs are rejected', () => {
  expectViolation(
    { '.github/workflows/x.yml': 'on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    uses: ./.github/workflows/shared.yml\n    secrets: inherit\n' },
    /x\.yml:7: \[secret\] 'secrets: inherit' passes every secret/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow('      - uses: actions/github-script@v7\n        with:\n          event: APPROVE') }, /x\.yml:11: \[merge-or-approve\] approves a pull request/);
});

// ---- portability (RO-021 lessons) -----------------------------------------------------------

test('CRLF line endings (Windows checkout with autocrlf) are handled', () => {
  const crlf = (text) => text.replace(/\n/g, '\r\n');
  const clean = runPolicy({ '.github/workflows/ci.yml': crlf(CLEAN_WORKFLOW) });
  assert.equal(clean.code, 0, clean.output);
  expectViolation(
    { '.github/workflows/x.yml': crlf(workflow('      - run: echo hi\n        env:\n          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')) },
    /x\.yml:11: \[ai-credential\] 'OPENAI_API_KEY'/,
  );
});

test('Windows-style path separators: diagnostics use forward slashes', () => {
  const { code, output } = runPolicy(
    { '.github/actions/review/action.yml': `runs:\n  using: composite\n  steps:\n    - uses: openai/codex-action@${SHA}\n` },
    ['--import', pathToFileURL(SIMULATE_WINDOWS).href],
  );
  assert.equal(code, 1, output);
  assert.match(output, /\.github\/actions\/review\/action\.yml:4: \[ai-action\]/);
  assert.ok(!output.includes('\\'), `diagnostics must not contain backslashes:\n${output}`);
});
