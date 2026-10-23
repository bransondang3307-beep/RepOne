// EXP-001 — Auto-fix experiment. DO NOT MERGE.
// Tests for scripts/experiments/batches.mjs (node:test, zero dependencies).
// Run: `npm run test:scripts` (also part of `npm test` / `npm run verify`).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitIntoBatches } from './batches.mjs';

test('splits items into batches of the given size, in order', () => {
  assert.deepEqual(splitIntoBatches([1, 2, 3, 4, 5, 6], 2), [
    [1, 2],
    [3, 4],
    [5, 6],
  ]);
  assert.deepEqual(splitIntoBatches(['a', 'b', 'c', 'd', 'e', 'f'], 3), [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]);
});

// Codex P1 on PR #18 (5a5fa13): trailing items were dropped whenever the length was not a multiple of `size`.
test('keeps the final partial batch: every item appears exactly once', () => {
  assert.deepEqual(splitIntoBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(splitIntoBatches([1, 2, 3], 2), [[1, 2], [3]]);
  // A size larger than a non-empty input gives one short batch, not none.
  assert.deepEqual(splitIntoBatches([1, 2], 3), [[1, 2]]);
  for (let length = 0; length <= 12; length += 1) {
    const items = Array.from({ length }, (_, i) => i);
    for (let size = 1; size <= 7; size += 1) {
      const batches = splitIntoBatches(items, size);
      assert.deepEqual(batches.flat(), items, `length ${length}, size ${size}`);
      assert.ok(batches.every((batch, i) => batch.length === size || (i === batches.length - 1 && batch.length > 0)));
    }
  }
});

test('one batch when the size equals the number of items', () => {
  assert.deepEqual(splitIntoBatches([1, 2, 3], 3), [[1, 2, 3]]);
});

test('size 1 gives one batch per item', () => {
  assert.deepEqual(splitIntoBatches([7, 8, 9], 1), [[7], [8], [9]]);
});

test('no batches for no items', () => {
  assert.deepEqual(splitIntoBatches([], 4), []);
});

test('does not modify the input', () => {
  const items = Object.freeze([1, 2, 3, 4]);
  splitIntoBatches(items, 2);
  assert.deepEqual(items, [1, 2, 3, 4]);
});

test('rejects a size that is not a positive integer', () => {
  for (const size of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => splitIntoBatches([1, 2], size), RangeError, `size ${size}`);
  }
});
