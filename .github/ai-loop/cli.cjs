#!/usr/bin/env node
// RO-019 loop — small trusted CLI used by workflow steps. Values arrive via env
// (never interpolated into shell), outputs go to $GITHUB_OUTPUT.
//   node cli.cjs codex-prompt   -> writes the Codex prompt file
//   node cli.cjs claude-prompt  -> writes the Claude prompt to $GITHUB_OUTPUT (prompt=...)
//   node cli.cjs overlay        -> makes $PR_DIR's working tree match $TREE_DIR (no symlinks, no .git)
//   node cli.cjs check-patch    -> stages $PR_DIR, applies the patch policy, writes fix.patch
//   node cli.cjs append-handoff -> appends the deterministic round section to the PR handoff
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const C = require('./config.cjs');
const L = require('./lib.cjs');

const env = process.env;
const HERE = __dirname;

function setOutput(key, value) {
  const v = String(value);
  if (!env.GITHUB_OUTPUT) return void console.log(`${key}=${v}`);
  const delim = `EOF_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(env.GITHUB_OUTPUT, v.includes('\n') ? `${key}<<${delim}\n${v}\n${delim}\n` : `${key}=${v}\n`);
}

function fill(template, vars) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`unknown template variable ${k}`);
    return String(vars[k]);
  });
}

/** Only allow values we generated or validated (numbers, SHAs, refs, paths) into prompts. */
function safeToken(value, re, name) {
  const v = String(value ?? '');
  if (!re.test(v)) throw new Error(`refusing unsafe ${name}: ${JSON.stringify(v.slice(0, 80))}`);
  return v;
}
const SHA = /^[0-9a-f]{40}$/;
const NUM = /^[1-9][0-9]{0,9}$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;
const PATHLIKE = /^[A-Za-z0-9._/-]{1,500}$/;

function git(cwd, args, opts = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
    cwd,
    encoding: opts.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

const commands = {
  'codex-prompt'() {
    const template = fs.readFileSync(path.join(HERE, 'prompts', 'codex-review.md'), 'utf8');
    const text = fill(template, {
      PR_NUMBER: safeToken(env.PR_NUMBER, NUM, 'PR_NUMBER'),
      BASE_SHA: safeToken(env.BASE_SHA, SHA, 'BASE_SHA'),
      HEAD_SHA: safeToken(env.HEAD_SHA, SHA, 'HEAD_SHA'),
      CONTEXT_DIR: safeToken(env.CONTEXT_DIR, PATHLIKE, 'CONTEXT_DIR'),
      TRUSTED_DIR: safeToken(env.TRUSTED_DIR, PATHLIKE, 'TRUSTED_DIR'),
      REVIEW_ROUND: safeToken(env.REVIEW_ROUND, NUM, 'REVIEW_ROUND'),
      MAX_FIX_ROUNDS: C.MAX_FIX_ROUNDS,
    });
    fs.writeFileSync(env.PROMPT_FILE, text);
    console.log(`Codex prompt written (${text.length} chars)`);
  },

  'claude-prompt'() {
    const template = fs.readFileSync(path.join(HERE, 'prompts', 'claude-fix.md'), 'utf8');
    const text = fill(template, {
      PR_NUMBER: safeToken(env.PR_NUMBER, NUM, 'PR_NUMBER'),
      HEAD_SHA: safeToken(env.HEAD_SHA, SHA, 'HEAD_SHA'),
      HEAD_REF: safeToken(env.HEAD_REF, REF, 'HEAD_REF'),
      ROUND: safeToken(env.ROUND, NUM, 'ROUND'),
      MAX_FIX_ROUNDS: C.MAX_FIX_ROUNDS,
      HANDOFF_PATH: env.HANDOFF_PATH ? safeToken(env.HANDOFF_PATH, PATHLIKE, 'HANDOFF_PATH') : '(none found — skip the handoff step)',
      PROTECTED_LIST: C.PROTECTED_PATHS.map((p) => `- \`${p}\``).join('\n'),
    });
    setOutput('prompt', text);
    console.log(`Claude prompt prepared (${text.length} chars)`);
  },

  /**
   * Make PR_DIR's working tree match TREE_DIR (Claude's edited copy): copy regular files with
   * their mode, delete files Claude removed, skip symlinks and any `.git` path. PR_DIR/.git is untouched.
   */
  overlay() {
    const src = path.resolve(env.TREE_DIR);
    const dst = path.resolve(env.PR_DIR);
    const list = (root) => {
      const files = new Set();
      const walk = (rel) => {
        for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
          if (entry.name === '.git') continue;
          const r = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) walk(r);
          else if (entry.isFile()) files.add(r);
          // symlinks, sockets, devices: ignored on purpose
        }
      };
      walk('');
      return files;
    };
    const want = list(src);
    let removed = 0;
    let copied = 0;
    for (const rel of list(dst)) {
      if (!want.has(rel)) {
        fs.unlinkSync(path.join(dst, rel));
        removed++;
      }
    }
    for (const rel of want) {
      const from = path.join(src, rel);
      const to = path.join(dst, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const existing = fs.existsSync(to) ? fs.lstatSync(to) : null;
      if (existing && !existing.isFile()) fs.rmSync(to, { recursive: true, force: true });
      fs.copyFileSync(from, to);
      fs.chmodSync(to, fs.statSync(from).mode & 0o777);
      copied++;
    }
    console.log(`overlay: ${copied} files copied, ${removed} removed`);
  },

  /** Stage the overlaid tree in PR_DIR and evaluate it. Outputs changed / patch_ok / problems / files. */
  'check-patch'() {
    const dir = env.PR_DIR;
    git(dir, ['add', '-A']);
    const nameStatus = git(dir, ['diff', '--cached', '--name-status', '--no-renames']).split('\n');
    const numstat = git(dir, ['diff', '--cached', '--numstat', '--no-renames']).split('\n');
    const summary = git(dir, ['diff', '--cached', '--summary', '--no-renames']).split('\n');
    const patch = git(dir, ['diff', '--cached', '--binary', '--no-renames'], { encoding: 'buffer' });
    const result = L.checkPatch({ nameStatus, numstat, summary, bytes: patch.length });
    fs.writeFileSync(env.PATCH_FILE, patch);
    setOutput('changed', result.changed);
    setOutput('patch_ok', result.ok);
    setOutput('problems', result.problems.join('; '));
    setOutput('files', result.paths.join(','));
    console.log(JSON.stringify(result, null, 2));
  },

  'append-handoff'() {
    const rel = env.HANDOFF_PATH;
    if (!rel) return void console.log('No handoff file in this PR; skipping.');
    safeToken(rel, PATHLIKE, 'HANDOFF_PATH');
    const file = path.join(env.PR_DIR, rel);
    if (!fs.existsSync(file)) return void console.log(`Handoff ${rel} not present at head; skipping.`);
    const section = [
      '',
      `## Automated fix round ${safeToken(env.ROUND, NUM, 'ROUND')}/${C.MAX_FIX_ROUNDS} (RO-019 Claude ↔ Codex loop)`,
      '',
      '| | |',
      '|---|---|',
      `| **Trigger** | Codex review ${env.REVIEW_COMMENT_URL || ''} on \`${safeToken(env.HEAD_SHA, SHA, 'HEAD_SHA').slice(0, 7)}\` |`,
      `| **Changed files** | ${String(env.FILES || '').split(',').filter(Boolean).map((f) => `\`${f}\``).join(', ') || '—'} |`,
      `| **Verification** | \`npm ci && npm run verify\` in [workflow run](${env.RUN_URL}); this commit is pushed **only if it passes** |`,
      '| **Commit** | the automated commit that adds this section (see PR timeline) |',
      '| **Merge** | not merged by automation — owner approval required |',
      '',
    ].join('\n');
    fs.appendFileSync(file, section);
    console.log(`Appended round section to ${rel}`);
  },
};

const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error(`usage: cli.cjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
try {
  commands[cmd]();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
