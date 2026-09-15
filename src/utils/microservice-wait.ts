/**
 * Poll a tenant's microservice deployment status until every auto-deployed
 * microservice settles (ok/error) or a timeout elapses. Backs `ephemeral push
 * --wait`: after a multidoc push auto-deploys microservices (tenant_deploy=
 * "auto"), the CLI waits here for them to become Ready and reports the outcome.
 *
 * The backend route (GET .../tenant/{name}/microservice, statement
 * mvp:microservice_status_all) returns one entry per microservice with a live
 * k8s readiness read. `manual`/`disabled` microservices are reported but not
 * waited on (they were never deployed by the push).
 */

/** One microservice's status as returned by the tenant status route. */
export interface MicroserviceStatusEntry {
  desired?: number
  detail?: string
  microservice_id: number
  name: string
  ready?: number
  // ok | deploying | error | skipped | disabled
  status: string
  tenant_deploy?: string
}

export interface WaitOptions {
  /** Bearer token for the authed status GET. */
  accessToken: string
  /** Called once per poll with the latest entries, for progress rendering. */
  onPoll?: (entries: MicroserviceStatusEntry[], elapsedMs: number) => void
  /** Poll cadence in ms (default 2000). */
  pollIntervalMs?: number
  /** Absolute URL of the tenant microservice status route. */
  statusUrl: string
  /** Overall wait budget in ms (default 300000 = 300s). */
  timeoutMs?: number
  /** Authed fetch (command.verboseFetch bound), so TLS/dispatcher settings apply. */
  verboseFetch: (url: string, options: RequestInit, verbose: boolean, authToken?: string) => Promise<Response>
  /** Verbose request logging passthrough. */
  verbose?: boolean
}

export interface WaitResult {
  /** The final status entries observed. */
  entries: MicroserviceStatusEntry[]
  /** True if any awaited (auto) microservice ended in "error". */
  hadError: boolean
  /** True if the wait budget elapsed before all awaited microservices settled. */
  timedOut: boolean
}

/** Statuses that mean an awaited microservice has settled (no longer in flight). */
const SETTLED = new Set(['ok', 'error'])
/** Statuses that mean we don't wait on this microservice at all. */
const NOT_AWAITED = new Set(['skipped', 'disabled'])

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** An awaited microservice is one that was auto-deployed and is not skipped/disabled. */
export function isAwaited(entry: MicroserviceStatusEntry): boolean {
  return !NOT_AWAITED.has(entry.status) && (entry.tenant_deploy ?? 'auto') !== 'manual'
}

/** True once every awaited microservice has settled (ok/error). */
function allSettled(entries: MicroserviceStatusEntry[]): boolean {
  const awaited = entries.filter((e) => isAwaited(e))
  // No auto microservices at all → nothing to wait for.
  if (awaited.length === 0) return true
  return awaited.every((e) => SETTLED.has(e.status))
}

/**
 * Fetch the status route once. Throws on a non-2xx so the caller can decide
 * whether a transient failure is fatal (it isn't — we keep polling).
 */
async function fetchStatus(opts: WaitOptions): Promise<MicroserviceStatusEntry[]> {
  const res = await opts.verboseFetch(
    opts.statusUrl,
    {headers: {Authorization: `Bearer ${opts.accessToken}`}, method: 'GET'},
    opts.verbose ?? false,
    opts.accessToken,
  )
  if (!res.ok) {
    throw new Error(`status ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as unknown
  if (!Array.isArray(body)) {
    throw new Error('unexpected status response shape')
  }

  return body as MicroserviceStatusEntry[]
}

/**
 * Poll until all awaited microservices settle or the timeout elapses. Transient
 * poll failures (network blips, a brief 5xx while a pod restarts) are tolerated —
 * they don't abort the wait; only the overall timeout does.
 */
export async function waitForMicroservices(opts: WaitOptions): Promise<WaitResult> {
  const pollIntervalMs = opts.pollIntervalMs ?? 2000
  const timeoutMs = opts.timeoutMs ?? 300000
  const start = Date.now()

  let entries: MicroserviceStatusEntry[] = []
  let consecutiveErrors = 0

  // Poll loop. We always do at least one fetch so `--wait` reports even when the
  // deployment already settled between the push returning and the first poll.
  for (;;) {
    const elapsed = Date.now() - start
    try {
      entries = await fetchStatus(opts)
      consecutiveErrors = 0
      opts.onPoll?.(entries, elapsed)
      if (allSettled(entries)) {
        return {entries, hadError: entries.some((e) => isAwaited(e) && e.status === 'error'), timedOut: false}
      }
    } catch {
      // A transient status read failure is non-fatal — keep polling until the
      // overall timeout. (Mirrors the frontend poller's tolerate-with-cap.) We
      // don't surface each blip; the timeout is the real failure signal.
      consecutiveErrors++
    }

    if (Date.now() - start + pollIntervalMs > timeoutMs) {
      // Out of budget. Report whatever we last saw as timed out.
      return {
        entries,
        hadError: entries.some((e) => isAwaited(e) && e.status === 'error'),
        timedOut: true,
      }
    }

    await sleep(pollIntervalMs)
  }
}
