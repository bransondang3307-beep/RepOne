// RO-019 loop — pure helpers (no I/O). Everything that touches model output or
// PR content treats it as untrusted data. Unit-tested in tests/lib.test.cjs.
'use strict';

const C = require('./config.cjs');

// ---------------------------------------------------------------- settings ---

function normalizeMode(raw) {
  const mode = String(raw ?? '').trim().toLowerCase();
  return C.MODES.includes(mode) ? mode : 'off';
}

function parseBool(raw) {
  return String(raw ?? '').trim().toLowerCase() === 'true';
}

/** Owner + optional comma-separated repository variable; logins compared case-insensitively. */
function allowedActors(owner, extraCsv) {
  const list = [owner, ...String(extraCsv ?? '').split(',')]
    .map((s) => String(s ?? '').trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

function isAllowed(login, allowlist) {
  return !!login && allowlist.includes(String(login).toLowerCase());
}

// ------------------------------------------------------------ sanitising ---

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
];

/**
 * Make untrusted text safe to embed in a PR comment: strip HTML comments
 * (prevents forged loop markers / hidden content), escape '<', neutralise
 * @mentions (prevents pinging users or triggering mention-based bots),
 * redact secret-looking tokens, drop control characters, cap length.
 */
function sanitizeText(raw, max) {
  let s = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '');
  s = s.replace(/<!--|-->/g, '');
  s = s.replace(/</g, '&lt;');
  s = s.replace(/@(?=[A-Za-z0-9_-])/g, '@\u200B');
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[REDACTED]');
  if (max && s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

/** For a single markdown table cell. */
function cell(raw, max) {
  return sanitizeText(raw, max).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

// ----------------------------------------------------------- review data ---

const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

/**
 * Validate Codex's structured output (already JSON.parsed or a string).
 * Returns { ok, review?, error? }. Normalises: verdict is derived from findings
 * (changes_requested iff any blocking finding); P0/P1 are always blocking.
 */
function validateReview(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: 'Codex output is not valid JSON' };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Codex output is not an object' };
  if (typeof data.summary !== 'string') return { ok: false, error: 'missing summary' };
  if (!Array.isArray(data.findings)) return { ok: false, error: 'missing findings array' };
  if (data.findings.length > C.TEXT_LIMITS.MAX_FINDINGS) return { ok: false, error: `too many findings (> ${C.TEXT_LIMITS.MAX_FINDINGS})` };

  const L = C.TEXT_LIMITS;
  const findings = [];
  for (const [i, f] of data.findings.entries()) {
    if (!f || typeof f !== 'object') return { ok: false, error: `finding ${i} is not an object` };
    if (!SEVERITIES.includes(f.severity)) return { ok: false, error: `finding ${i} has invalid severity` };
    for (const k of ['title', 'file', 'details', 'suggested_fix']) {
      if (typeof f[k] !== 'string') return { ok: false, error: `finding ${i} missing ${k}` };
    }
    if (f.line !== null && f.line !== undefined && !(Number.isInteger(f.line) && f.line >= 0)) {
      return { ok: false, error: `finding ${i} has invalid line` };
    }
    const blocking = f.severity === 'P0' || f.severity === 'P1' || f.blocking === true;
    findings.push({
      id: `F${i + 1}`,
      severity: f.severity,
      blocking,
      title: f.title.slice(0, L.TITLE),
      file: f.file.slice(0, L.FILE),
      line: Number.isInteger(f.line) ? f.line : null,
      details: f.details.slice(0, L.DETAILS),
      suggested_fix: f.suggested_fix.slice(0, L.FIX),
    });
  }
  const verdict = findings.some((f) => f.blocking) ? 'changes_requested' : 'approve';
  return {
    ok: true,
    review: { verdict, modelVerdict: String(data.verdict ?? ''), summary: data.summary.slice(0, L.SUMMARY), findings },
  };
}

// -------------------------------------------------------------- markers ---

function buildMarker(meta) {
  return `<!-- ${C.MARKER_PREFIX} ${JSON.stringify(meta)} -->`;
}

function buildPayload(obj) {
  let json = JSON.stringify(obj);
  if (json.length > C.MAX_PAYLOAD_JSON_CHARS) {
    // Keep blocking findings first; drop the rest until it fits.
    const findings = [...obj.findings].sort((a, b) => Number(b.blocking) - Number(a.blocking));
    while (findings.length && JSON.stringify({ ...obj, findings }).length > C.MAX_PAYLOAD_JSON_CHARS) findings.pop();
    json = JSON.stringify({ ...obj, findings, truncated: true });
  }
  return `<!-- ${C.PAYLOAD_PREFIX} ${Buffer.from(json, 'utf8').toString('base64')} -->`;
}

/** Loop state is only trusted from comments authored by the Actions bot. */
function isBotComment(comment) {
  return comment?.user?.login === C.BOT_LOGIN && comment?.user?.type === 'Bot';
}

function parseMarker(body) {
  const re = new RegExp(`<!-- ${C.MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\{[^\\n]*?\\}) -->`);
  const m = typeof body === 'string' ? body.match(re) : null;
  if (!m) return null;
  try {
    const meta = JSON.parse(m[1]);
    return meta && typeof meta === 'object' && typeof meta.kind === 'string' ? meta : null;
  } catch {
    return null;
  }
}

function parsePayload(body) {
  const m = typeof body === 'string' ? body.match(new RegExp(`<!-- ${C.PAYLOAD_PREFIX} ([A-Za-z0-9+/=]+) -->`)) : null;
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** Bot-authored loop events on a PR, oldest first: [{ comment, meta }]. */
function loopEvents(comments) {
  return comments
    .filter(isBotComment)
    .map((comment) => ({ comment, meta: parseMarker(comment.body) }))
    .filter((e) => e.meta);
}

function summarizeLoopState(comments) {
  const events = loopEvents(comments);
  const real = events.filter((e) => !e.meta.dryRun);
  return {
    events,
    realReviews: real.filter((e) => e.meta.kind === 'codex-review'),
    realFixes: real.filter((e) => e.meta.kind === 'claude-fix'),
  };
}

// ------------------------------------------------------------ path rules ---

function matchesRule(path, rule) {
  if (rule.startsWith('**/') && rule.endsWith('/')) {
    const dir = rule.slice(3, -1);
    return path.split('/').slice(0, -1).includes(dir);
  }
  if (rule.startsWith('**/')) {
    const base = rule.slice(3);
    return path === base || path.endsWith(`/${base}`);
  }
  return rule.endsWith('/') ? path.startsWith(rule) : path === rule;
}

function protectedHits(paths, rules = C.PROTECTED_PATHS) {
  return paths.filter((p) => rules.some((r) => matchesRule(p, r)));
}

function touchesAutomation(paths) {
  return paths.filter((p) => C.AUTOMATION_PATHS.some((r) => p.startsWith(r)));
}

/**
 * Check a candidate patch produced from Claude's edits.
 * nameStatus: lines of `git diff --cached --name-status -M` ; numstat: lines of `--numstat`;
 * summary: lines of `--summary`; bytes: patch size.
 */
function checkPatch({ nameStatus, numstat, summary, bytes }) {
  const problems = [];
  const paths = [];
  for (const line of nameStatus.filter(Boolean)) {
    const parts = line.split('\t');
    paths.push(...parts.slice(1));
  }
  const unique = [...new Set(paths)];
  if (unique.length === 0) return { changed: false, ok: true, problems, paths: unique };
  const hits = protectedHits(unique);
  if (hits.length) problems.push(`touches protected paths: ${hits.join(', ')}`);
  if (unique.some((p) => p.split('/').includes('.git'))) problems.push('touches a .git path');
  if (unique.length > C.PATCH_LIMITS.MAX_FILES) problems.push(`changes ${unique.length} files (max ${C.PATCH_LIMITS.MAX_FILES})`);
  if (bytes > C.PATCH_LIMITS.MAX_BYTES) problems.push(`patch is ${bytes} bytes (max ${C.PATCH_LIMITS.MAX_BYTES})`);
  if (numstat.filter(Boolean).some((l) => l.startsWith('-\t-\t'))) problems.push('contains binary changes');
  if (summary.filter(Boolean).some((l) => /mode change|symlink|120000/.test(l))) problems.push('changes file modes or symlinks');
  return { changed: true, ok: problems.length === 0, problems, paths: unique };
}

// -------------------------------------------------------------- rendering ---

function renderReviewComment({ review, meta, runUrl, dryRun, fixRoundsDone }) {
  const head = String(meta.sha).slice(0, 7);
  const blocking = review.findings.filter((f) => f.blocking);
  const lines = [
    buildMarker(meta),
    `## ${dryRun ? '[DRY RUN — synthetic findings, no API call] ' : ''}Codex automated review — head \`${head}\``,
    '',
    `**Verdict:** ${review.verdict === 'approve' ? '✅ no blocking findings' : `⛔ changes requested (${blocking.length} blocking)`}` +
      ` · fix rounds used: ${fixRoundsDone}/${C.MAX_FIX_ROUNDS} · [workflow run](${runUrl})`,
    '',
    '### Summary',
    sanitizeText(review.summary, C.TEXT_LIMITS.SUMMARY),
    '',
  ];
  if (review.findings.length) {
    lines.push('### Findings', '', '| ID | Severity | Blocking | Location | Title |', '|---|---|---|---|---|');
    for (const f of review.findings) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      lines.push(`| ${f.id} | ${f.severity} | ${f.blocking ? 'yes' : 'no'} | \`${cell(loc, 300)}\` | ${cell(f.title, 200)} |`);
    }
    for (const f of review.findings) {
      lines.push(
        '',
        `<details><summary><b>${f.id}</b> · ${f.severity}${f.blocking ? ' · blocking' : ''} — ${cell(f.title, 200)}</summary>`,
        '',
        sanitizeText(f.details, C.TEXT_LIMITS.DETAILS),
        '',
        `**Suggested fix:** ${sanitizeText(f.suggested_fix, C.TEXT_LIMITS.FIX)}`,
        '',
        '</details>',
      );
    }
  } else {
    lines.push('_No findings._');
  }
  lines.push(
    '',
    '---',
    '_Automated by the RO-019 Claude ↔ Codex loop (`.github/workflows/ai-codex-review.yml`). Model output is untrusted text. ' +
      '**The automation never merges** — merging into `main` requires the owner._',
  );
  let body = lines.join('\n');
  const payload = buildPayload({ verdict: review.verdict, summary: review.summary, findings: review.findings });
  if (body.length + payload.length + 2 > C.MAX_COMMENT_CHARS) {
    body = `${body.slice(0, C.MAX_COMMENT_CHARS - payload.length - 40)}\n\n_…truncated_`;
  }
  return `${body}\n\n${payload}`;
}

/**
 * After a review is posted, decide what the loop does next.
 * Returns { action: 'stop-approved' | 'stop-cap' | 'stop-branch' | 'stop-manual' | 'dispatch-fix', reason }.
 */
function decideAfterReview({ verdict, fixRoundsDone, chain, headRef, branchPrefix }) {
  if (verdict === 'approve') return { action: 'stop-approved', reason: 'no blocking findings' };
  if (fixRoundsDone >= C.MAX_FIX_ROUNDS) {
    return { action: 'stop-cap', reason: `maximum of ${C.MAX_FIX_ROUNDS} automatic fix rounds reached` };
  }
  if (!String(headRef).startsWith(branchPrefix)) {
    return { action: 'stop-branch', reason: `automated fixes only run on \`${branchPrefix}*\` branches` };
  }
  if (!chain) return { action: 'stop-manual', reason: 'chaining disabled (manual mode without chain=true)' };
  return { action: 'dispatch-fix', reason: `dispatching Claude fix round ${fixRoundsDone + 1}/${C.MAX_FIX_ROUNDS}` };
}

module.exports = {
  normalizeMode,
  parseBool,
  allowedActors,
  isAllowed,
  sanitizeText,
  validateReview,
  buildMarker,
  buildPayload,
  isBotComment,
  parseMarker,
  parsePayload,
  loopEvents,
  summarizeLoopState,
  protectedHits,
  touchesAutomation,
  checkPatch,
  renderReviewComment,
  decideAfterReview,
};
