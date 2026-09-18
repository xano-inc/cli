/* eslint-disable unicorn/filename-case -- CLAUDE.md requires underscore filenames. */
/** Keep backend implementation details out of ordinary command errors. */
function withoutStack(text: string): string {
  return text.split(/\n\s*(?:Stack trace:|#\d+\s|at\s|file:\s*\/)/i, 1)[0]
}

export function foldApiError(text: string, status: number, requestUrl: string): string {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text.trim() || '{}')
  } catch {
    return withoutStack(text)
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) return withoutStack(text)
  const url = new URL(requestUrl)
  const workspace = url.pathname.match(/\/workspace\/([^/]+)/)?.[1]
  const branch = url.searchParams.get('branch')
  let message = typeof data.message === 'string' ? withoutStack(data.message) : ''
  if (status === 404 && !message.trim() && workspace && branch) {
    message = `Branch "${branch}" was not found in workspace ${decodeURIComponent(workspace)}.`
  }

  const payload = data.payload && typeof data.payload === 'object'
    ? Object.fromEntries(Object.entries(data.payload).filter(([key, value]) =>
      ['col', 'error_line', 'error_snippet', 'line', 'snippet'].includes(key) &&
      (typeof value === 'string' || typeof value === 'number')))
    : undefined
  return JSON.stringify({code: data.code, message, ...(payload && Object.keys(payload).length > 0 ? {payload} : {})})
}

/** A 1-based `line N` the platform already put in its own sentence. */
const OWN_LINE = /\bline\s+\d+/i

/**
 * Where a parse error is, the way a person counts: the first line is line 1.
 *
 * The platform's payload counts `line` and `col` from 0, so printing it raw named the line ABOVE the
 * real one (the MCP server already renumbers; the two now agree). When the platform's own sentence
 * says `line N` it is already 1-based, and a second number for the same place would only contradict
 * it, so only the offending text is shown. The folded JSON itself is never renumbered.
 */
function positionLine(message: string, payload: Record<string, unknown>): string {
  const text = [payload.error_line, payload.error_snippet, payload.snippet].find(value => typeof value === 'string' && value.trim() !== '') as string | undefined
  const located = typeof payload.line === 'number' && Number.isFinite(payload.line) && !OWN_LINE.test(message)
  const where = located
    ? `line ${(payload.line as number) + 1}${typeof payload.col === 'number' && Number.isFinite(payload.col) ? `, col ${payload.col + 1}` : ''}`
    : ''
  if (!where && text === undefined) return ''
  return `\n  ${where ? `at ${where}` : 'at'}${text === undefined ? '' : `: ${text}`}`
}

/**
 * Render the folded error consistently where commands extract a message.
 *
 * `rawPayload` keeps the platform's payload verbatim (0-based, as JSON) for `-o json` callers that
 * parse it; the default is the human rendering with a 1-based position.
 */
export function formatApiError(text: string, options: {rawPayload?: boolean} = {}): string {
  try {
    const data = JSON.parse(text)
    const message = [data.code, data.message].filter(Boolean).join(': ')
    if (!data.payload || typeof data.payload !== 'object') return message || text
    const detail = options.rawPayload
      ? `\n  payload: ${JSON.stringify(data.payload)}`
      : positionLine(typeof data.message === 'string' ? data.message : '', data.payload)
    return `${message}${detail}` || text
  } catch {
    return text
  }
}
