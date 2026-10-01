/** Keep backend implementation details out of ordinary command errors. */
function withoutStack(text: string): string {
  return text.split(/\n\s*(?:Stack trace:|#\d+\s|at\s|file:\s*\/)/i, 1)[0]
}

/** Where a parse error is: the payload's 1-based `line` and `col`, printed as served, and the offending text. */
function positionLine(payload: Record<string, unknown>): string {
  const text = [payload.error_line, payload.error_snippet, payload.snippet]
    .find(value => typeof value === 'string' && value.trim() !== '') as string | undefined
  const where = typeof payload.line === 'number' && Number.isFinite(payload.line)
    ? `line ${payload.line}${typeof payload.col === 'number' && Number.isFinite(payload.col) ? `, col ${payload.col}` : ''}`
    : ''
  if (!where && text === undefined) return ''
  return `\n  ${where ? `at ${where}` : 'at'}${text === undefined ? '' : `: ${text}`}`
}

/** An empty 404 from a branch-scoped request means the branch it named does not exist. */
function missingBranch(requestUrl: string): string {
  const url = new URL(requestUrl)
  const workspace = url.pathname.match(/\/workspace\/([^/]+)/)?.[1]
  const branch = url.searchParams.get('branch')
  return workspace && branch ? `Branch "${branch}" was not found in workspace ${decodeURIComponent(workspace)}.` : ''
}

/**
 * What to do about a refusal of the request itself, keyed on the platform's `payload.code`:
 *
 *   policy_unknown_check   a rule names a check id this instance does not have
 *   policy_stale           the policy changed after the command read it
 *
 * Permission refusals are explained by `policyPermissionGuidance`.
 */
const CODE_GUIDANCE: Record<string, string> = {
  policy_stale: '\nThe policy changed after this command read it, so nothing was changed. Run the command again to act on its current version.',
  policy_unknown_check: '\nRun `xano policy catalogue` to list every check id this instance has.',
}

/** Guidance appended to a refusal whose `payload.code` the CLI has advice for, or `''`. */
export function policyCodeGuidance(payload: unknown): string {
  const code = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as {code?: unknown}).code : undefined
  return typeof code === 'string' && Object.hasOwn(CODE_GUIDANCE, code) ? CODE_GUIDANCE[code] : ''
}

/** A failed policy-route response: one message to print, and the refusal's payload. */
export interface PolicyError {
  message: string
  payload?: unknown
}

/**
 * A failed policy-route response as one message: the platform's code and message, and where a parse
 * error is. Traces are dropped, and an empty 404 names the branch the request selected.
 */
export function describePolicyError(text: string, status: number, requestUrl: string): PolicyError {
  let data: unknown
  try {
    data = JSON.parse(text.trim() || '{}')
  } catch {
    return {message: withoutStack(text)}
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) return {message: withoutStack(text)}
  const {code, message: raw, payload} = data as {code?: unknown; message?: unknown; payload?: unknown}
  let message = typeof raw === 'string' ? withoutStack(raw) : ''
  if (status === 404 && !message.trim()) message = missingBranch(requestUrl)
  const headline = [typeof code === 'string' ? code : '', message].filter(Boolean).join(': ')
  const position = payload && typeof payload === 'object' ? positionLine(payload as Record<string, unknown>) : ''
  return {message: `${headline}${position}` || 'The server returned no message.', payload}
}
