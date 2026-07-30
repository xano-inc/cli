/**
 * Run `worker` over `items` with at most `limit` in flight at once.
 *
 * Results come back in **input order**, not completion order. That matters for
 * test runners: a concurrent run must still produce output a human can diff
 * against a sequential one, and a JSON results array whose order does not shift
 * between runs.
 *
 * `limit` is clamped to at least 1, so a limit of 1 is exactly sequential
 * execution and callers do not need a separate code path for it.
 *
 * The worker is expected to capture its own failures — one rejected worker
 * rejects the whole call. Callers that want per-item error reporting (as the
 * test runners do) should resolve a failure result instead of throwing.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const effectiveLimit = Math.max(1, Math.floor(limit))
  const results: R[] = Array.from({length: items.length})
  let cursor = 0

  const runners = Array.from({length: Math.min(effectiveLimit, items.length)}, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor++
      // eslint-disable-next-line no-await-in-loop
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

/**
 * Emit results in input order as soon as each becomes available, without
 * waiting for the whole batch.
 *
 * Progress lines are the reason this exists: with concurrency the third test may
 * finish before the first, but printing them out of order makes the output hard
 * to follow and non-deterministic between runs. This buffers out-of-order
 * completions and flushes the moment the next expected index arrives, so the
 * user sees an ordered stream that still starts before the run ends.
 */
export function createOrderedEmitter<R>(onReady: (result: R, index: number) => void): {
  settle(index: number, result: R): void
} {
  const pending = new Map<number, R>()
  let next = 0

  return {
    settle(index: number, result: R): void {
      pending.set(index, result)
      while (pending.has(next)) {
        onReady(pending.get(next) as R, next)
        pending.delete(next)
        next++
      }
    },
  }
}
