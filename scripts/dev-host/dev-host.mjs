#!/usr/bin/env node
// Development-host controller, read-only prototype (RO-034).
//
//   node scripts/dev-host/dev-host.mjs report [options]
//
// Reads open PRs, CI check runs and Codex review state from GitHub, the task board from `main`, and the
// local worktree layout; prints an owner-action report. It never merges, approves, pushes, comments,
// edits files in the repository or starts an AI agent, and it does not read instructions from GitHub
// text. See docs/automation/dev-host-controller.md.
//
// Options:
//   --repo <owner/name>        default: parsed from `git remote get-url origin`
//   --maintainer <login>       trusted author of fix-round records (repeatable; default: the repo owner)
//   --claude-worktree <path>   Claude Code's worktree, checked for separation
//   --codex-worktree <path>    Codex's worktree, checked for separation
//   --tasks-ref <ref>          ref to read TASKS.md from (default: origin/main)
//   --fetch                    run `git fetch origin --prune` first (updates remote-tracking refs only)
//   --json                     print the snapshot as JSON instead of Markdown
//   --out <file>               also write the output to this file (outside the repository is recommended)
// Environment:
//   DEV_HOST_GITHUB_TOKEN      optional read-only GitHub token (raises the API rate limit); never printed

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGitHubClient } from './github-client.mjs';
import { assessPullRequest } from './pr-assessment.mjs';
import { renderReport } from './report.mjs';
import { ciState, codexReviewState, fixRoundsUsed, MAX_FIX_ROUNDS } from './review-state.mjs';
import { assessTasks, parseTaskBoard } from './tasks.mjs';
import { checkWorktrees, parseWorktreeList } from './worktrees.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

/** The only git invocations the controller makes. No shell; fixed argument shapes. */
export function allowedGitArgs(args) {
  const [a, b, c] = args;
  if (args.length === 3 && a === 'remote' && b === 'get-url' && c === 'origin') return true;
  if (args.length === 3 && a === 'worktree' && b === 'list' && c === '--porcelain') return true;
  if (args.length === 3 && a === 'fetch' && b === 'origin' && c === '--prune') return true;
  if (args.length === 2 && a === 'show' && typeof b === 'string' && b.endsWith(':TASKS.md')) {
    const ref = b.slice(0, -':TASKS.md'.length);
    return REF.test(ref) && !ref.includes('..');
  }
  if (args.length === 2 && a === 'rev-parse' && typeof b === 'string' && REF.test(b) && !b.includes('..')) return true;
  return false;
}

export function createGitRunner(cwd = REPO_ROOT) {
  return (args) => {
    if (!allowedGitArgs(args)) throw new Error(`Refusing a git command outside the allowlist: git ${args.join(' ')}`);
    return execFileSync('git', args, { cwd, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  };
}

export function repoFromRemote(url) {
  const match = /github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export function parseArgs(argv) {
  const options = { command: null, maintainers: [], json: false, fetch: false, tasksRef: 'origin/main' };
  const valueFlags = { '--repo': 'repo', '--claude-worktree': 'claudeWorktree', '--codex-worktree': 'codexWorktree', '--tasks-ref': 'tasksRef', '--out': 'out' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--fetch') options.fetch = true;
    else if (arg === '--maintainer') options.maintainers.push(requireValue(argv, (i += 1), arg));
    else if (arg in valueFlags) options[valueFlags[arg]] = requireValue(argv, (i += 1), arg);
    else if (!arg.startsWith('-') && options.command === null) options.command = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.command !== 'report') throw new Error('Usage: dev-host.mjs report [--repo owner/name] [--maintainer login] [--claude-worktree path] [--codex-worktree path] [--tasks-ref ref] [--fetch] [--json] [--out file]');
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
  return value;
}

/** Collects everything the report needs. All GitHub and git access is read-only. */
export async function collectSnapshot({ options, git, github, now = new Date() }) {
  const warnings = [];
  const repo = options.repo;
  const maintainers = new Set(options.maintainers.length > 0 ? options.maintainers : [repo.split('/')[0]]);

  if (options.fetch) git(['fetch', 'origin', '--prune']);
  let mainSha = null;
  try {
    mainSha = git(['rev-parse', options.tasksRef]).trim();
  } catch {
    warnings.push(`Could not resolve ${options.tasksRef}.`);
  }

  let taskBoard = [];
  try {
    taskBoard = parseTaskBoard(git(['show', `${options.tasksRef}:TASKS.md`]));
    if (taskBoard.length === 0) warnings.push('TASKS.md has no parsable "## Board" table.');
  } catch {
    warnings.push(`Could not read TASKS.md at ${options.tasksRef}.`);
  }

  const openPulls = await github.listOpenPulls();
  const pulls = [];
  let githubError = null; // after the first failure (often the rate limit), stop calling GitHub
  for (const raw of [...openPulls].sort((a, b) => a.number - b.number)) {
    const pr = {
      number: raw.number,
      title: raw.title ?? '',
      draft: raw.draft === true,
      base: raw.base?.ref ?? '',
      headSha: raw.head?.sha ?? '',
      headRef: raw.head?.ref ?? '',
    };
    if (!/^[0-9a-f]{40}$/.test(pr.headSha)) {
      warnings.push(`PR #${pr.number}: unexpected head SHA; skipped.`);
      continue;
    }
    let checkRuns, issueComments, reviews, reviewComments;
    if (!githubError) {
      try {
        checkRuns = await github.listCheckRuns(pr.headSha);
        issueComments = await github.listIssueComments(pr.number);
        reviews = await github.listReviews(pr.number);
        reviewComments = await github.listReviewComments(pr.number);
      } catch (error) {
        githubError = error;
        warnings.push(`Stopped reading GitHub at PR #${pr.number}: ${error.message}`);
      }
    }
    if (githubError) {
      pulls.push({ ...pr, assessment: { verdict: 'unknown', actor: 'none', action: 'State not read (GitHub request failed; see Warnings).' } });
      continue;
    }
    const ci = ciState(checkRuns);
    const codex = codexReviewState({ headSha: pr.headSha, issueComments, reviews, reviewComments, maintainers });
    const rounds = fixRoundsUsed(issueComments, maintainers);
    const assessment = assessPullRequest({ pr, ci, codex, rounds, maxRounds: MAX_FIX_ROUNDS });
    pulls.push({ ...pr, ci, codex, rounds, assessment });
  }

  const tasks = assessTasks(taskBoard, pulls.map((pull) => ({ number: pull.number, headRef: pull.headRef })));

  let worktrees;
  try {
    worktrees = checkWorktrees(parseWorktreeList(git(['worktree', 'list', '--porcelain'])), {
      claude: options.claudeWorktree,
      codex: options.codexWorktree,
    });
  } catch {
    worktrees = [{ level: 'error', message: 'Could not list git worktrees.' }];
  }

  warnings.push(...github.warnings);
  return { generatedAt: now.toISOString(), repo, mainSha, maxFixRounds: MAX_FIX_ROUNDS, pulls, tasks, worktrees, warnings };
}

export async function main(argv, { env = process.env, git = createGitRunner(), fetchImpl = globalThis.fetch, stdout = process.stdout } = {}) {
  const options = parseArgs(argv);
  if (!options.repo) {
    options.repo = repoFromRemote(git(['remote', 'get-url', 'origin']));
    if (!options.repo) throw new Error('Could not derive <owner>/<name> from the origin remote; pass --repo.');
  }
  const github = createGitHubClient({ repo: options.repo, token: env.DEV_HOST_GITHUB_TOKEN || undefined, fetchImpl });
  const snapshot = await collectSnapshot({ options, git, github });
  const output = options.json ? `${JSON.stringify(snapshot, null, 2)}\n` : `${renderReport(snapshot)}\n`;
  stdout.write(output);
  if (options.out) {
    const target = resolve(options.out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output, 'utf8');
  }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`dev-host: ${error.message}\n`);
    process.exitCode = 1;
  });
}
