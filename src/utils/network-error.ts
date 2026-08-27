/**
 * Turn a thrown fetch/network error into an actionable message.
 *
 * Node's native fetch throws a TypeError with the unhelpful message "fetch
 * failed" for all transport-level failures (DNS, connection refused, TLS,
 * resets, timeouts). The real reason lives in `error.cause` as a system error
 * with a `code` (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, etc.). This unwraps it so
 * the user sees what actually went wrong and where.
 *
 * `elapsedMs` is appended so the user can see how long the request ran before
 * failing — a failure landing near a round boundary (e.g. ~300s) is a strong
 * signal of a server-side or proxy timeout rather than a local network blip.
 */
export function describeNetworkError(error: unknown, url: string, elapsedMs?: number): string {
  if (!(error instanceof Error)) return String(error)

  let host = url
  try {
    host = new URL(url).host
  } catch {}

  // AbortSignal.timeout() fires our explicit request-timeout ceiling.
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return `request to ${host} exceeded the CLI timeout. Raise it with XANO_CLI_REQUEST_TIMEOUT_MS (ms; 0 disables), or split the push into smaller batches.${formatFailureDuration(elapsedMs)}`
  }

  const {cause} = error as {cause?: unknown}
  const code =
    cause && typeof cause === 'object' && 'code' in cause ? String((cause as {code: unknown}).code) : undefined
  const causeMessage = cause instanceof Error ? cause.message : undefined

  const hints: Record<string, string> = {
    ECONNREFUSED: `Connection refused by ${host}. The instance may be down or starting up.`,
    ECONNRESET: `Connection to ${host} was reset. The request may have been too large or the server restarted mid-push.`,
    ENOTFOUND: `Could not resolve host "${host}". Check the instance origin and your network/DNS.`,
    ETIMEDOUT: `Connection to ${host} timed out. Check your network or VPN, then retry.`,
    UND_ERR_CONNECT_TIMEOUT: `Connection to ${host} timed out. Check your network or VPN, then retry.`,
    UND_ERR_HEADERS_TIMEOUT: `${host} accepted the connection but did not respond in time. The push may be too large; try splitting it or retrying.`,
    UND_ERR_INVALID_ARG: `${host} rejected the request configuration on this Node version. This is a CLI/Node compatibility issue — please report it.`,
  }

  let base: string
  if (code && hints[code]) {
    base = `${hints[code]} (${code})`
  } else if (code?.startsWith('ERR_TLS') || code?.startsWith('CERT_') || /certificate|tls|ssl/i.test(error.message)) {
    // TLS/cert failures surface their reason on the cause message.
    base = `TLS/certificate error connecting to ${host}: ${causeMessage ?? error.message}`
  } else if (error.message === 'fetch failed') {
    // "fetch failed" with no recognized code — surface the underlying cause if any.
    base = causeMessage
      ? `network error connecting to ${host}: ${causeMessage}${code ? ` (${code})` : ''}`
      : `network error connecting to ${host}${code ? ` (${code})` : ''}. Run with --verbose for more detail.`
  } else {
    base = error.message
  }

  return base + formatFailureDuration(elapsedMs)
}

/**
 * Render how long the request ran before failing, e.g. " (after 5m 0s)".
 * Flags durations sitting near a common timeout boundary (30/60/120/300/600s),
 * which usually points at a server-side or proxy/load-balancer timeout rather
 * than a local network problem.
 */
function formatFailureDuration(elapsedMs?: number): string {
  if (elapsedMs === undefined || elapsedMs < 0) return ''

  const totalSeconds = elapsedMs / 1000
  const human =
    totalSeconds < 60
      ? `${totalSeconds.toFixed(1)}s`
      : `${Math.floor(totalSeconds / 60)}m ${Math.round(totalSeconds % 60)}s`

  // Within 5% of a common timeout boundary → likely a hard cutoff, not a blip.
  const boundaries = [30, 60, 120, 300, 600]
  const nearTimeout = boundaries.some((b) => Math.abs(totalSeconds - b) <= b * 0.05)

  return nearTimeout
    ? ` (failed after ~${human}, near a common ${boundaries.find((b) => Math.abs(totalSeconds - b) <= b * 0.05)}s timeout — likely a server or proxy cutoff)`
    : ` (failed after ${human})`
}
