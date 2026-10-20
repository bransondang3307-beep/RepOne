#!/usr/bin/env node
// Automation policy for RepOne (RO-019, ADR 0005): zero additional AI API cost and least-privilege
// GitHub Actions. Scans .github/workflows/*, local actions, every workspace package.json and the npm
// lockfile. Workflows and actions are parsed with the `yaml` package (YAML 1.2), so keys and values are
// checked after quoting and escapes are decoded — `"uses"` is `uses`. The checker is FAIL-CLOSED:
// YAML features it does not reason about (anchors, aliases, tags, merge keys, directives, several
// documents, non-string or duplicate keys, unknown top-level keys) are rejected, never assumed safe.
// Usage: node scripts/check-workflow-policy.mjs [repoRoot]   — exit 0 = OK, 1 = violations.
// Needs `npm ci` first (dependency: yaml).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LineCounter, isMap, isScalar, isSeq, parseAllDocuments, visit } from 'yaml';

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
  /\b(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|[\w-]+\.openai\.azure\.com|[\w-]+\.services\.ai\.azure\.com|models\.inference\.ai\.azure\.com|[\w-]+\.cognitiveservices\.azure\.com|bedrock(?:-[\w]+)*\.[\w.-]*amazonaws\.com|runtime\.sagemaker\.[\w.-]*amazonaws\.com|[\w-]+\.ml\.cloud\.ibm\.com|api\.mistral\.ai|openrouter\.ai|api\.groq\.com|api\.x\.ai|api\.deepseek\.com|api\.cohere\.(?:ai|com)|api\.perplexity\.ai)\b/i;
const AI_CLI = [
  /@openai\/codex\b/i,
  /@anthropic-ai\/[\w-]+/i,
  /@google\/(?:gemini-cli|genai|generative-ai)\b/i,
  /\bnpm:(?:openai|@openai\/|@anthropic-ai\/|@google\/(?:genai|generative-ai|gemini-cli)|@ai-sdk\/)/i,
  /\bpip3?\s+install\b.*\b(?:openai|anthropic|google-genai|google-generativeai)\b/i,
  /\b(?:npm|npx|pnpm|yarn|bunx?)\b.*\s(?:openai|@ai-sdk\/[\w-]+)(?:@[\w.^~-]+)?(?:\s|$)/i,
  /\b(?:codex\s+exec|claude\s+(?:-p|--print)|gemini\s+(?:-p|--prompt))\b/i,
  // Cloud AI SDKs and CLIs (AWS Bedrock / SageMaker Runtime, Azure OpenAI / Azure AI, IBM watsonx).
  /@aws-sdk\/client-(?:bedrock|sagemaker-runtime)\b|@azure\/openai\b|@azure(?:-rest)?\/ai-[\w-]+|@ibm-cloud\/watsonx-ai\b/i,
  /\baws\s+(?:bedrock(?:-[\w-]+)?|sagemaker-runtime)\s/i,
];
/**
 * AI SDK packages. Installing one — directly, by alias, by override or transitively — needs an owner-approved
 * ADR. This is a denylist, so it can never be complete (new SDKs appear all the time): it is defense in depth.
 * The $0 guarantee rests on account controls — no AI API keys in secrets (enforced by the `secret` rule), no
 * API billing accounts, no paid extra usage — see docs/automation/claude-codex-workflow.md §7.
 */
const AI_PACKAGE = new RegExp(
  `^(?:${[
    // Model vendors
    'openai', '@openai/.+', '@anthropic-ai/.+', '@google/(?:genai|generative-ai|gemini-cli)', '@mistralai/.+', 'cohere-ai',
    'groq-sdk', 'together-ai', 'replicate', 'ollama', '@huggingface/inference', '@ibm-cloud/watsonx-ai',
    // Cloud AI platforms: AWS Bedrock (runtime, agent, agent runtime, data automation …), SageMaker Runtime,
    // Google Vertex AI, Azure OpenAI and Azure AI services (inference, projects, agents, …)
    '@aws-sdk/client-bedrock(?:-[\\w-]+)?', '@aws-sdk/client-sagemaker-runtime', '@google-cloud/(?:vertexai|aiplatform)',
    '@azure/openai', '@azure(?:-rest)?/ai-[\\w-]+',
    // Frameworks and gateways that bundle provider clients
    'ai', '@ai-sdk/.+', 'langchain', '@langchain/.+', 'llamaindex', '@llamaindex/.+', '@openrouter/.+',
  ].join('|')})$`,
);

// ---- merge and approval paths (AGENTS.md §3: only the owner merges or approves) ---------------
/** Actions whose purpose is merging or approving pull requests. Rejected even if allowlisted. */
const MERGE_ACTION_NAME = /(?:^|[/_.-])(?:auto-?merge|merge|auto-?approve|approve|approval|mergify|kodiak)(?:$|[/_.-])/i;
/** Commands in any string value (scripts, inputs) that merge, approve or force-push. */
const MERGE_OR_APPROVE = [
  [/\bgh\s+pr\s+merge\b/, 'merges a pull request'],
  [/\bgh\s+pr\s+review\b.*(?:--approve\b|\s-a(?:\s|$))/, 'approves a pull request'],
  [/\bevent['"]?\s*[:=]\s*['"]?approve\b/i, 'approves a pull request'],
  [/\b(?:pulls\.merge|merge_method|enablePullRequestAutoMerge|mergePullRequest)\b/, 'merges a pull request'],
  [/\/pulls\/[^\s/'"]+\/merge\b/, 'merges a pull request through the REST API'],
  [/\bgit\s+push\b.*(?:--force\b|--force-with-lease\b|\s-f(?:\s|$)|\s\+\S)/, 'force-pushes'],
  [/\bgit\s+push\b.*\s(?:\S+:)?(?:refs\/heads\/)?(?:main|master)(?=\s|$|['"])/, 'pushes to the default branch'],
];

// ---- least privilege and workflow structure ---------------------------------------------------
const JUSTIFICATION = /^\s*least-privilege:\s*\S/;
const PERMISSION_LEVELS = new Set(['read', 'write', 'none']);
const DANGEROUS_TRIGGERS = new Set(['pull_request_target', 'workflow_run']);
/** Top-level keys GitHub accepts in a workflow; anything else is rejected as unreadable. */
const WORKFLOW_KEYS = new Set(['name', 'run-name', 'on', 'permissions', 'env', 'defaults', 'concurrency', 'jobs']);
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

// ---- parsing ----------------------------------------------------------------------------------------

/** Lower-cased key of a pair, or null when the key is not a plain string (reported by `checkYamlHygiene`). */
const keyName = (pair) => (isScalar(pair.key) && typeof pair.key.value === 'string' ? pair.key.value.toLowerCase() : null);
/** Values of every `name:` entry in a mapping, matched case-insensitively after decoding. */
const valuesOf = (map, name) => (isMap(map) ? map.items.filter((pair) => keyName(pair) === name).map((pair) => pair.value) : []);
const isString = (node) => isScalar(node) && typeof node.value === 'string';

/** Parse one automation YAML file. Returns null when it cannot be read as exactly one valid document. */
function parseYamlFile(file) {
  const text = readFileSync(file, 'utf8');
  const lineCounter = new LineCounter();
  const documents = [...parseAllDocuments(text, { lineCounter, uniqueKeys: true, merge: false, version: '1.2' })];
  const yaml = { file, text, lineAt: (offset) => lineCounter.linePos(offset ?? 0).line };
  /** Source line of a node, or of `needle` inside it when the needle appears literally in the source. */
  yaml.lineOf = (node, needle) => {
    const [start = 0, end = start] = node?.range ?? [];
    const index = needle ? text.slice(start, end).indexOf(needle) : -1;
    return yaml.lineAt(index >= 0 ? start + index : start);
  };
  yaml.source = (from, to) => text.slice(from?.range?.[0] ?? 0, (to ?? from)?.range?.[1] ?? 0).trim();

  if (documents.length !== 1) {
    report(file, 1, 'yaml-parse', documents.length === 0 ? 'empty file' : `${documents.length} YAML documents — exactly one is allowed`);
    return null;
  }
  const [document] = documents;
  for (const problem of [...document.errors, ...document.warnings]) {
    report(file, problem.linePos?.[0]?.line ?? 1, 'yaml-parse', problem.message.split('\n')[0]);
  }
  if (document.errors.length > 0 || document.contents === null) return null;
  yaml.document = document;
  yaml.root = document.contents;
  checkYamlHygiene(yaml);
  return yaml;
}

/** Fail-closed: YAML features whose meaning the policy does not model are rejected. */
function checkYamlHygiene(yaml) {
  const { file, text } = yaml;
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.startsWith('%')) report(file, index + 1, 'yaml-feature', 'YAML directives are not allowed in automation files');
  });
  visit(yaml.document, {
    Alias(_, node) {
      report(file, yaml.lineOf(node), 'yaml-feature', `alias '*${node.source}' — write the value out (no anchors or aliases in automation files)`);
    },
    Node(_, node) {
      if (node.anchor) report(file, yaml.lineOf(node), 'yaml-feature', `anchor '&${node.anchor}' — no anchors or aliases in automation files`);
      if (node.tag) report(file, yaml.lineOf(node), 'yaml-feature', `explicit tag '${node.tag}' — tags are not allowed in automation files`);
    },
    Pair(_, pair) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        report(file, yaml.lineOf(pair.key), 'yaml-feature', `mapping key '${yaml.source(pair.key)}' is not a plain string`);
      } else if (pair.key.value === '<<') {
        report(file, yaml.lineOf(pair.key), 'yaml-feature', 'merge keys (<<) are not allowed in automation files');
      }
    },
  });
}

// ---- rules on every decoded string --------------------------------------------------------------

/** AI integrations, secrets, merge/approve commands — in every key and value, after YAML decoding. */
function checkStrings(yaml, allowed, localActions) {
  const { file } = yaml;
  visit(yaml.document, {
    Pair(_, pair) {
      const name = keyName(pair);
      if (name === 'uses') {
        if (isString(pair.value)) checkAction(file, yaml.lineOf(pair.value), pair.value.value.trim(), allowed, localActions);
        else report(file, yaml.lineOf(pair.key), 'third-party-action', "unreadable 'uses:' value");
      }
      if (name === 'secrets' && isString(pair.value) && pair.value.value.trim().toLowerCase() === 'inherit') {
        report(file, yaml.lineOf(pair.value), 'secret', "'secrets: inherit' passes every secret — workflows may use only secrets.GITHUB_TOKEN");
      }
      // `if:` is an expression even without ${{ }} (embedded ${{ }} are checked with every string below).
      if (name === 'if' && isString(pair.value) && !pair.value.value.includes('${{')) {
        checkSecretReferences(yaml, pair.value, [{ expression: pair.value.value, source: pair.value.value.trim() }]);
      }
      if (name === 'event' && isString(pair.value) && pair.value.value.trim().toLowerCase() === 'approve') {
        report(file, yaml.lineOf(pair.value), 'merge-or-approve', 'approves a pull request — only the owner merges or approves (AGENTS.md §3)');
      }
    },
    Scalar(_, node) {
      if (typeof node.value !== 'string') return;
      checkSecretReferences(yaml, node, expressionsIn(node.value));
      for (const text of node.value.split('\n')) {
        if (text.trim() === '') continue;
        const line = yaml.lineOf(node, text.trim());
        const credential = text.match(AI_CREDENTIAL);
        if (credential) report(file, line, 'ai-credential', `'${credential[0]}' looks like an AI API credential — no AI API keys or tokens in automation`);
        const endpoint = text.match(AI_ENDPOINT);
        if (endpoint) report(file, line, 'ai-endpoint', `calls the AI API host '${endpoint[0]}'`);
        if (AI_CLI.some((pattern) => pattern.test(text))) {
          report(file, line, 'ai-cli', 'installs or runs an AI CLI/SDK — automation must not call AI APIs');
        }
        for (const [pattern, what] of MERGE_OR_APPROVE) {
          if (pattern.test(text)) report(file, line, 'merge-or-approve', `${what} — only the owner merges or approves (AGENTS.md §3)`);
        }
      }
    },
  });
}

// ---- expressions ----------------------------------------------------------------------------------

/**
 * Every `${{ … }}` in a string, scanned the way GitHub scans it: a `}}` inside a '…' string literal does not
 * end the expression. An unterminated `${{` runs to the end of the string.
 */
function expressionsIn(text) {
  const found = [];
  let from = 0;
  while ((from = text.indexOf('${{', from)) >= 0) {
    let end = text.length;
    let quoted = false;
    for (let i = from + 3; i < text.length; i++) {
      if (quoted) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") i += 1; // '' is an escaped quote
          else quoted = false;
        }
      } else if (text[i] === "'") {
        quoted = true;
      } else if (text[i] === '}' && text[i + 1] === '}') {
        end = i;
        break;
      }
    }
    found.push({ expression: text.slice(from + 3, end), source: text.slice(from, Math.min(end + 2, text.length)) });
    from = end + 2;
  }
  return found;
}

/**
 * Context references in a GitHub expression. Bracket property access (`github['event']`) is normalised to
 * dots first, so dotted, bracket and mixed forms are judged alike. Contexts are case-insensitive, like GitHub:
 * `root` and `properties` are lower-cased; `path` keeps the original spelling for messages. Object filters
 * (`secrets.*`) appear as a `*` property; dynamic indexes (`secrets[x]`) set `dynamic`; bare contexts
 * (`toJSON(github)`) have no properties.
 */
function contextReferences(expression) {
  const text = expression
    .replace(/\[\s*'((?:[^']|'')*)'\s*\]/g, (_, name) => `.${name.replace(/''/g, "'")}`)
    .replace(/\[\s*"([^"]*)"\s*\]/g, (_, name) => `.${name}`)
    .replace(/'(?:[^']|'')*'/g, "''");
  const references = [];
  const identifier = /[A-Za-z_][\w-]*/g;
  for (let match = identifier.exec(text); match; match = identifier.exec(text)) {
    if (text.slice(0, match.index).trimEnd().endsWith('.')) continue; // a property, not a context
    const after = text.slice(match.index + match[0].length);
    if (/^\s*\(/.test(after)) continue; // a function such as toJSON(…)
    const root = match[0].toLowerCase();
    if (LITERALS.has(root)) continue;
    const chain = after.match(/^(?:\s*\.\s*[\w*-]+)*/)[0];
    identifier.lastIndex = match.index + match[0].length + chain.length;
    const names = chain.split('.').map((p) => p.trim()).filter(Boolean);
    const dynamic = /^\s*\[/.test(after.slice(chain.length));
    references.push({
      root,
      properties: names.map((name) => name.toLowerCase()),
      dynamic,
      path: [match[0], ...names].join('.') + (dynamic ? '[…]' : ''),
    });
  }
  return references;
}

/**
 * References that must not be interpolated into a script: dynamic indexes and whole contexts are
 * rejected, `matrix` is trusted only when the job's matrix is provably static (no expressions).
 */
function untrustedReferences(expression, matrixIsStatic) {
  return contextReferences(expression).flatMap(({ root, properties, dynamic }) => {
    const path = [root, ...properties].join('.') + (dynamic ? '[…]' : '');
    if (UNTRUSTED_ROOTS.has(root)) return [path];
    if (root === 'matrix' && !matrixIsStatic) return [`${path} (the matrix is built from an expression)`];
    if (root === 'github' && (dynamic || properties.length !== 1 || !SAFE_GITHUB_PROPERTIES.has(properties[0]))) return [path];
    return [];
  });
}

/** `secrets` may be referenced only as `secrets.GITHUB_TOKEN` (any case, dotted or bracket form). */
function checkSecretReferences(yaml, node, expressions) {
  for (const { expression, source } of expressions) {
    for (const { root, properties, dynamic, path } of contextReferences(expression)) {
      if (root !== 'secrets') continue;
      if (!dynamic && properties.length === 1 && properties[0] === 'github_token') continue;
      const whole = dynamic || properties.length === 0 || properties.includes('*');
      report(
        yaml.file,
        yaml.lineOf(node, source),
        'secret',
        whole
          ? `exposes the whole secrets context ('${path}') — workflows may use only secrets.GITHUB_TOKEN`
          : `${path}: workflows may use only secrets.GITHUB_TOKEN`,
      );
    }
  }
}

/** A job's matrix is static when nothing under `strategy:` is an expression. */
function hasExpression(node) {
  let found = false;
  visit(node, {
    Scalar(_, scalar) {
      if (typeof scalar.value === 'string' && scalar.value.includes('${{')) {
        found = true;
        return visit.BREAK;
      }
    },
  });
  return found;
}

function checkScript(yaml, node, key, matrixIsStatic, checked) {
  if (checked.has(node)) return;
  checked.add(node);
  if (!isScalar(node)) {
    report(yaml.file, yaml.lineOf(node), 'script-injection', `unreadable '${key}:' value`);
    return;
  }
  const text = String(node.value ?? '');
  for (const { expression, source } of expressionsIn(text)) {
    const references = untrustedReferences(expression, matrixIsStatic);
    if (references.length === 0) continue;
    report(
      yaml.file,
      yaml.lineOf(node, source),
      'script-injection',
      `'${references.join("', '")}' interpolated into '${key}:' — pass it through env: and use "$VAR" (only trusted github.* identifiers, a static matrix, runner, vars may appear)`,
    );
  }
}

function checkStep(yaml, step, matrixIsStatic, checked) {
  if (!isMap(step)) {
    report(yaml.file, yaml.lineOf(step), 'workflow-schema', 'a step must be a mapping');
    return;
  }
  for (const run of valuesOf(step, 'run')) checkScript(yaml, run, 'run', matrixIsStatic, checked);
  for (const inputs of valuesOf(step, 'with')) {
    for (const script of valuesOf(inputs, 'script')) checkScript(yaml, script, 'script', matrixIsStatic, checked);
  }
}

/** Any run:/script: value not reached through the expected structure is still checked, with no trusted matrix. */
function checkRemainingScripts(yaml, checked) {
  visit(yaml.document, {
    Pair(_, pair) {
      const name = keyName(pair);
      if (name === 'run' || name === 'script') checkScript(yaml, pair.value, name, false, checked);
    },
  });
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

// ---- workflow structure -------------------------------------------------------------------------------

/** `permissions:` — read-all, {} or `scope: read|write|none`; writes only on jobs, each with a reason. */
function checkPermissions(yaml, node, workflowLevel) {
  const { file } = yaml;
  if (isString(node)) {
    const value = node.value.trim();
    if (value === 'write-all') report(file, yaml.lineOf(node), 'permissions', "'write-all' is never allowed — grant individual scopes");
    else if (value !== 'read-all') report(file, yaml.lineOf(node), 'permissions', `unreadable permissions value '${yaml.source(node)}'`);
    return;
  }
  if (!isMap(node)) {
    report(file, yaml.lineOf(node), 'permissions', `unreadable permissions value '${yaml.source(node) || 'empty'}' — use plain 'scope: read|write|none' entries`);
    return;
  }
  for (const pair of node.items) {
    const scope = keyName(pair);
    const level = isString(pair.value) ? pair.value.value.trim() : null;
    if (scope === null || level === null) {
      report(file, yaml.lineOf(pair.key), 'permissions', `unreadable permissions value '${yaml.source(pair.key, pair.value)}' — use plain 'scope: read|write|none' entries`);
    } else if (!PERMISSION_LEVELS.has(level)) {
      report(file, yaml.lineOf(pair.value), 'permissions', `'${scope}: ${level}' — a permission level must be read, write or none`);
    } else if (level === 'write' && workflowLevel) {
      report(file, yaml.lineOf(pair.value), 'permissions', `workflow-level '${scope}: write' — grant write scopes only on the job that needs them`);
    } else if (level === 'write' && !JUSTIFICATION.test(pair.value.comment ?? (node.flow ? node.comment : '') ?? '')) {
      report(file, yaml.lineOf(pair.value), 'permissions', `'${scope}: write' needs an inline '# least-privilege: <reason>' comment`);
    }
  }
}

/** Privileged triggers, read from the `on:` declaration only (a string, a list, or a mapping of events). */
function checkTriggers(yaml, on) {
  const events = isString(on) ? [on] : isSeq(on) ? on.items : isMap(on) ? on.items.map((pair) => pair.key) : null;
  if (events === null) {
    report(yaml.file, yaml.lineOf(on), 'trigger', `unreadable 'on:' value '${yaml.source(on)}'`);
    return;
  }
  for (const event of events) {
    const name = isString(event) ? event.value.trim().toLowerCase() : null;
    if (name === null) report(yaml.file, yaml.lineOf(event), 'trigger', `unreadable event '${yaml.source(event)}'`);
    else if (DANGEROUS_TRIGGERS.has(name)) {
      report(yaml.file, yaml.lineOf(event), 'trigger', `'${name}' runs with elevated privileges on untrusted input — not allowed`);
    }
  }
}

function checkWorkflow(yaml, allowed, localActions) {
  const { file, root } = yaml;
  checkStrings(yaml, allowed, localActions);
  if (!isMap(root)) {
    report(file, yaml.lineOf(root), 'workflow-schema', 'a workflow must be a mapping');
    return;
  }
  for (const pair of root.items) {
    const name = keyName(pair);
    if (name !== null && !WORKFLOW_KEYS.has(name)) {
      report(file, yaml.lineOf(pair.key), 'workflow-schema', `unknown top-level key '${pair.key.value}' — GitHub does not accept it and the policy cannot reason about it`);
    }
  }
  for (const on of valuesOf(root, 'on')) checkTriggers(yaml, on);

  const workflowPermissions = valuesOf(root, 'permissions');
  if (workflowPermissions.length === 0) {
    report(file, 1, 'permissions', "missing workflow-level 'permissions:' — declare read-only defaults explicitly");
  }
  for (const permissions of workflowPermissions) checkPermissions(yaml, permissions, true);

  const checked = new Set();
  for (const jobs of valuesOf(root, 'jobs')) {
    if (!isMap(jobs)) {
      report(file, yaml.lineOf(jobs), 'workflow-schema', "'jobs:' must be a mapping");
      continue;
    }
    for (const { value: job } of jobs.items) {
      if (!isMap(job)) {
        report(file, yaml.lineOf(job), 'workflow-schema', 'a job must be a mapping');
        continue;
      }
      for (const permissions of valuesOf(job, 'permissions')) checkPermissions(yaml, permissions, false);
      const matrixIsStatic = !valuesOf(job, 'strategy').some(hasExpression);
      for (const steps of valuesOf(job, 'steps')) {
        if (isSeq(steps)) steps.items.forEach((step) => checkStep(yaml, step, matrixIsStatic, checked));
        else report(file, yaml.lineOf(steps), 'workflow-schema', "'steps:' must be a list");
      }
    }
  }
  checkRemainingScripts(yaml, checked);
}

/** Composite (and other) actions: the same string, action and script rules; no matrix context exists there. */
function checkActionFile(yaml, allowed, localActions) {
  checkStrings(yaml, allowed, localActions);
  const checked = new Set();
  for (const runs of valuesOf(yaml.root, 'runs')) {
    for (const steps of valuesOf(runs, 'steps')) {
      if (isSeq(steps)) steps.items.forEach((step) => checkStep(yaml, step, false, checked));
    }
    for (const image of valuesOf(runs, 'image')) {
      if (isString(image) && /^docker:\/\//i.test(image.value.trim())) {
        report(yaml.file, yaml.lineOf(image), 'third-party-action', `Docker image '${image.value.trim()}' is not allowed — its code is not reviewable here`);
      }
    }
  }
  checkRemainingScripts(yaml, checked);
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

/**
 * Parse a package manifest or lockfile. Malformed JSON (or JSON that is not an object) is reported as a
 * clean `package-manifest` violation — the dependencies cannot be verified, so the check fails — never a crash.
 */
function readPackageJson(file, what) {
  const text = readFileSync(file, 'utf8');
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const line = Number(String(error.message).match(/line (\d+)/)?.[1] ?? 1);
    report(file, line, 'package-manifest', `${what} is not valid JSON (${String(error.message).split('\n')[0]}) — dependencies cannot be verified`);
    return null;
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    report(file, 1, 'package-manifest', `${what} must be a JSON object — dependencies cannot be verified`);
    return null;
  }
  return { text, json };
}

function checkManifest(file) {
  const parsed = readPackageJson(file, 'package.json');
  if (!parsed) return;
  const { text, json: manifest } = parsed;
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
  const parsed = readPackageJson(file, 'lockfile');
  if (!parsed) return;
  const { text, json: lock } = parsed;
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
  const parsed = readPackageJson(rootManifest, 'package.json');
  if (!parsed) return []; // reported once; workspaces cannot be discovered, and the check already fails
  const workspaces = parsed.json.workspaces ?? [];
  const patterns = (Array.isArray(workspaces) ? workspaces : (workspaces.packages ?? [])).filter((p) => typeof p === 'string');
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
  const yaml = parseYamlFile(file);
  if (yaml) checkWorkflow(yaml, allowed, localActions);
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
  const yaml = parseYamlFile(file);
  if (yaml) checkActionFile(yaml, allowed, localActions);
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
