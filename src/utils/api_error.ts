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

/** Render the folded error consistently where commands extract a message. */
export function formatApiError(text: string): string {
  try {
    const data = JSON.parse(text)
    const message = [data.code, data.message].filter(Boolean).join(': ')
    return `${message}${data.payload ? `\n  payload: ${JSON.stringify(data.payload)}` : ''}` || text
  } catch {
    return text
  }
}
