#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { validateConfig, requireThat, initialState, enroll, decide, finish } from './core.mjs';
import { runApproved } from './orchestration.mjs';
import { readJournal, append, lock, removeDeadLock, bindRepository } from './store.mjs';
import { validatePaths, collect, executable, subscriptionCheck, launch, git } from './adapters.mjs';

async function confirm(message, expected) {
  requireThat(process.stdin.isTTY && process.stdout.isTTY, 'INTERACTIVE_OWNER_REQUIRED');
  const terminal = createInterface({ input:process.stdin, output:process.stdout });
  try { requireThat(await terminal.question(`${message}\nType ${expected}: `) === expected, 'NOT_APPROVED'); }
  finally { terminal.close(); }
}

export async function main(argv) {
  const [command,configPath,id,...extra] = argv;
  requireThat(['init','enroll','plan','run','recover'].includes(command) && configPath && extra.length === 0, 'USAGE');
  const raw = readFileSync(configPath,'utf8'), c = validateConfig(JSON.parse(raw));
  validatePaths(c,configPath);
  // Execute trusted controller code from the owner's checkout, never the branch being fixed.
  requireThat(realpathSync(fileURLToPath(new URL('../../',import.meta.url))) === realpathSync(c.worktrees.owner), 'TRUSTED_CONTROLLER_ROOT');
  const common = realpathSync(git(c.worktrees.owner,['rev-parse','--path-format=absolute','--git-common-dir']));
  c.stateDirectory = realpathSync(c.stateDirectory);
  if (command === 'recover') {
    await confirm('Inspect and stop ALL surviving agent processes first. Recovery preserves every consumed round and blocks the interrupted task.', 'RECOVER');
    removeDeadLock(common);
  }
  // All configs/worktrees of a repository share this lock, not merely a caller-selected state path.
  const release = lock(common);
  try {
    let journal = readJournal(c.stateDirectory);
    if (command === 'init') {
      requireThat(!journal.state && !id, 'ALREADY_INITIALIZED');
      bindRepository(common,c,true);
      append(c.stateDirectory,journal,'init',initialState(c));
      console.log('Initialized. Nothing launched.'); return;
    }
    bindRepository(common,c);
    requireThat(journal.state, 'INITIALIZE_FIRST');
    requireThat(journal.state.repo === c.repo && journal.state.project === c.project, 'STATE_PROJECT');
    if (command === 'enroll') {
      requireThat(!id, 'USAGE');
      append(c.stateDirectory,journal,'enrolled',enroll(journal.state,c));
      console.log('Allowlisted tasks enrolled. Existing round counts preserved.'); return;
    }
    if (command === 'recover') {
      requireThat(!id, 'USAGE');
      if (journal.state.active) append(c.stateDirectory,journal,'recovered',finish(journal.state,false));
      console.log('Recovered. Interrupted work remains blocked; no retry or round reset.'); return;
    }
    const tasks = id ? c.tasks.filter(t => t.id === id) : [...c.tasks].sort((a,b) => a.pr-b.pr);
    requireThat(tasks.length > 0 && (command !== 'run' || id), 'ALLOWLIST_TASK_REQUIRED');
    for (const task of tasks) {
      const facts = await collect(c,task);
      const action = decide(c,journal.state,task,facts);
      console.log(JSON.stringify({ task:task.id, pr:task.pr, head:facts.pr.head.sha, action, rounds:Math.max(facts.rounds,journal.state.tasks.find(t => t.id === task.id)?.rounds ?? 0) }));
      if (command !== 'run') continue;
      journal = await runApproved({c,raw,configPath,task,journal,facts,action}, {
        executable,subscriptionCheck,confirm,collect,append,launch,readConfig:path=>readFileSync(path,'utf8'),
      });
      console.log('Session ended. Publish/review evidence manually, then plan again.');
    }
  } finally { release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    // Never echo provider output, raw network/git errors, paths, tokens, or external text.
    console.error('Controller stopped safely. Check config, clean worktrees, current SHA, complete GitHub evidence and the private journal. Use recover after inspecting interrupted processes.');
    process.exitCode = 1;
  });
}
