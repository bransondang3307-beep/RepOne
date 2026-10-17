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

// ---- baseline --------------------------------------------------------------------------------

test('the real repository passes', () => {
  const { code, output } = check(REPO_ROOT);
  assert.equal(code, 0, output);
  assert.match(output, /workflow policy OK/);
});

test('a clean fixture passes (GitHub-owned actions on tags, untrusted input via env)', () => {
  const { code, output } = runPolicy({});
  assert.equal(code, 0, output);
  assert.match(output, /1 workflow, 0 action, 3 package files/);
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
    /x\.yml:11: \[script-injection\] untrusted \$\{\{ \}\} expression inside 'run:'/,
  );
  expectViolation({ '.github/workflows/x.yml': workflow('      - run: echo ${{ github.head_ref }}') }, /\[script-injection\]/);
});

test('third-party actions must be pinned to a full commit SHA; GitHub-owned actions may use tags', () => {
  expectViolation({ '.github/workflows/x.yml': workflow('      - uses: peter-evans/create-pull-request@v6') }, /\[unpinned-action\] third-party action 'peter-evans\/create-pull-request'/);
  const { code, output } = runPolicy({ '.github/workflows/x.yml': workflow(`      - uses: peter-evans/create-pull-request@${SHA}\n      - uses: actions/cache@v4`) });
  assert.equal(code, 0, output);
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
