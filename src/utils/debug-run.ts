import {parseDocument} from './document-parser.js'

/**
 * Pure helpers for `xano debug run` / `xano debug get`.
 *
 * A debug run POSTs a locally-assembled multidoc to the meta API, which
 * executes one named object in an isolated throwaway schema and returns a
 * compact envelope `{debug_id, status, timing, result | exception}`. The full
 * per-statement stack is persisted server-side under `debug_id` and fetched
 * later with `xano debug get`.
 *
 * Everything here is free of oclif/network/filesystem deps so it is
 * unit-testable in isolation; the command layer handles fetching and output.
 */

/** Entry object types the debug endpoint can execute. */
export const DEBUG_ENTRY_TYPES = [
  'action',
  'addon',
  'function',
  'middleware',
  'query',
  'task',
  'tool',
  'trigger',
  'workflow_test',
] as const

/** Compact envelope returned by POST multidoc/debug. */
export interface DebugRunEnvelope {
  [key: string]: unknown
  debug_id?: null | string
  exception?: unknown
  result?: unknown
  status?: string
  timing?: unknown
  warning?: string
}

/** Full stored payload returned by GET multidoc/debug/{debug_id}. */
export interface DebugResultPayload {
  [key: string]: unknown
  created_at?: string
  debug_id?: string
  entry_obj_name?: string
  entry_obj_type?: string
  entry_obj_verb?: string
  exception?: unknown
  expires_at?: string
  id?: string
  maxed?: boolean
  stack?: unknown[]
  status?: string
  timing?: unknown
  truncated?: boolean
  value_store?: Record<string, unknown>
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when `value` looks like a canonical 8-4-4-4-12 uuid. */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

export interface DebugQueryParams {
  branch?: string
  bypassSizeLimit?: boolean
  debugId?: string
  entryObjName: string
  entryObjType: string
  entryObjVerb?: string
  input?: Record<string, unknown>
}

/**
 * Build the query string for POST multidoc/debug. Empty optionals are omitted
 * entirely (the endpoint treats absence as "not supplied"); `input` is
 * JSON-encoded and only sent when it has at least one key.
 */
export function buildDebugQuery(params: DebugQueryParams): URLSearchParams {
  const query = new URLSearchParams()
  query.set('entry_obj_type', params.entryObjType)
  query.set('entry_obj_name', params.entryObjName)
  if (params.entryObjVerb) query.set('entry_obj_verb', params.entryObjVerb)
  if (params.input && Object.keys(params.input).length > 0) query.set('input', JSON.stringify(params.input))
  if (params.debugId) query.set('debug_id', params.debugId)
  if (params.bypassSizeLimit) query.set('bypass_size_limit', 'true')
  if (params.branch) query.set('branch', params.branch)
  return query
}

// ── Local multidoc helpers ──────────────────────────────────────────────────

export interface DocumentEntry {
  content: string
  filePath: string
}

/**
 * Detect whether a document carries workspace environment variables.
 *
 * Env vars are not a standalone document type: `workspace pull --env` folds
 * them into the workspace-settings document as an `env = { ... }` block. The
 * debug workspace is built solely from the multidoc, so `$env` reads return
 * nothing unless such a document is included.
 */
export function isEnvDocument(content: string): boolean {
  const parsed = parseDocument(content)
  if (!parsed || parsed.type !== 'workspace') return false
  return /^\s*env\s*=\s*\{/m.test(content)
}

/** Split document entries into env-bearing workspace docs and the rest. */
export function partitionEnvDocs(entries: DocumentEntry[]): {envEntries: DocumentEntry[]; rest: DocumentEntry[]} {
  const envEntries: DocumentEntry[] = []
  const rest: DocumentEntry[] = []
  for (const entry of entries) {
    if (isEnvDocument(entry.content)) {
      envEntries.push(entry)
    } else {
      rest.push(entry)
    }
  }

  return {envEntries, rest}
}

export interface EntryMatchResult {
  found: boolean
  /** Human-readable near-miss hints (same name with another verb, similar names, ...). */
  suggestions: string[]
}

/**
 * Pre-flight check: does the collected multidoc contain a document matching
 * the requested entry object? Matching mirrors the server's lookup keys
 * (`type:name[:verb]`): exact type + name, and — when a verb is supplied —
 * a case-insensitive verb match. Local trigger docs are authored with
 * specific subtypes (workspace_trigger, table_trigger, ...) but the server
 * buckets them under the generic `trigger` type, so `--type trigger` matches
 * any `*_trigger` document (same rule as push previews, DEV-7084).
 *
 * A miss is advisory only — the caller warns and still sends the request,
 * since the server is the source of truth.
 */
export function findEntryInDocs(entries: DocumentEntry[], type: string, name: string, verb?: string): EntryMatchResult {
  const suggestions: string[] = []
  const seen = new Set<string>()
  const suggest = (text: string): void => {
    if (!seen.has(text) && suggestions.length < 5) {
      seen.add(text)
      suggestions.push(text)
    }
  }

  const typeMatches = (docType: string): boolean =>
    docType === type || (type === 'trigger' && docType.endsWith('_trigger'))

  for (const entry of entries) {
    const parsed = parseDocument(entry.content)
    if (!parsed) continue

    if (typeMatches(parsed.type) && parsed.name === name) {
      // Verb only disambiguates when the caller supplied one.
      if (!verb || (parsed.verb ?? '').toUpperCase() === verb.toUpperCase()) {
        return {found: true, suggestions: []}
      }

      suggest(`${parsed.type} ${parsed.name}${parsed.verb ? ` verb=${parsed.verb}` : ''}`)
      continue
    }

    // Cheap closest-match hints: same type, similar name.
    if (typeMatches(parsed.type)) {
      const a = parsed.name.toLowerCase()
      const b = name.toLowerCase()
      if (a === b || a.includes(b) || b.includes(a)) {
        suggest(`${parsed.type} ${parsed.name}${parsed.verb ? ` verb=${parsed.verb}` : ''}`)
      }
    }
  }

  return {found: false, suggestions}
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Longest pretty-printed result shown inline in summary mode. */
const RESULT_PREVIEW_LIMIT = 2000

/** Format the envelope's timing value, whatever shape the server used. */
export function formatTiming(timing: unknown): string {
  if (typeof timing === 'number') return `${timing.toFixed(3)}s`
  if (typeof timing === 'string') return timing
  if (timing === null || timing === undefined) return 'unknown'
  return JSON.stringify(timing)
}

/** One-line headline for an exception value (object with message, or anything). */
export function exceptionHeadline(exception: unknown): string {
  // A status:exception envelope may arrive without a populated exception field;
  // fall back to a sensible label rather than "undefined"/"null".
  if (exception === null || exception === undefined) {
    return '(no exception details provided)'
  }

  if (typeof exception === 'object' && 'message' in exception) {
    return String((exception as {message: unknown}).message)
  }

  return typeof exception === 'string' ? exception : JSON.stringify(exception)
}

/** Render the summary-mode output lines for a debug-run envelope. */
export function renderDebugRunSummary(envelope: DebugRunEnvelope): string[] {
  const lines: string[] = []
  const status = envelope.status ?? 'unknown'
  lines.push(`Status: ${status}`, `Timing: ${formatTiming(envelope.timing)}`)

  if (envelope.debug_id) {
    lines.push(`Debug ID: ${envelope.debug_id}`)
  } else {
    lines.push('Debug ID: (not persisted — full stack unavailable)')
  }

  if (envelope.warning) {
    lines.push(`Warning: ${envelope.warning}`)
  }

  if (status === 'exception') {
    lines.push(`Exception: ${exceptionHeadline(envelope.exception)}`)
  } else {
    const pretty = JSON.stringify(envelope.result ?? null, null, 2)
    lines.push(
      'Result:',
      pretty.length > RESULT_PREVIEW_LIMIT
        ? `${pretty.slice(0, RESULT_PREVIEW_LIMIT)}\n... (truncated preview — use -o json for the full result)`
        : pretty,
    )
  }

  if (envelope.debug_id) {
    lines.push(`Fetch the full stack: xano debug get ${envelope.debug_id}`)
  }

  return lines
}

/** Render the summary-mode output lines for a stored debug payload. */
export function renderDebugGetSummary(payload: DebugResultPayload): string[] {
  const lines: string[] = []
  lines.push(`Status: ${payload.status ?? 'unknown'}`, `Timing: ${formatTiming(payload.timing)}`)

  if (payload.entry_obj_type || payload.entry_obj_name) {
    const entryParts = [payload.entry_obj_type, payload.entry_obj_name, payload.entry_obj_verb].filter(Boolean)
    lines.push(`Entry: ${entryParts.join(' ')}`)
  }

  if (Array.isArray(payload.stack)) {
    lines.push(`Statements: ${payload.stack.length}`)
  }

  if (payload.created_at) lines.push(`Created: ${payload.created_at}`)
  if (payload.expires_at) lines.push(`Expires: ${payload.expires_at}`)

  if (payload.exception !== undefined && payload.exception !== null) {
    lines.push(`Exception: ${exceptionHeadline(payload.exception)}`)
  }

  if (payload.maxed) {
    lines.push(
      'Maxed: values over the per-value size cap were replaced with {{too_large}} — re-run with --bypass-size-limit to capture them (note: bypass inflates the stored payload).',
    )
  }

  if (payload.truncated) {
    lines.push('Truncated: the stored payload exceeded the storage cap — the largest values were dropped (markers left in place).')
  }

  return lines
}
