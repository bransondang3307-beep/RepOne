import { openSync, closeSync, writeSync, fsyncSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { digest, requireThat } from './core.mjs';

// One append-only, hash-linked journal is both state and audit log. No agent output or external text.
export function readJournal(directory) {
  const file = join(directory, 'journal.jsonl');
  if (!existsSync(file)) return { seq:0, hash:'0'.repeat(64), state:null };
  const raw = readFileSync(file, 'utf8');
  requireThat(raw.endsWith('\n'), 'JOURNAL_TRUNCATED');
  let previous = { seq:0, hash:'0'.repeat(64), state:null };
  for (const line of raw.trimEnd().split('\n')) {
    const record = JSON.parse(line), { hash, ...data } = record;
    requireThat(data.seq === previous.seq + 1 && data.previous === previous.hash && digest(data) === hash, 'JOURNAL_CORRUPT');
    requireThat(['init','enrolled','reserved','finished','recovered'].includes(data.event), 'JOURNAL_EVENT');
    previous = { seq:data.seq, hash, state:data.state };
  }
  return previous;
}

export function append(directory, previous, event, state) {
  const current = readJournal(directory);
  requireThat(current.hash === previous.hash && current.seq === previous.seq, 'JOURNAL_CHANGED');
  const data = { seq:previous.seq + 1, previous:previous.hash, event, state };
  const fd = openSync(join(directory, 'journal.jsonl'), 'a', 0o600);
  try { writeSync(fd, JSON.stringify({ ...data, hash:digest(data) }) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  return readJournal(directory);
}

export function lock(directory, recover = false) {
  // Every acquisition uses this guard: no controller can replace a stale lock
  // between its owner check and unlink. Never automatically recover the guard;
  // a crash here must block acquisition until the owner stops all contenders.
  const guard = join(directory, 'controller-acquire.lock');
  const guardFd = openSync(guard, 'wx', 0o600);
  closeSync(guardFd);
  const path = join(directory, 'controller.lock');
  try {
    if (recover) clearDeadLock(directory);
    const fd = openSync(path, 'wx', 0o600);
    try { writeSync(fd, String(process.pid)); fsyncSync(fd); } finally { closeSync(fd); }
    return () => unlinkSync(path);
  } finally { unlinkSync(guard); }
}

export function bindRepository(directory, c, initialize = false) {
  const path = join(directory, 'supervised-controller.json');
  const binding = { project:c.project, repo:c.repo, stateDirectory:c.stateDirectory };
  if (initialize) {
    // A permanent binding prevents a second config/state directory resetting the same repo's budget.
    const fd = openSync(path,'wx',0o600);
    try { writeSync(fd,JSON.stringify(binding)); fsyncSync(fd); } finally { closeSync(fd); }
  } else {
    requireThat(JSON.stringify(JSON.parse(readFileSync(path,'utf8'))) === JSON.stringify(binding), 'REPOSITORY_BINDING');
  }
}

// Recovery does not guess whether a child survived. The owner must inspect/stop it first.
export function removeDeadLock(directory) {
  // Return the newly acquired repository lock's release function, never an
  // unprotected gap between recovery and acquisition.
  return lock(directory, true);
}

function clearDeadLock(directory) {
  const path = join(directory, 'controller.lock');
  if (!existsSync(path)) return;
  const pid = Number(readFileSync(path, 'utf8'));
  requireThat(Number.isSafeInteger(pid) && pid > 0, 'LOCK_CORRUPT');
  try { process.kill(pid, 0); throw new Error('CONTROLLER_STILL_RUNNING'); }
  catch (error) { requireThat(error.code === 'ESRCH', 'LOCK_OWNER_LIVE_OR_UNKNOWN'); }
  unlinkSync(path);
}
