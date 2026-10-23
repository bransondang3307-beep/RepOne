// EXP-001 — Auto-fix experiment. DO NOT MERGE.
// A tiny stand-alone helper exercised only by its own tests (batches.test.mjs). Nothing in apps/ or packages/
// imports it, and it is not part of the app.

/**
 * Splits `items` into consecutive batches of at most `size` items, keeping their order.
 * Every item ends up in exactly one batch; only the last batch may be shorter than `size`.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {number} size  a positive integer
 * @returns {T[][]}
 * @throws {RangeError} if `size` is not a positive integer
 */
export function splitIntoBatches(items, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size must be a positive integer, got ${size}`);
  }
  const batches = [];
  for (let start = 0; start + size <= items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}
