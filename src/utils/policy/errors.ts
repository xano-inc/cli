/** Keep backend implementation details out of ordinary command errors. */
function withoutStack(text: string): string {
  return text.split(/\n\s*(?:Stack trace:|#\d+\s|at\s|file:\s*\/)/i, 1)[0]
}

/** A 1-based `line N` the platform already put in its own sentence. */
const OWN_LINE = /\bline\s+\d+/i

/**
 * Where a parse error is. The platform's payload counts `line` and `col` from 1, as its sentence
 * does, so they are printed as served. When the sentence already says `line N`, only the offending
 * text is shown, so one place never gets two numbers.
 */
function positionLine(message: string, payload: Record<string, unknown>): string {
  const text = [payload.error_line, payload.error_snippet, payload.snippet]
    .find(value => typeof value === 'string' && value.trim() !== '') as string | undefined
  const located = typeof payload.line === 'number' && Number.isFinite(payload.line) && !OWN_LINE.test(message)
  const where = located
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
  const position = payload && typeof payload === 'object' ? positionLine(message, payload as Record<string, unknown>) : ''
  return {message: `${headline}${position}` || 'The server returned no message.', payload}
}
