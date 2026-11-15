/**
 * Helpers for `xano table audit`: the audit-trail route's shapes, its query string, the CSV
 * rendering of its events, and the plan refusal a push or an API call can carry.
 *
 * The route is `GET /api:meta/workspace/{workspace_id}/table/{table_id}/audit` (MCP tool
 * `getTableAuditTrail`). It pages newest first with a cursor: `next` is the id to pass as `before`
 * for the page after, and is null on the last page.
 */

/** The `op` values the route accepts. */
export const AUDIT_OPS = ['insert', 'update', 'delete', 'truncate', 'system'] as const

/** The route's largest page. */
export const AUDIT_MAX_LIMIT = 100

/** The route's default page. */
export const AUDIT_DEFAULT_LIMIT = 50

/** One recorded event, as the route returns it. */
export interface AuditEvent {
  app_name?: null | string
  changed?: null | string[]
  client_addr?: null | string
  /** Who made the change, as Xano stamped it (source, user, endpoint, ...). */
  context?: unknown
  /** Milliseconds since the epoch. */
  created_at?: number
  db_user?: null | string
  id: number
  new?: unknown
  old?: unknown
  op?: string
  record_id?: null | string
  tx_id?: number
}

/** One page of the route. */
export interface AuditTrailPage {
  [key: string]: unknown
  /** Whether the plan lets a table start being audited. Absent on an older instance. */
  available?: boolean
  /** Whether auditing is on for this table. */
  enabled?: boolean
  items: AuditEvent[]
  /** The table's read-only audit log table, or null. */
  log_table?: unknown
  /** The `before` cursor of the next page; null or absent on the last page. */
  next?: null | number
}

export interface AuditQuery {
  before?: number
  limit?: number
  op?: string
  record?: string
}

/** The route's query string. Only the filters that were given are sent. */
export function buildAuditQuery(query: AuditQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.record !== undefined && query.record !== '') params.set('record_id', query.record)
  if (query.op) params.set('op', query.op)
  if (query.before !== undefined) params.set('before', String(query.before))
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  return params
}

/** The route's response, normalized: a missing items list is an empty one, a missing next is null. */
export function normalizeAuditPage(data: unknown): AuditTrailPage {
  const record = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const items = Array.isArray(record.items) ? (record.items as AuditEvent[]) : []
  const next = typeof record.next === 'number' ? record.next : null
  return {...record, items, next}
}

/** The CSV columns, in order. Stable: scripts and auditors key on them. */
export const AUDIT_CSV_COLUMNS = [
  'id',
  'created_at',
  'tx_id',
  'op',
  'record_id',
  'changed',
  'old',
  'new',
  'context',
  'db_user',
  'app_name',
  'client_addr',
] as const

/** One CSV field (RFC 4180): quoted when it holds a comma, a quote or a line break. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvValue(event: AuditEvent, column: (typeof AUDIT_CSV_COLUMNS)[number]): unknown {
  if (column === 'created_at') {
    // milliseconds since the epoch, written as ISO 8601 UTC (lossless: it keeps the milliseconds)
    return typeof event.created_at === 'number' ? new Date(event.created_at).toISOString() : event.created_at
  }

  return event[column]
}

/**
 * Events as CSV: a header row, then one row per event. old, new, changed and context are JSON
 * strings. Values are written as recorded, without spreadsheet-formula escaping, so the export
 * stays a faithful copy of the trail.
 */
export function auditEventsToCsv(events: AuditEvent[]): string {
  const rows = [AUDIT_CSV_COLUMNS.join(',')]
  for (const event of events) {
    rows.push(AUDIT_CSV_COLUMNS.map((column) => csvField(csvValue(event, column))).join(','))
  }

  return `${rows.join('\n')}\n`
}

/** The refusal's `payload.code` when a plan does not include Content Record Audit. */
export const AUDIT_PLAN_REQUIRED_CODE = 'audit_plan_required'

export const AUDIT_PLAN_REQUIRED_MESSAGE =
  'Content Record Audit is not included in this plan. Upgrade to Pro or above to audit a table.'

/**
 * The plan message when an API error body is the "turning on table audit needs a higher plan"
 * refusal (a 403 with `payload.code` `audit_plan_required`), else undefined.
 */
export function auditPlanRequiredMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const {payload} = body as {payload?: unknown}
  if (!payload || typeof payload !== 'object') return undefined
  return (payload as {code?: unknown}).code === AUDIT_PLAN_REQUIRED_CODE ? AUDIT_PLAN_REQUIRED_MESSAGE : undefined
}
