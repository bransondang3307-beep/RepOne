#!/usr/bin/env node
// Automation policy for RepOne (RO-019, ADR 0005): zero additional AI API cost and least-privilege
// GitHub Actions. Scans .github/workflows/*, local actions, every workspace package.json and the npm
// lockfile. Zero dependencies and line-based (no YAML parser), like check-boundaries.mjs — so it is
// deliberately FAIL-CLOSED: YAML it cannot read reliably (anchors, aliases, unrecognised permission
// values, unreviewed actions, non-registry dependencies) is rejected, never assumed safe.
// Usage: node scripts/check-workflow-policy.mjs [repoRoot]   — exit 0 = OK, 1 = violations.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
/** Repo-relative path with '/' on every OS (RO-021: Windows uses '\\'). */
const repoPath = (absolute) => relative(ROOT, absolute).split(sep).join('/');

const POLICY_DOC = 'docs/automation/claude-codex-workflow.md';
/** Owner-reviewed third-party actions: `{ "allowedThirdPartyActions": ["owner/repo"] }`. */
const POLICY_CONFIG = '.github/workflow-policy.json';

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
  /\bnpm:(?:openai|@openai\/|@anthropic-ai\/|@google\/(?:genai|generative-ai|gemini-cli)|@ai-sdk\/)/i,
  /\bpip3?\s+install\b.*\b(?:openai|anthropic|google-genai|google-generativeai)\b/i,
  /\b(?:npm|npx|pnpm|yarn|bunx?)\b.*\s(?:openai|@ai-sdk\/[\w-]+)(?:@[\w.^~-]+)?(?:\s|$)/i,
  /\b(?:codex\s+exec|claude\s+(?:-p|--print)|gemini\s+(?:-p|--prompt))\b/i,
];
/** AI SDK packages. Installing one — directly, by alias, by override or transitively — needs an owner-approved ADR. */
const AI_PACKAGE =
  /^(?:openai|@openai\/.+|@anthropic-ai\/.+|@google\/(?:genai|generative-ai|gemini-cli)|@google-cloud\/(?:vertexai|aiplatform)|@ai-sdk\/.+|ai|langchain|@langchain\/.+|cohere-ai|@mistralai\/.+|groq-sdk|@huggingface\/inference|ollama|replicate)$/;

// ---- merge and approval paths (AGENTS.md §3: only the owner merges or approves) ---------------
/** Actions whose purpose is merging or approving pull requests. Rejected even if allowlisted. */
const MERGE_ACTION_NAME = /(?:^|[/_.-])(?:auto-?merge|merge|auto-?approve|approve|approval|mergify|kodiak)(?:$|[/_.-])/i;
const MERGE_OR_APPROVE = [
  [/\bgh\s+pr\s+merge\b/, 'merges a pull request'],
  [/\bgh\s+pr\s+review\b.*(?:--approve\b|\s-a(?:\s|$))/, 'approves a pull request'],
  [/\bevent['"]?\s*[:=]\s*['"]?approve\b/i, 'approves a pull request'],
  [/\b(?:pulls\.merge|merge_method|enablePullRequestAutoMerge|mergePullRequest)\b/, 'merges a pull request'],
  [/\/pulls\/[^\s/'"]+\/merge\b/, 'merges a pull request through the REST API'],
  [/\bgit\s+push\b.*(?:--force\b|--force-with-lease\b|\s-f(?:\s|$)|\s\+\S)/, 'force-pushes'],
  [/\bgit\s+push\b.*\s(?:\S+:)?(?:refs\/heads\/)?(?:main|master)(?=\s|$|['"])/, 'pushes to the default branch'],
];

// ---- least privilege ----------------------------------------------------------------------------
const JUSTIFICATION = /#\s*least-privilege:\s*\S/;
const PERMISSION_LEVELS = new Set(['read', 'write', 'none']);
const DANGEROUS_TRIGGER = /\b(pull_request_target|workflow_run)\b/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const GITHUB_OWNED = new Set(['actions', 'github']);

// ---- script injection -----------------------------------------------------------------------------
// `${{ }}` inside run:/script: is expanded into the script text before it runs. Only values that cannot
// carry attacker-controlled text may appear there; everything else goes through env: and "$VAR".
/** `github.<property>` values that are fixed-format identifiers, safe to interpolate. */
const SAFE_GITHUB_PROPERTIES = new Set([
  'event_name', 'sha', 'run_id', 'run_number', 'run_attempt', 'repository', 'repository_id', 'repository_owner',
  'repository_owner_id', 'server_url', 'api_url', 'graphql_url', 'workspace', 'job', 'workflow', 'action_path',
  'retention_days',
]);
/** Contexts that carry user input directly (inputs) or indirectly (env, step/job outputs). */
const UNTRUSTED_ROOTS = new Set(['inputs', 'env', 'steps', 'needs']);
const LITERALS = new Set(['true', 'false', 'null']);

const violations = [];
const report = (file, line, rule, message) => violations.push({ file: repoPath(file), line, rule, message });

// ---- YAML-lite helpers ----------------------------------------------------------------------------

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

const indentOf = (text) => text.length - text.trimStart().length;

/** Remove one level of YAML scalar quotes: `'write'` / `"write"` → `write`. */
function unquote(text) {
  const value = text.trim();
  if (value.length >= 2 && value[0] === "'" && value.at(-1) === "'") return value.slice(1, -1).replace(/''/g, "'");
  if (value.length >= 2 && value[0] === '"' && value.at(-1) === '"') return value.slice(1, -1);
  return value;
}

/** The non-blank lines after `index` indented deeper than `column` (a block or a continued scalar). */
function continuation(lines, index, column) {
  const block = [];
  for (let j = index + 1; j < lines.length; j++) {
    if (lines[j].raw.trim() === '') continue;
    if (indentOf(lines[j].raw) <= column) break;
    block.push(lines[j]);
  }
  return block;
}

/** Each `key:` on a line in mapping position: line start, after `- `, or inside a flow mapping `{…, key: …}`. Keys may be quoted. */
function keysOn(code, names) {
  const pattern = new RegExp(`(^\\s*(?:-\\s+)?|[{,]\\s*)(['"]?)(${names})\\2\\s*:(?=\\s|$|['"{\\[])`, 'g');
  return [...code.matchAll(pattern)].map((m) => ({
    name: m[3],
    column: m.index + m[1].length,
    valueStart: m.index + m[0].length,
    inFlow: /[{,]/.test(m[1]),
  }));
}

function readLines(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((raw, i) => ({ number: i + 1, raw, code: stripComment(raw) }));
}

// ---- expressions ----------------------------------------------------------------------------------

/**
 * Context references in a GitHub expression that must not be interpolated into a script. Bracket
 * property access (`github['event']`) is normalised to dots first, so dotted, bracket and mixed forms
 * are judged alike; dynamic indexes (`github[x]`) and whole contexts (`toJSON(github)`) are rejected.
 */
function untrustedReferences(expression) {
  const text = expression
    .replace(/\[\s*'((?:[^']|'')*)'\s*\]/g, (_, name) => `.${name.replace(/''/g, "'")}`)
    .replace(/\[\s*"([^"]*)"\s*\]/g, (_, name) => `.${name}`)
    .replace(/'(?:[^']|'')*'/g, "''");
  const found = [];
  const identifier = /[A-Za-z_][\w-]*/g;
  for (let match = identifier.exec(text); match; match = identifier.exec(text)) {
    if (text.slice(0, match.index).trimEnd().endsWith('.')) continue; // a property, not a context
    const after = text.slice(match.index + match[0].length);
    if (/^\s*\(/.test(after)) continue; // a function such as toJSON(…)
    const root = match[0].toLowerCase();
    if (LITERALS.has(root)) continue;
    const chain = after.match(/^(?:\s*\.\s*[\w*-]+)*/)[0];
    identifier.lastIndex = match.index + match[0].length + chain.length;
    const properties = chain.split('.').map((p) => p.trim().toLowerCase()).filter(Boolean);
    const dynamic = /^\s*\[/.test(after.slice(chain.length));
    const path = [root, ...properties].join('.') + (dynamic ? '[…]' : '');
    if (UNTRUSTED_ROOTS.has(root)) found.push(path);
    else if (root === 'github' && (dynamic || properties.length !== 1 || !SAFE_GITHUB_PROPERTIES.has(properties[0]))) {
      found.push(path);
    }
  }
  return found;
}

/** The text of every run:/script: value, including block scalars and continued plain scalars. */
function scriptBodies(lines) {
  const bodies = [];
  lines.forEach((line, index) => {
    for (const key of keysOn(line.code, 'run|script')) {
      const column = key.inFlow ? indentOf(line.raw) : key.column;
      const parts = [{ number: line.number, text: line.raw.slice(key.valueStart) }];
      for (const next of continuation(lines, index, column)) parts.push({ number: next.number, text: next.raw });
      bodies.push({ key: key.name, parts });
    }
  });
  return bodies;
}

function checkScripts(file, bodies) {
  for (const { key, parts } of bodies) {
    let text = '';
    const starts = [];
    for (const part of parts) {
      starts.push({ offset: text.length, number: part.number });
      text += `${part.text}\n`;
    }
    for (const match of text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
      const references = untrustedReferences(match[1]);
      if (references.length === 0) continue;
      const number = starts.filter((s) => s.offset <= match.index).at(-1).number;
      report(
        file,
        number,
        'script-injection',
        `'${references.join("', '")}' interpolated into '${key}:' — pass it through env: and use "$VAR" (only trusted github.* identifiers, matrix, runner, vars may appear)`,
      );
    }
  }
}

// ---- actions ----------------------------------------------------------------------------------------

function loadAllowedActions() {
  const file = join(ROOT, POLICY_CONFIG);
  const allowed = new Set();
  if (!existsSync(file)) return allowed;
  const text = readFileSync(file, 'utf8');
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    report(file, 1, 'policy-config', 'is not valid JSON');
    return allowed;
  }
  if (!Array.isArray(config?.allowedThirdPartyActions)) {
    report(file, 1, 'policy-config', "needs an 'allowedThirdPartyActions' array of 'owner/repo' strings");
    return allowed;
  }
  for (const entry of config.allowedThirdPartyActions) {
    const line = lineOf(text, JSON.stringify(entry));
    if (typeof entry !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(entry)) {
      report(file, line, 'policy-config', `entry ${JSON.stringify(entry)} must be an 'owner/repo' string`);
    } else if (AI_ACTION_OWNERS.has(entry.split('/')[0].toLowerCase()) || AI_ACTION_NAME.test(entry) || MERGE_ACTION_NAME.test(entry)) {
      report(file, line, 'policy-config', `'${entry}' is an AI or merge/approve action and can never be allowlisted`);
    } else {
      allowed.add(entry.toLowerCase());
    }
  }
  return allowed;
}

/** A `uses:` reference: AI and merge/approve actions are always rejected; third parties need review + SHA pin. */
function checkAction(file, number, reference, allowed, localActions) {
  if (reference.startsWith('./')) {
    localActions.add(reference);
    return;
  }
  if (/^docker:\/\//i.test(reference)) {
    report(file, number, 'third-party-action', `Docker image action '${reference}' is not allowed — its code is not reviewable here`);
    return;
  }
  const at = reference.lastIndexOf('@');
  const path = at > 0 ? reference.slice(0, at) : reference;
  const version = at > 0 ? reference.slice(at + 1) : '';
  const [owner = '', repo = ''] = path.toLowerCase().split('/');
  if (AI_ACTION_OWNERS.has(owner) || AI_ACTION_NAME.test(path)) {
    report(file, number, 'ai-action', `'${path}' runs an AI agent/model action — paid AI API integrations are not allowed`);
  } else if (MERGE_ACTION_NAME.test(path)) {
    report(file, number, 'merge-or-approve', `'${path}' automates merging or approving pull requests — only the owner merges or approves`);
  } else if (GITHUB_OWNED.has(owner)) {
    // GitHub-owned actions (actions/*, github/*) may use version tags.
  } else if (!allowed.has(`${owner}/${repo}`)) {
    report(file, number, 'third-party-action', `'${path}' is not in the owner-reviewed allowlist (${POLICY_CONFIG})`);
  } else if (!FULL_SHA.test(version)) {
    report(file, number, 'third-party-action', `'${path}' must be pinned to a full 40-character commit SHA`);
  }
}

// ---- file checks ------------------------------------------------------------------------------------

/** Rules shared by workflows and actions: AI integrations, secrets, actions, scripts, YAML features. */
function checkIntegrations(file, lines, allowed, localActions) {
  const bodies = scriptBodies(lines);
  const literalLines = new Set(bodies.flatMap((b) => b.parts.slice(1).map((p) => p.number)));
  lines.forEach((line, index) => {
    const block = line.code.match(/^(\s*(?:-\s+)?)(['"]?)[^'":]+\2\s*:\s*[|>][-+0-9]*\s*$/);
    if (block) for (const text of continuation(lines, index, block[1].length)) literalLines.add(text.number);
  });

  lines.forEach(({ number, code }, index) => {
    if (code.trim() === '') return;

    for (const key of keysOn(code, 'uses')) {
      let value = code.slice(key.valueStart);
      if (key.inFlow) value = value.split(/[,}]/)[0];
      value = value.trim();
      if (value === '' || /^[|>]/.test(value)) {
        value = continuation(lines, index, key.column).map((l) => l.code.trim()).join('');
      }
      checkAction(file, number, unquote(value), allowed, localActions);
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
      if (name !== 'GITHUB_TOKEN') report(file, number, 'secret', `secrets.${name}: workflows may use only secrets.GITHUB_TOKEN`);
    }
    if (/\bsecrets\s*\[/.test(code) || /toJSON\(\s*secrets\s*\)/i.test(code) || /^\s*(['"]?)secrets\1\s*:\s*['"]?inherit\b/.test(code)) {
      report(file, number, 'secret', 'exposes the whole secrets context — workflows may use only secrets.GITHUB_TOKEN');
    }

    for (const [pattern, what] of MERGE_OR_APPROVE) {
      if (pattern.test(code)) report(file, number, 'merge-or-approve', `${what} — only the owner merges or approves (AGENTS.md §3)`);
    }

    // Anchors, aliases and merge keys can rebuild mappings this line-based checker would not see.
    if (!literalLines.has(number) && (/(?:^\s*(?:-\s+)?|:\s+|[{,[]\s*)[&*][A-Za-z0-9_-]/.test(code) || /^\s*(?:-\s+)?['"]?<<['"]?\s*:/.test(code))) {
      report(file, number, 'yaml-feature', 'YAML anchors, aliases and merge keys are not allowed in automation files — write the mapping out');
    }
  });

  checkScripts(file, bodies);
}

/** One `scope: level` pair, with quotes removed from both. */
function parsePermission(text) {
  const match = text.trim().match(/^(['"]?)([\w-]+)\1\s*:\s*(\S.*?)\s*$/);
  return match ? { scope: match[2], level: unquote(match[3]) } : null;
}

/** Workflow-only rules: explicit least-privilege permissions (fail-closed) and safe triggers. */
function checkWorkflow(file, lines) {
  let declared = false;
  lines.forEach((line, index) => {
    for (const key of keysOn(line.code, 'permissions')) {
      const workflowLevel = !key.inFlow && key.column === 0;
      declared ||= workflowLevel;
      const inline = line.code.slice(key.valueStart).trim();
      const entries = [];
      const unreadable = [];

      if (inline === '') {
        for (const child of continuation(lines, index, key.column)) {
          if (child.code.trim() === '') continue; // comment-only line
          const entry = parsePermission(child.code);
          if (entry) entries.push({ ...entry, line: child });
          else unreadable.push({ line: child, text: child.code.trim() });
        }
      } else if (inline.startsWith('{')) {
        // Flow mapping, possibly over several lines: `{ contents: 'read', issues: "write" }`.
        let closed = false;
        for (let j = index; j < lines.length && !closed; j++) {
          let segment = j === index ? inline.slice(1) : lines[j].code;
          if (segment.includes('}')) {
            closed = true;
            segment = segment.slice(0, segment.indexOf('}'));
          }
          for (const part of segment.split(',').map((p) => p.trim()).filter(Boolean)) {
            const entry = parsePermission(part);
            if (entry) entries.push({ ...entry, line: lines[j] });
            else unreadable.push({ line: lines[j], text: part });
          }
        }
        if (!closed) unreadable.push({ line, text: inline });
      } else {
        const value = unquote(key.inFlow ? inline.split(/[,}]/)[0] : inline);
        if (value === 'write-all') report(file, line.number, 'permissions', "'write-all' is never allowed — grant individual scopes");
        else if (value !== 'read-all') unreadable.push({ line, text: value });
      }

      for (const { line: at, text } of unreadable) {
        report(file, at.number, 'permissions', `unreadable permissions value '${text}' — use plain 'scope: read|write|none' entries (no anchors, aliases or merge keys)`);
      }
      for (const { scope, level, line: at } of entries) {
        if (!PERMISSION_LEVELS.has(level)) {
          report(file, at.number, 'permissions', `'${scope}: ${level}' — a permission level must be read, write or none`);
        } else if (level === 'write' && workflowLevel) {
          report(file, at.number, 'permissions', `workflow-level '${scope}: write' — grant write scopes only on the job that needs them`);
        } else if (level === 'write' && !JUSTIFICATION.test(at.raw)) {
          report(file, at.number, 'permissions', `'${scope}: write' needs an inline '# least-privilege: <reason>' comment`);
        }
      }
    }
  });
  if (!declared) {
    report(file, 1, 'permissions', "missing workflow-level 'permissions:' — declare read-only defaults explicitly");
  }

  for (const { code, number } of lines) {
    const trigger = code.match(DANGEROUS_TRIGGER);
    if (trigger) report(file, number, 'trigger', `'${trigger[1]}' runs with elevated privileges on untrusted input — not allowed`);
  }
}

// ---- dependencies -------------------------------------------------------------------------------------

function lineOf(text, needle) {
  const index = text.split(/\r?\n/).findIndex((line) => line.includes(needle));
  return index + 1 || 1;
}

/** `@scope/name@range` / `name@range` → package name. */
const packageNameOf = (spec) => spec.trim().match(/^(@[^/@\s]+\/[^@\s>]+|[^@\s>]+)/)?.[1] ?? spec.trim();

/** A dependency or override value: npm aliases are resolved; non-registry sources are rejected. */
function checkSpec(file, text, name, spec, where) {
  if (typeof spec !== 'string') return;
  const value = spec.trim();
  if (value.startsWith('npm:')) {
    const target = packageNameOf(value.slice(4));
    if (AI_PACKAGE.test(target)) {
      report(file, lineOf(text, `"${name}"`), 'ai-dependency', `${where} '${name}' is an npm alias for '${target}', an AI API SDK — needs an owner-approved ADR`);
    }
  } else if (!value.startsWith('workspace:') && !value.startsWith('$') && /[:/\\]/.test(value)) {
    report(file, lineOf(text, `"${name}"`), 'dependency-source', `${where} '${name}' installs from a non-registry source ('${value}') — the policy cannot see which package that is`);
  }
}

function checkOverrides(file, text, node, where) {
  for (const [key, value] of Object.entries(node ?? {})) {
    for (const name of key.split('>').map(packageNameOf)) {
      if (AI_PACKAGE.test(name)) report(file, lineOf(text, `"${key}"`), 'ai-dependency', `${where} entry '${key}' targets '${name}', an AI API SDK`);
    }
    if (typeof value === 'string') checkSpec(file, text, key, value, where);
    else if (value && typeof value === 'object') checkOverrides(file, text, value, where);
  }
}

function checkManifest(file) {
  const text = readFileSync(file, 'utf8');
  const manifest = JSON.parse(text);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (AI_PACKAGE.test(name)) {
        report(file, lineOf(text, `"${name}"`), 'ai-dependency', `${field} '${name}' is an AI API SDK — needs an owner-approved ADR (zero AI API cost policy)`);
      }
      checkSpec(file, text, name, spec, field);
    }
  }
  checkOverrides(file, text, manifest.overrides, 'overrides');
  checkOverrides(file, text, manifest.resolutions, 'resolutions');
  checkOverrides(file, text, manifest.pnpm?.overrides, 'pnpm.overrides');
}

/** Catch-all: an AI SDK installed under any name or depth shows up in the lockfile with its real name. */
function checkLockfile(file) {
  const text = readFileSync(file, 'utf8');
  let lock;
  try {
    lock = JSON.parse(text);
  } catch {
    report(file, 1, 'ai-dependency', 'lockfile is not valid JSON — cannot verify that no AI SDK is installed');
    return;
  }
  const flag = (name, where) =>
    report(file, lineOf(text, `"${where}"`), 'ai-dependency', `installs '${name}' (at ${where}) — an AI API SDK, directly, by alias or transitively`);
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key) continue;
    const base = key.includes('node_modules/') ? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length) : key;
    const name = entry?.name ?? base;
    if (AI_PACKAGE.test(name)) flag(name, key);
  }
  // lockfileVersion 1: nested `dependencies` trees, aliases recorded as `version: "npm:<name>@…"`.
  const walk = (dependencies) => {
    for (const [key, entry] of Object.entries(dependencies ?? {})) {
      const aliasTarget = typeof entry?.version === 'string' && entry.version.startsWith('npm:') ? packageNameOf(entry.version.slice(4)) : null;
      if (AI_PACKAGE.test(key)) flag(key, key);
      else if (aliasTarget && AI_PACKAGE.test(aliasTarget)) flag(aliasTarget, key);
      walk(entry?.dependencies);
    }
  };
  walk(lock.dependencies);
}

// ---- discovery ----------------------------------------------------------------------------------------

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

const isYaml = (name) => /\.ya?ml$/.test(name);
const workflows = listFiles(join(ROOT, '.github', 'workflows'), isYaml);
const actions = listFiles(join(ROOT, '.github', 'actions'), (name) => /^action\.ya?ml$/.test(name));
const manifests = packageManifests();
const lockfiles = ['package-lock.json', 'npm-shrinkwrap.json'].map((name) => join(ROOT, name)).filter(existsSync);
const allowed = loadAllowedActions();
const localActions = new Set();

for (const file of workflows) {
  const lines = readLines(file);
  checkIntegrations(file, lines, allowed, localActions);
  checkWorkflow(file, lines);
}
// Local actions referenced as `uses: ./path` are checked wherever they live, including nested ones.
const queue = [...actions];
const checkedActions = new Set();
const enqueueLocalActions = () => {
  for (const reference of localActions) {
    for (const name of ['action.yml', 'action.yaml']) {
      const file = join(ROOT, reference, name);
      if (existsSync(file) && !checkedActions.has(file)) queue.push(file);
    }
  }
};
enqueueLocalActions();
while (queue.length > 0) {
  const file = queue.shift();
  if (checkedActions.has(file)) continue;
  checkedActions.add(file);
  checkIntegrations(file, readLines(file), allowed, localActions);
  enqueueLocalActions();
}
for (const file of manifests) checkManifest(file);
for (const file of lockfiles) checkLockfile(file);

if (violations.length > 0) {
  const listing = violations.map((v) => `${v.file}:${v.line}: [${v.rule}] ${v.message}`).join('\n  ');
  console.error(`✗ ${violations.length} workflow policy violation(s):\n  ${listing}\n  Policy: ${POLICY_DOC}`);
  process.exit(1);
}
console.log(
  `✓ workflow policy OK (${workflows.length} workflow, ${checkedActions.size} action, ${manifests.length} package, ` +
    `${lockfiles.length} lock files: no AI API integrations, least-privilege permissions)`,
);
