#!/usr/bin/env node
// Automation policy for RepOne (RO-019, ADR 0005): zero additional AI API cost and least-privilege
// GitHub Actions. Scans .github/workflows/*, .github/actions/**/action.y(a)ml and every workspace
// package.json. Zero dependencies and line-based (no YAML parser), like check-boundaries.mjs.
// Usage: node scripts/check-workflow-policy.mjs [repoRoot]   — exit 0 = OK, 1 = violations.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
/** Repo-relative path with '/' on every OS (RO-021: Windows uses '\\'). */
const repoPath = (absolute) => relative(ROOT, absolute).split(sep).join('/');

const POLICY_DOC = 'docs/automation/claude-codex-workflow.md';

// ---- prohibited AI API integrations ----------------------------------------------------------
// Development uses subscription products only (Claude Code, Codex code review); nothing in CI may
// call a separately billed AI API or hold a credential for one.

/** Actions that run an AI agent/model: AI vendors' orgs, or an AI product in the action name. */
const AI_ACTION_OWNERS = new Set(['openai', 'anthropics', 'google-gemini']);
const AI_ACTION_NAME = /\b(claude|codex|gemini|openai|anthropic|gpt|llm)\b/i;

const AI_PROVIDERS =
  'openai|anthropic|claude|gemini|google|vertex|azure[_-]?openai|openrouter|mistral|groq|xai|deepseek|cohere|perplexity|huggingface';
const AI_CREDENTIAL = new RegExp(
  `\\b[\\w-]*?(?:${AI_PROVIDERS})[\\w-]*?(?:api[_-]?key|auth[_-]?token|oauth[_-]?token|access[_-]?token|secret[_-]?key|token)\\b`,
  'i',
);
const AI_ENDPOINT =
  /\b(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|[\w-]+\.openai\.azure\.com|bedrock-runtime[\w.-]*\.amazonaws\.com|api\.mistral\.ai|openrouter\.ai|api\.groq\.com|api\.x\.ai|api\.deepseek\.com|api\.cohere\.(?:ai|com)|api\.perplexity\.ai)\b/i;
const AI_CLI = [
  /@openai\/codex\b/i,
  /@anthropic-ai\/[\w-]+/i,
  /@google\/(?:gemini-cli|genai|generative-ai)\b/i,
  /\bpip3?\s+install\b.*\b(?:openai|anthropic|google-genai|google-generativeai)\b/i,
  /\b(?:npm|npx|pnpm|yarn|bunx?)\b.*\s(?:openai|@ai-sdk\/[\w-]+)(?:@[\w.^~-]+)?(?:\s|$)/i,
  /\b(?:codex\s+exec|claude\s+(?:-p|--print)|gemini\s+(?:-p|--prompt))\b/i,
];
/** Direct AI SDK dependencies (any workspace). Adding one needs an owner-approved ADR. */
const AI_PACKAGE =
  /^(?:openai|@openai\/.+|@anthropic-ai\/.+|@google\/(?:genai|generative-ai|gemini-cli)|@google-cloud\/(?:vertexai|aiplatform)|@ai-sdk\/.+|ai|langchain|@langchain\/.+|cohere-ai|@mistralai\/.+|groq-sdk|@huggingface\/inference|ollama|replicate)$/;

// ---- least privilege and safe automation -----------------------------------------------------
const JUSTIFICATION = /#\s*least-privilege:\s*\S/;
const DANGEROUS_TRIGGER = /\b(pull_request_target|workflow_run)\b/;
const MERGE_OR_APPROVE = [
  [/\bgh\s+pr\s+merge\b/, 'merges a pull request'],
  [/\bgh\s+pr\s+review\b.*--approve\b/, 'approves a pull request'],
  [/\bevent\s*:\s*['"]?APPROVE\b/, 'approves a pull request'],
  [/\b(?:pulls\.merge|merge_method|enablePullRequestAutoMerge)\b/, 'merges a pull request'],
  [/\bgit\s+push\b.*(?:--force\b|--force-with-lease\b|\s-f\b)/, 'force-pushes'],
];
const UNTRUSTED_EXPRESSION = /\$\{\{[^}]*\b(?:github\.event\.|github\.head_ref|inputs\.)/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const GITHUB_OWNED = new Set(['actions', 'github']);

const violations = [];
const report = (file, line, rule, message) => violations.push({ file: repoPath(file), line, rule, message });

/** Drop a YAML comment (a `#` at line start or after whitespace, outside quotes). */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

const indentOf = (line) => line.length - line.trimStart().length;

/** Lines indented deeper than `index`'s line (its YAML block), skipping blanks. */
function blockAfter(lines, index) {
  const indent = indentOf(lines[index].code);
  const block = [];
  for (let j = index + 1; j < lines.length; j++) {
    if (lines[j].code.trim() === '') continue;
    if (indentOf(lines[j].code) <= indent) break;
    block.push(lines[j]);
  }
  return block;
}

function readLines(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((raw, i) => ({ number: i + 1, raw, code: stripComment(raw) }));
}

/** Rules shared by workflows and composite actions: AI integrations, secrets, actions, scripts. */
function checkIntegrations(file, lines) {
  for (const { number, code } of lines) {
    if (code.trim() === '') continue;

    const uses = code.match(/^\s*(?:-\s+)?uses\s*:\s*['"]?([^\s'"]+)/);
    if (uses) {
      const ref = uses[1];
      if (!ref.startsWith('./') && !ref.startsWith('docker://')) {
        const [path, version = ''] = ref.split('@');
        const owner = path.split('/')[0].toLowerCase();
        if (AI_ACTION_OWNERS.has(owner) || AI_ACTION_NAME.test(path)) {
          report(file, number, 'ai-action', `'${path}' runs an AI agent/model action — paid AI API integrations are not allowed`);
        } else if (!GITHUB_OWNED.has(owner) && !FULL_SHA.test(version)) {
          report(file, number, 'unpinned-action', `third-party action '${path}' must be pinned to a full 40-character commit SHA`);
        }
      }
    }

    const credential = code.match(AI_CREDENTIAL);
    if (credential) {
      report(file, number, 'ai-credential', `'${credential[0]}' looks like an AI API credential — no AI API keys or tokens in automation`);
    }
    const endpoint = code.match(AI_ENDPOINT);
    if (endpoint) report(file, number, 'ai-endpoint', `calls the AI API host '${endpoint[0]}'`);
    if (AI_CLI.some((pattern) => pattern.test(code))) {
      report(file, number, 'ai-cli', 'installs or runs an AI CLI/SDK — automation must not call AI APIs');
    }

    for (const [, name] of code.matchAll(/\bsecrets\s*\.\s*([A-Za-z_][\w-]*)/g)) {
      if (name !== 'GITHUB_TOKEN') {
        report(file, number, 'secret', `secrets.${name}: workflows may use only secrets.GITHUB_TOKEN`);
      }
    }
    if (/\bsecrets\s*\[/.test(code) || /toJSON\(\s*secrets\s*\)/i.test(code) || /^\s*secrets\s*:\s*inherit\b/.test(code)) {
      report(file, number, 'secret', 'exposes the whole secrets context — workflows may use only secrets.GITHUB_TOKEN');
    }

    for (const [pattern, what] of MERGE_OR_APPROVE) {
      if (pattern.test(code)) report(file, number, 'merge-or-approve', `${what} — only the owner merges or approves (AGENTS.md §3)`);
    }
  }

  // Script injection: untrusted expressions must reach run/script blocks through `env:`.
  lines.forEach(({ code }, index) => {
    const key = code.match(/^\s*(?:-\s+)?(run|script)\s*:\s*(.*)$/);
    if (!key) return;
    const inline = key[2].trim();
    const body = /^[|>][-+0-9]*$/.test(inline) ? blockAfter(lines, index) : [lines[index]];
    for (const line of body) {
      if (UNTRUSTED_EXPRESSION.test(line.code)) {
        report(file, line.number, 'script-injection', `untrusted \${{ }} expression inside '${key[1]}:' — pass it through env: instead`);
      }
    }
  });
}

/** Workflow-only rules: explicit least-privilege permissions and safe triggers. */
function checkWorkflow(file, lines) {
  let topLevelPermissions = false;
  lines.forEach(({ code, number }, index) => {
    const key = code.match(/^(\s*)permissions\s*:\s*(.*)$/);
    if (!key) return;
    const workflowLevel = key[1].length === 0;
    if (workflowLevel) topLevelPermissions = true;
    const inline = key[2].trim();

    const grants = [];
    if (/\bwrite-all\b/.test(inline)) {
      report(file, number, 'permissions', "'write-all' is never allowed — grant individual scopes");
      return;
    }
    if (inline.startsWith('{')) {
      for (const [, scope] of inline.matchAll(/([\w-]+)\s*:\s*write\b/g)) grants.push({ scope, line: lines[index] });
    } else if (inline === '') {
      for (const child of blockAfter(lines, index)) {
        const scope = child.code.match(/^\s*([\w-]+)\s*:\s*write\b/);
        if (scope) grants.push({ scope: scope[1], line: child });
      }
    }

    for (const { scope, line } of grants) {
      if (workflowLevel) {
        report(file, line.number, 'permissions', `workflow-level '${scope}: write' — grant write scopes only on the job that needs them`);
      } else if (!JUSTIFICATION.test(line.raw)) {
        report(file, line.number, 'permissions', `'${scope}: write' needs an inline '# least-privilege: <reason>' comment`);
      }
    }
  });
  if (!topLevelPermissions) {
    report(file, 1, 'permissions', "missing workflow-level 'permissions:' — declare read-only defaults explicitly");
  }

  for (const { code, number } of lines) {
    const trigger = code.match(DANGEROUS_TRIGGER);
    if (trigger) report(file, number, 'trigger', `'${trigger[1]}' runs with elevated privileges on untrusted input — not allowed`);
  }
}

function listFiles(dir, accept) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path, accept);
    return accept(name) ? [path] : [];
  });
}

/** package.json of the root and of each workspace (`dir/*` patterns, as used by this repo). */
function packageManifests() {
  const rootManifest = join(ROOT, 'package.json');
  if (!existsSync(rootManifest)) return [];
  const { workspaces = [] } = JSON.parse(readFileSync(rootManifest, 'utf8'));
  const patterns = Array.isArray(workspaces) ? workspaces : (workspaces.packages ?? []);
  const workspaceDirs = patterns.flatMap((pattern) => {
    const base = join(ROOT, pattern.replace(/\/\*$/, ''));
    if (!pattern.endsWith('/*')) return [base];
    return existsSync(base) ? readdirSync(base).map((name) => join(base, name)) : [];
  });
  return [rootManifest, ...workspaceDirs.map((dir) => join(dir, 'package.json')).filter(existsSync)];
}

function checkDependencies(file) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const text = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (!AI_PACKAGE.test(name)) continue;
      const line = text.findIndex((l) => l.includes(`"${name}"`)) + 1;
      report(file, line, 'ai-dependency', `${field} '${name}' is an AI API SDK — needs an owner-approved ADR (zero AI API cost policy)`);
    }
  }
}

const isYaml = (name) => /\.ya?ml$/.test(name);
const workflows = listFiles(join(ROOT, '.github', 'workflows'), isYaml);
const actions = listFiles(join(ROOT, '.github', 'actions'), (name) => /^action\.ya?ml$/.test(name));
const manifests = packageManifests();

for (const file of workflows) {
  const lines = readLines(file);
  checkIntegrations(file, lines);
  checkWorkflow(file, lines);
}
for (const file of actions) checkIntegrations(file, readLines(file));
for (const file of manifests) checkDependencies(file);

if (violations.length > 0) {
  const listing = violations.map((v) => `${v.file}:${v.line}: [${v.rule}] ${v.message}`).join('\n  ');
  console.error(`✗ ${violations.length} workflow policy violation(s):\n  ${listing}\n  Policy: ${POLICY_DOC}`);
  process.exit(1);
}
console.log(
  `✓ workflow policy OK (${workflows.length} workflow, ${actions.length} action, ${manifests.length} package files: ` +
    'no AI API integrations, least-privilege permissions)',
);
