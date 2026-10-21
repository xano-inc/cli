import {Command, Errors, ux} from '@oclif/core'
import {minimatch} from 'minimatch'
import * as fs from 'node:fs'
import {join, relative} from 'node:path'

import {buildDocumentKey, findFilesWithGuid, parseDocument, splitMultidoc} from './document-parser.js'
import {
  compareLocalToExport,
  indexLocalDocuments,
  parseExportDocuments,
  resolveMatchedPath,
  selectWritebacks,
} from './export-compare.js'
import {flattenBundleFile} from './flatten.js'
import {
  collectKnowledgeObjects,
  fetchKnowledge,
  type KnowledgeDryRunResult,
  knowledgePreview,
  type LocalKnowledgeObject,
  pushKnowledge,
  syncGuidToFrontmatter,
  toPushItems,
} from './knowledge-sync.js'
import {
  fetchFormattedObjects,
  type ObjectGet,
} from './object-fetch.js'
import {PushPolicyGateError} from './policy/push-gate.js'
import {type BadIndex, type BadReference, checkReferences, checkTableIndexes} from './reference-checker.js'
import {
  invalidateSandboxMarkerForOrigin,
  readMarkerToken,
  sandboxMarkerExists,
  writeMarkerToken,
} from './sandbox-marker.js'
import {
  hashBytes,
  hashFile,
  instanceHost,
  loadSyncState,
  recordEntriesForContents,
  resolveTarget,
  sandboxTargetIdentity,
  saveSyncState,
  type SyncFileEntry,
  syncStateExists,
  type SyncTargetIdentity,
  type SyncTargetState,
  toRelPath,
} from './sync-state.js'

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface PushFlags {
  delete: boolean
  'dry-run': boolean
  env: boolean
  exclude?: string[]
  fast?: boolean
  force: boolean
  guids: boolean
  include?: string[]
  records: boolean
  refresh?: boolean
  sync: boolean
  transaction: boolean
  truncate: boolean
  verbose: boolean
  writeback?: boolean
  writebackDiff?: string
  writebackObjectLimit?: number
}

export interface PushTarget {
  /** Build the dry-run URL. Return null if dry-run is not supported for this target. */
  buildDryRunUrl: (queryParams: URLSearchParams) => null | string
  /** Build the actual push URL */
  buildPushUrl: (queryParams: URLSearchParams) => string
  /** CLI version string */
  cliVersion: string
  /**
   * Guidance for a refusal this target recognises, given the HTTP status and the server's payload.
   * A preview or import refused that way stops with the message and this guidance appended.
   */
  explainRefusal?: (status: number, payload: unknown) => string | undefined
  /** Instance origin URL (e.g., "https://x123-abcd-1234.xano.io") */
  instanceOrigin: string
  /** Human-readable label for log messages (e.g., "sandbox environment", "workspace 40") */
  label: string
  /**
   * The id of the source workspace being pushed (from the active profile). Sent to the sandbox
   * so the backend can flag a mismatch when it differs from the workspace the sandbox last held.
   */
  sourceWorkspaceId?: string
  /** Does this target support branches? */
  supportsBranches: boolean
  /** Does this target support the partial query param? */
  supportsPartial: boolean
  /**
   * Warn when the sandbox currently holds a different source workspace than the one being pushed
   * (per the dry-run's `source_workspace_mismatch` flag). Used by sandbox push because the sandbox
   * is shared across workspaces and pushing onto a different one can leave stale state behind.
   */
  warnOnWorkspaceMismatch?: boolean
}

export interface KnowledgeConfig {
  /** Build the knowledge list URL (no query params). */
  listUrl: () => string
  /** Root directory containing the `knowledge/` folder. */
  rootDir: string
}

export type PushSyncTarget =
  | {instanceOrigin: string; kind: 'sandbox'; markerDir: string}
  | {instanceOrigin: string; kind: 'workspace'; workspace: string}

export interface PushContext {
  accessToken: string
  branch: string
  command: Command
  inputDir: string
  /** Optional knowledge sync config. Only workspace push sets this. */
  knowledge?: KnowledgeConfig
  /** Where progress and diagnostics go; defaults to the command's stdout. */
  log?: (message: string) => void
  /** Optional sync-record target. Workspace and sandbox push set this when they want a record. */
  syncTarget?: PushSyncTarget
  verboseFetch: (url: string, options: RequestInit, verbose: boolean, authToken?: string) => Promise<Response>
}

/** The fetch fields writeback reads. */
export interface WritebackHttpResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

interface GuidMapEntry {
  api_group?: string
  canonical?: string
  guid: string
  name: string
  type: string
  verb?: string
}

export interface DryRunSummary {
  created: number
  deleted: number
  truncated: number
  unchanged: number
  updated: number
}

export interface DryRunOperation {
  action: string
  details: string
  name: string
  reason?: string
  type: string
}

export interface DryRunResult {
  operations: DryRunOperation[]
  /** True when the sandbox currently holds a different source workspace than the one being pushed. */
  source_workspace_mismatch?: boolean
  summary: Record<string, DryRunSummary>
  workspace_name?: string
}

/** What a push did, for the calling command to report. */
export interface PushResult {
  knowledge: {deleted: number; imported: number}
  preview: DryRunResult | null
  /** The multidoc import's response body; absent when no multidoc was imported. */
  response?: Record<string, unknown>
  /** The documents the multidoc import carried. */
  sent: Array<{content: string; filePath: string}>
  /** Why the push stopped before writing anything, when it did. */
  stopped?: 'blocked' | 'cancelled' | 'dry-run' | 'no-changes'
}

/**
 * A push that failed after its multidoc import landed. The import is not rolled back, so the error
 * carries what it did for the calling command to report beside the failure.
 */
export class FailedAfterImportError extends Errors.CLIError {
  constructor(message: string, readonly imported: PushResult) {
    super(message)
  }
}

/**
 * Filter document entries down to the ones the dry-run preview reports as changed,
 * used to send only the changed documents during a partial (non-`--sync`) push.
 *
 * The preview keys each operation as `${type}:${name}` (with the verb appended for
 * API endpoints). Local documents are matched against that set.
 *
 * Triggers need special handling: they are authored with specific subtypes
 * (workspace_trigger, error_trigger, table_trigger, agent_trigger,
 * mcp_server_trigger, realtime_trigger) but the server buckets every one under the
 * generic `trigger` type in the preview. We therefore match a local trigger against
 * both its specific type and the generic `trigger` type — otherwise partial pushes
 * silently drop triggers, requiring `--sync --force` to include them (DEV-7084).
 */
export function filterChangedEntries(
  entries: Array<{content: string; filePath: string}>,
  operations: Array<{action: string; name: string; type: string}>,
  includeRecords: boolean,
): Array<{content: string; filePath: string}> {
  const changedKeys = new Set(
    operations
      .filter((op) => op.action !== 'unchanged' && op.action !== 'delete' && op.action !== 'cascade_delete')
      .map((op) => `${op.type}:${op.name}`),
  )

  return entries.filter((entry) => {
    const parsed = parseDocument(entry.content)
    if (!parsed) return true
    // Workspace settings always use a fixed key in dry-run regardless of the actual name
    if (parsed.type === 'workspace' && changedKeys.has('workspace:workspace')) return true
    const opName = parsed.verb ? `${parsed.name} ${parsed.verb}` : parsed.name
    if (changedKeys.has(`${parsed.type}:${opName}`)) return true
    // The dry-run preview reports all trigger subtypes under the generic `trigger`
    // type, so match triggers against that bucket too (DEV-7084).
    if (parsed.type.endsWith('_trigger') && changedKeys.has(`trigger:${opName}`)) return true
    // Keep table documents that contain records when --records is active
    if (includeRecords && parsed.type === 'table' && /\bitems\s*=\s*\[/m.test(entry.content)) return true
    return false
  })
}

/** True for a table document carrying an `items = [...]` block (records). */
function isTableWithRecords(content: string): boolean {
  return /^table\s+/m.test(content) && /\bitems\s*=\s*\[/m.test(content)
}

// ── File Collection ─────────────────────────────────────────────────────────

/**
 * Recursively collect all .xs files from a directory, sorted for deterministic ordering.
 */
export function collectFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, {withFileTypes: true})

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.xs')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

/**
 * Apply include/exclude glob filters to a file list. Logs filter results.
 * Returns the filtered file list.
 */
/**
 * Normalize a filter pattern into one minimatch can actually match against a
 * repo-relative FILE path.
 *
 * minimatch has no notion of "this pattern names a directory", and the two
 * spellings a person reaches for first both silently match NOTHING:
 *
 *   "table/"  a trailing slash is not directory syntax; it matches nothing
 *   "table"   no slash, so `matchBase` compares it to the file's BASENAME,
 *             i.e. it asks "is this file called `table`", not "is it under
 *             `table/`"
 *
 * Silently matching nothing is the dangerous half of this: combined with
 * `--delete`, a filter that fails open pushes more than intended, and a filter
 * that succeeds deletes what it was meant to protect. So a pattern that names a
 * real directory is expanded to `<dir>/**` rather than left to match nothing.
 */
export function normalizeFilterPattern(pattern: string, inputDir: string): string {
  const trimmed = pattern.replace(/[/\\]+$/, '')
  if (trimmed === '') return pattern

  // Anything with a glob character is taken exactly as written.
  if (trimmed.includes('*') || trimmed.includes('?') || trimmed.includes('[')) {
    return trimmed === pattern ? pattern : trimmed
  }

  // A trailing slash is an unambiguous "this is a directory".
  if (trimmed !== pattern) return `${trimmed}/**`

  try {
    if (fs.statSync(join(inputDir, trimmed)).isDirectory()) return `${trimmed}/**`
  } catch {
    // Not a path in this tree - leave it alone (it may be a bare filename,
    // which matchBase handles).
  }

  return pattern
}

export function applyFilters(
  files: string[],
  inputDir: string,
  include: string[] | undefined,
  exclude: string[] | undefined,
  log: (msg: string) => void,
): string[] {
  let filtered = files
  const totalCount = files.length

  // Report each pattern's own match count. The aggregate line alone hides a dead
  // pattern among live ones: a run with three -e patterns where one is a typo
  // still prints a plausible number and says nothing about which one matched
  // nothing.
  const describe = (patterns: string[], rels: string[]): string =>
    patterns
      .map((raw) => {
        const pattern = normalizeFilterPattern(raw, inputDir)
        const hits = rels.filter((rel) => minimatch(rel, pattern, {matchBase: true})).length
        const shown = pattern === raw ? raw : `${raw} -> ${pattern}`
        return hits === 0
          ? `${ux.colorize('yellow', shown)} ${ux.colorize('yellow', '(matched 0 files)')}`
          : `${ux.colorize('cyan', shown)} ${ux.colorize('dim', `(${hits})`)}`
      })
      .join(', ')

  if (include && include.length > 0) {
    const rels = filtered.map((f) => relative(inputDir, f))
    const patterns = include.map((p) => normalizeFilterPattern(p, inputDir))

    log('')
    log(`  ${ux.colorize('dim', 'Include:')} ${describe(include, rels)}`)

    filtered = filtered.filter((f) => {
      const rel = relative(inputDir, f)
      return patterns.some((pattern) => minimatch(rel, pattern, {matchBase: true}))
    })

    log(`  ${ux.colorize('dim', 'Matched:')} ${ux.colorize('bold', String(filtered.length))} of ${totalCount} files`)
  }

  if (exclude && exclude.length > 0) {
    const beforeCount = filtered.length
    const rels = filtered.map((f) => relative(inputDir, f))
    const patterns = exclude.map((p) => normalizeFilterPattern(p, inputDir))

    log('')
    log(`  ${ux.colorize('dim', 'Exclude:')} ${describe(exclude, rels)}`)

    filtered = filtered.filter((f) => {
      const rel = relative(inputDir, f)
      return !patterns.some((pattern) => minimatch(rel, pattern, {matchBase: true}))
    })

    log(
      `  ${ux.colorize('dim', 'Kept:')}    ${ux.colorize('bold', String(filtered.length))} of ${beforeCount} files (excluded ${beforeCount - filtered.length})`,
    )
  }

  return filtered
}

/** A document the filter removed from the push, and therefore must protect. */
export interface FilteredOutDocument {
  guid?: string
  key: string
  name: string
  relPath: string
  type: string
}

/**
 * Describe the documents a --include/--exclude filter removed.
 *
 * These are the objects the user asked NOT to touch, and they are exactly the
 * ones a `--delete` sweep would remove: a filtered-out document never reaches
 * the payload, so the server reads it as deleted from the tree. Their GUIDs are
 * sent as `protect_guids` so the server spares them, and their keys are used to
 * VERIFY the server actually did. A file holding several documents (a bundle)
 * describes each of them: push leaves every one out.
 */
export function describeFilteredOut(allFiles: string[], keptFiles: string[], inputDir: string): FilteredOutDocument[] {
  const kept = new Set(keptFiles)
  const out: FilteredOutDocument[] = []

  for (const filePath of allFiles) {
    if (kept.has(filePath)) continue

    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf8').trim()
    } catch {
      continue
    }

    if (!content) continue

    for (const parsed of splitMultidoc(content)) {
      const opName = parsed.verb ? `${parsed.name} ${parsed.verb}` : parsed.name
      out.push({
        guid: parsed.guid,
        // The preview buckets every trigger subtype under the generic `trigger`
        // type, so key triggers that way to match (DEV-7084, same as
        // filterChangedEntries).
        key: `${parsed.type.endsWith('_trigger') ? 'trigger' : parsed.type}:${opName}`,
        name: opName,
        relPath: relative(inputDir, filePath),
        type: parsed.type,
      })
    }
  }

  return out
}

/**
 * Delete operations that would remove something the filter excluded.
 *
 * This is the guard's actual test, and it is deliberately performed against the
 * dry-run the SERVER returned rather than trusting that `protect_guids` was
 * honoured: an older instance ignores the parameter entirely, and a document
 * with no GUID cannot be protected at all. Either way the answer here is the
 * truth about what the push is about to do.
 */
export function deletesHittingFilteredOut(
  operations: Array<{action: string; name: string; type: string}>,
  filteredOut: FilteredOutDocument[],
): Array<{name: string; relPath: string; type: string}> {
  if (filteredOut.length === 0) return []

  const byKey = new Map(filteredOut.map((d) => [d.key, d]))
  const hits: Array<{name: string; relPath: string; type: string}> = []

  for (const op of operations) {
    if (op.action !== 'delete' && op.action !== 'cascade_delete') continue
    const match = byKey.get(`${op.type}:${op.name}`)
    if (match) {
      hits.push({name: op.name, relPath: match.relPath, type: op.type})
    }
  }

  return hits
}

/** The comma-joined GUIDs sent as `protect_guids`; documents without a GUID are left out. */
export function protectGuidsFor(filteredOut: FilteredOutDocument[]): string {
  return filteredOut
    .map((d) => d.guid)
    .filter((g): g is string => typeof g === 'string' && g.length > 0)
    .join(',')
}

/**
 * Why `protect_guids` cannot cover every filtered-out document, one line per
 * reason; empty when it can. A document that has never been pushed has no GUID
 * to declare, and past PROTECT_GUIDS_MAX_CHARS the list is not sent at all.
 * Policies are not counted: their guid is never read (parseDocument treats the
 * body as opaque) and a push never deletes a policy.
 */
export function unprotectableFilteredOut(filteredOut: FilteredOutDocument[]): string[] {
  const reasons: string[] = []
  const missingGuids = filteredOut.filter((d) => !d.guid && d.type !== 'policy').length
  if (missingGuids > 0) {
    reasons.push(`${missingGuids} filtered-out document(s) have no guid yet, so the server cannot be told to spare them.`)
  }

  if (protectGuidsFor(filteredOut).length > PROTECT_GUIDS_MAX_CHARS) {
    reasons.push('Too many filtered-out documents to declare in one request.')
  }

  return reasons
}

/** Stop a --delete push whose preview deletes something the filter excluded. */
function refuseDeletesHittingFilteredOut(
  command: Command,
  log: (msg: string) => void,
  endangered: Array<{name: string; relPath: string; type: string}>,
  filteredOut: FilteredOutDocument[],
): never {
  log('')
  log(ux.colorize('red', '--- Refusing to push ---'))
  log('')
  log(`  --delete would remove ${endangered.length} object(s) that --include/--exclude filtered out:`)
  log('')
  for (const hit of endangered.slice(0, 10)) {
    log(`  ${ux.colorize('red', 'DELETE'.padEnd(8))} ${hit.type.padEnd(18)} ${hit.name}  ${ux.colorize('dim', `(${hit.relPath})`)}`)
  }

  if (endangered.length > 10) {
    log(ux.colorize('dim', `  ... and ${endangered.length - 10} more`))
  }

  log('')
  for (const reason of unprotectableFilteredOut(filteredOut)) {
    log(ux.colorize('dim', `  ${reason}`))
  }

  log(ux.colorize('dim', '  This instance may also predate protected pushes.'))
  log('')
  command.error('Re-run without --delete, or without the --include/--exclude filter.')
}

/**
 * The --include/--exclude delete guard for a --force push, which shows no
 * preview. --force skips the confirmation, never this check: refuse before any
 * write when `protect_guids` cannot cover the filtered-out documents, otherwise
 * read the server's preview and refuse if it still deletes one of them (an
 * instance that ignores `protect_guids`). With nobody there to confirm, a
 * preview that cannot be read refuses too.
 */
async function verifyFilteredOutSpared(args: {
  accessToken: string
  command: Command
  dryRunUrl: null | string
  filteredOut: FilteredOutDocument[]
  init: RequestInit
  log: (msg: string) => void
  target: PushTarget
  verbose: boolean
  verboseFetch: PushContext['verboseFetch']
}): Promise<void> {
  const {accessToken, command, dryRunUrl, filteredOut, init, log, target, verbose, verboseFetch} = args
  const remedy = 'Re-run without --delete, or without the --include/--exclude filter.'

  const reasons = unprotectableFilteredOut(filteredOut)
  if (reasons.length > 0) {
    log('')
    log(ux.colorize('red', '--- Refusing to push ---'))
    log('')
    log('  --delete could remove objects that --include/--exclude filtered out, and --force does not skip this check.')
    log('')
    command.error(`${reasons.join(' ')} ${remedy}`)
  }

  function unverified(why: string): never {
    return command.error(`${why}, so --delete cannot be shown to spare what --include/--exclude filtered out. ${remedy}`)
  }

  if (!dryRunUrl) unverified('This target has no push preview')

  log(ux.colorize('dim', 'Checking the push preview: --delete must spare what --include/--exclude filtered out.'))

  let response: Response
  let text: string
  try {
    response = await verboseFetch(dryRunUrl, init, verbose, accessToken)
    text = await response.text()
  } catch (error) {
    unverified(`The push preview failed (${(error as Error).message})`)
  }

  if (!response.ok) {
    refuseIfExplained(command, target, response.status, text)
    unverified(`The push preview failed (${response.status})${previewFailureReason(text)}`)
  }

  let operations: unknown
  try {
    operations = (JSON.parse(text) as null | Partial<DryRunResult>)?.operations
  } catch {
    // Not JSON
  }

  if (!Array.isArray(operations)) unverified('This instance returned no push preview')

  const endangered = deletesHittingFilteredOut(operations as DryRunResult['operations'], filteredOut)
  if (endangered.length > 0) refuseDeletesHittingFilteredOut(command, log, endangered, filteredOut)
}

export function pathMatchesFilters(
  relPath: string,
  inputDir: string,
  include: string[] | undefined,
  exclude: string[] | undefined,
): boolean {
  if (include && include.length > 0) {
    const patterns = include.map((pattern) => normalizeFilterPattern(pattern, inputDir))
    if (!patterns.some((pattern) => minimatch(relPath, pattern, {matchBase: true}))) {
      return false
    }
  }

  if (exclude && exclude.length > 0) {
    const patterns = exclude.map((pattern) => normalizeFilterPattern(pattern, inputDir))
    if (patterns.some((pattern) => minimatch(relPath, pattern, {matchBase: true}))) {
      return false
    }
  }

  return true
}

function commitSyncRecordWithSandbox(
  ctx: PushContext,
  inputDir: string,
  target: null | SyncTargetIdentity,
  entries: Record<string, SyncFileEntry>,
  options: {pruneMissing?: boolean; replace?: boolean},
  warn: (message: string) => void,
): void {
  if (!target) {
    warn('Skipped writing sync record; could not resolve sandbox/workspace identity')
    return
  }

  let sandboxToken: string | undefined
  if (ctx.syncTarget?.kind === 'sandbox') {
    try {
      sandboxToken = writeMarkerToken(ctx.syncTarget.markerDir, target.instance_host, target.branch_created_at)
    } catch (error) {
      warn(`Skipped writing sandbox sync marker: ${(error as Error).message}`)
    }
  }

  trySaveSyncState(inputDir, target, entries, {...options, sandboxToken}, warn)
}

function trySaveSyncState(
  inputDir: string,
  target: SyncTargetIdentity,
  entries: Record<string, SyncFileEntry>,
  options: {pruneMissing?: boolean; replace?: boolean; sandboxToken?: string},
  warn: (message: string) => void,
): void {
  try {
    saveSyncState(inputDir, target, entries, options)
  } catch (error) {
    warn(`Skipped writing .xano/sync_state.json: ${(error as Error).message}`)
  }
}

async function resolveSyncTarget(
  ctx: PushContext,
  flags: PushFlags,
): Promise<{isLiveBranch: boolean; liveBranch: string; target: null | SyncTargetIdentity}> {
  if (!ctx.syncTarget) {
    return {isLiveBranch: !ctx.branch, liveBranch: ctx.branch, target: null}
  }

  const origin = ctx.syncTarget.instanceOrigin.replace(/\/$/, '')
  const fetchJson = async (pathname: string): Promise<unknown> => {
    const response = await ctx.verboseFetch(
      `${origin}/api:meta${pathname}`,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${ctx.accessToken}`,
        },
        method: 'GET',
      },
      flags.verbose,
      ctx.accessToken,
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return response.json()
  }

  if (ctx.syncTarget.kind === 'sandbox') {
    try {
      const me = await fetchJson('/sandbox/me')
      if (
        !me ||
        typeof me !== 'object' ||
        Array.isArray(me) ||
        typeof (me as {created_at?: unknown}).created_at !== 'string' ||
        typeof (me as {id?: unknown}).id !== 'number'
      ) {
        return {isLiveBranch: true, liveBranch: '', target: null}
      }

      return {
        isLiveBranch: true,
        liveBranch: '',
        target: sandboxTargetIdentity(instanceHost(ctx.syncTarget.instanceOrigin), {
          created_at: (me as {created_at: string}).created_at,
          id: (me as {id: number}).id,
        }),
      }
    } catch {
      return {isLiveBranch: true, liveBranch: '', target: null}
    }
  }

  const target = await resolveTarget(ctx.syncTarget.instanceOrigin, ctx.syncTarget.workspace, ctx.branch, fetchJson)
  return {
    isLiveBranch: Boolean(target && target.branch === target.live_branch),
    liveBranch: target?.live_branch ?? ctx.branch,
    target,
  }
}

function maybeInvalidateSandboxMarker(ctx: PushContext, persistRecord: boolean, warn: (message: string) => void): void {
  if (ctx.syncTarget?.kind !== 'sandbox') return
  if (!persistRecord && !sandboxMarkerExists(ctx.syncTarget.markerDir)) return
  try {
    invalidateSandboxMarkerForOrigin(ctx.syncTarget.markerDir, ctx.syncTarget.instanceOrigin)
  } catch (error) {
    warn(`Skipped invalidating sandbox sync marker: ${(error as Error).message}`)
  }
}

/**
 * Read .xs files into document entries, skipping empty files. When `raw` is given, the
 * untrimmed bytes of each returned file are stored in it, keyed by file path.
 */
export function readDocuments(
  files: string[],
  raw?: Map<string, string>,
): Array<{content: string; filePath: string}> {
  const entries: Array<{content: string; filePath: string}> = []
  for (const filePath of files) {
    const bytes = fs.readFileSync(filePath, 'utf8')
    const content = bytes.trim()
    if (content) {
      entries.push({content, filePath})
      raw?.set(filePath, bytes)
    }
  }

  return entries
}

/**
 * A `.xs` document separator: a line that is exactly `---`. The whole push
 * pipeline (partial-diff filtering, the document→file map, and GUID writeback)
 * assumes ONE document per file — it only ever parses the first document in a
 * file and rewrites the first `guid =` line. A multi-document file therefore
 * silently drops on a partial push and corrupts GUIDs on a full one, so it is
 * refused up front (with a pointer to `xano flatten`).
 */
const DOC_SEPARATOR = /^---$/m

/**
 * Return the entries whose file holds more than one document (a `---`
 * separator). Used to refuse multi-doc files before the push pipeline's
 * single-doc-per-file assumptions can drop or corrupt them.
 */
export function findMultiDocEntries(
  entries: Array<{content: string; filePath: string}>,
): Array<{count: number; filePath: string}> {
  const offenders: Array<{count: number; filePath: string}> = []
  for (const entry of entries) {
    if (DOC_SEPARATOR.test(entry.content)) {
      // Count documents = separators + 1 (trailing/empty fragments don't change the "multi" verdict).
      const count = entry.content.split('\n').filter((l) => l.trim() === '---').length + 1
      offenders.push({count, filePath: entry.filePath})
    }
  }

  return offenders
}

/**
 * Return every `workspace` document in the push set, with the name it declares.
 *
 * A tree must carry at most ONE. The server applies the first workspace
 * document it encounters to the workspace being pushed into and silently
 * discards the rest, with no check that the document actually describes that
 * workspace — so a second one renames the destination to a foreign name while
 * leaving its content untouched, and which name wins flips with the contents of
 * the pushed set.
 *
 * Trees accumulate a second one easily, because `pull` names the file after the
 * workspace's own name (`workspace/{name}.xs`): pulling a different workspace
 * into the same directory ADDS a file rather than overwriting, and renaming a
 * workspace leaves the old-name file behind.
 */
export function findWorkspaceEntries(
  entries: Array<{content: string; filePath: string}>,
): Array<{filePath: string; name: string}> {
  const found: Array<{filePath: string; name: string}> = []
  for (const entry of entries) {
    const parsed = parseDocument(entry.content)
    // Exact match: `workspace_trigger` is a different document type that also
    // lives under workspace/ and must not be counted here.
    if (parsed && parsed.type === 'workspace') {
      found.push({filePath: entry.filePath, name: parsed.name})
    }
  }

  return found
}

// ── Validation Rendering ────────────────────────────────────────────────────

export function renderBadReferences(badRefs: BadReference[], log: (msg: string) => void): void {
  log(ux.colorize('yellow', ux.colorize('bold', '=== Unresolved References ===')))
  log('')
  log(
    ux.colorize('yellow', "The following references point to objects that don't exist in this push or on the server."),
  )
  log(ux.colorize('yellow', 'These will become placeholder statements after import.'))
  log('')

  for (const ref of badRefs) {
    log(`  ${ux.colorize('yellow', 'WARNING'.padEnd(16))} ${ref.sourceType.padEnd(18)} ${ref.source}`)
    log(
      `  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', `${ref.statementType} → ${ref.targetType} "${ref.target}" does not exist`)}`,
    )
  }

  log('')
}

export function renderBadIndexes(badIndexes: BadIndex[], log: (msg: string) => void): void {
  log('')
  log(ux.colorize('red', ux.colorize('bold', '=== CRITICAL: Invalid Indexes ===')))
  log('')
  log(
    ux.colorize(
      'red',
      'The following tables have indexed referencing fields that do not exist in the schema, which may cause related issues.',
    ),
  )
  log('')

  for (const idx of badIndexes) {
    log(`  ${ux.colorize('red', 'CRITICAL'.padEnd(16))} ${'table'.padEnd(18)} ${idx.table}`)
    log(
      `  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', `${idx.indexType} index → field "${idx.field}" does not exist in schema`)}`,
    )
  }

  log('')
}

// ── Preview Rendering ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  addon: 'Addons',
  agent: 'Agents',
  'agents.md': 'Knowledge: agents.md',
  api_group: 'API Groups',
  doc: 'Knowledge: Docs',
  function: 'Functions',
  mcp_server: 'MCP Servers',
  middleware: 'Middleware',
  query: 'API Endpoints',
  realtime_channel: 'Realtime Channels',
  skill: 'Knowledge: Skills',
  table: 'Tables',
  task: 'Tasks',
  tool: 'Tools',
  toolset: 'Toolsets',
  trigger: 'Triggers',
  workflow_test: 'Workflow Tests',
  workspace: 'Workspace Settings',
}

function renderPreview(
  result: DryRunResult,
  willDelete: boolean,
  target: PushTarget,
  verbose: boolean,
  partial: boolean,
  log: (msg: string) => void,
  filteredOutCount = 0,
): void {
  log('')
  log(ux.colorize('bold', `=== Push Preview: ${target.label} ===`))

  let instanceHost = target.instanceOrigin
  try {
    instanceHost = new URL(target.instanceOrigin).hostname
  } catch {}

  const contextParts: string[] = [
    `instance: ${instanceHost}`,
  ]
  if (result.workspace_name && target.supportsBranches) {
    contextParts.push(`workspace: ${result.workspace_name}`)
  }

  contextParts.push(`cli: v${target.cliVersion}`)

  log(ux.colorize('dim', `  ${contextParts.join('  |  ')}`))

  if (!partial) {
    log(ux.colorize('red', '  --sync: all documents will be sent, including unchanged'))
  }

  log('')

  for (const [type, counts] of Object.entries(result.summary)) {
    const label = TYPE_LABELS[type] || type
    const parts: string[] = []

    if (counts.created > 0) {
      parts.push(ux.colorize('green', `+${counts.created} created`))
    }

    if (counts.updated > 0) {
      parts.push(ux.colorize('yellow', `~${counts.updated} updated`))
    }

    if (willDelete && counts.deleted > 0) {
      parts.push(ux.colorize('red', `-${counts.deleted} deleted`))
    }

    if (counts.truncated > 0) {
      parts.push(ux.colorize('yellow', `${counts.truncated} truncated`))
    }

    if (parts.length > 0) {
      log(`  ${label.padEnd(20)} ${parts.join('  ')}`)
    }
  }

  const changes = result.operations.filter(
    (op) =>
      op.action === 'create' || op.action === 'update' || op.action === 'add_field' || op.action === 'update_field',
  )
  const destructive = result.operations.filter(
    (op) =>
      op.action === 'delete' ||
      op.action === 'cascade_delete' ||
      op.action === 'truncate' ||
      op.action === 'drop_field' ||
      op.action === 'alter_field',
  )

  if (changes.length > 0) {
    log('')
    log(ux.colorize('bold', '--- Changes ---'))
    log('')

    for (const op of changes) {
      const color = op.action === 'update' || op.action === 'update_field' ? 'yellow' : 'green'
      const actionLabel = op.action.toUpperCase()
      log(`  ${ux.colorize(color, actionLabel.padEnd(16))} ${op.type.padEnd(18)} ${op.name}`)
      if (verbose && op.details) {
        log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', op.details)}`)
      }

      if (verbose && op.reason) {
        log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', `reason: ${op.reason}`)}`)
      }
    }
  }

  // Split destructive ops by category
  const deleteOps = destructive.filter((op) => op.action === 'delete' || op.action === 'cascade_delete')
  const alwaysDestructive = destructive.filter(
    (op) => op.action === 'truncate' || op.action === 'drop_field' || op.action === 'alter_field',
  )

  // --include/--exclude and --delete interact in a way the preview cannot show
  // on its own: a filtered-out document is absent from the payload, so without
  // the protection the push declares, the sweep would read it as removed. The
  // objects it defines are spared (and the push is refused outright if they
  // cannot be), but anything ELSE missing from the tree is still deleted below,
  // which is worth saying while a filter is active.
  if (willDelete && filteredOutCount > 0 && deleteOps.length > 0) {
    log('')
    log(
      ux.colorize(
        'yellow',
        `  Note: ${filteredOutCount} file(s) were filtered out by --include/--exclude, and --delete is on.`,
      ),
    )
    log(
      ux.colorize(
        'yellow',
        '  What they define is protected from the sweep; the deletes below are objects missing from the tree entirely.',
      ),
    )
  }

  // Show destructive operations (deletes only when --delete, truncates/drop_field always)
  const shownDestructive = [...(willDelete ? deleteOps : []), ...alwaysDestructive]
  if (shownDestructive.length > 0) {
    log('')
    log(ux.colorize('bold', '--- Destructive Operations ---'))
    log('')

    for (const op of shownDestructive) {
      const color = op.action === 'truncate' || op.action === 'alter_field' ? 'yellow' : 'red'
      const actionLabel = op.action.toUpperCase()
      log(`  ${ux.colorize(color, actionLabel.padEnd(16))} ${op.type.padEnd(18)} ${op.name}`)
      if (verbose && op.details) {
        log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', op.details)}`)
      }

      if (verbose && op.reason) {
        log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', `reason: ${op.reason}`)}`)
      }
    }
  }

  // Warn about potential field renames (add + drop on same table)
  const addFieldTables = new Set(
    result.operations.filter((op) => op.action === 'add_field').map((op) => op.name),
  )
  const dropFieldTables = new Set(
    result.operations.filter((op) => op.action === 'drop_field').map((op) => op.name),
  )
  const renameCandidates = [...addFieldTables].filter((t) => dropFieldTables.has(t))
  if (renameCandidates.length > 0) {
    log('')
    log(
      ux.colorize(
        'yellow',
        `  Note: Table(s) ${renameCandidates.map((t) => `"${t}"`).join(', ')} have both added and dropped fields.`,
      ),
    )
    log(
      ux.colorize('yellow', '  If this is intended to be a field rename, use the Xano Admin — renaming is not'),
    )
    log(ux.colorize('yellow', '  currently available through the CLI or Metadata API.'))
  }

  // Show remote-only items when not using --delete (skip for partial pushes)
  if (!willDelete && !partial && deleteOps.length > 0) {
    log('')
    log(ux.colorize('dim', '--- Remote Only (not included in push) ---'))
    log('')

    for (const op of deleteOps) {
      log(ux.colorize('dim', `  ${op.type.padEnd(18)} ${op.name}`))
    }

    log('')
    log(ux.colorize('dim', `  Use --delete to remove these ${deleteOps.length} item(s) from remote.`))
  }

  log('')
}

// ── Confirmation ────────────────────────────────────────────────────────────

export async function confirm(message: string): Promise<boolean> {
  const readline = await import('node:readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    let answered = false
    rl.on('close', () => {
      if (!answered) resolve(false)
    })
    rl.question(`${message} (y/N) `, (answer) => {
      answered = true
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

// ── GUID Sync ───────────────────────────────────────────────────────────────

/**
 * Ceiling for the `protect_guids` query parameter. The whole request LINE must
 * fit in one nginx buffer (8k by default), and the URL already carries the rest
 * of the push parameters, so stay well inside it.
 */
const PROTECT_GUIDS_MAX_CHARS = 4000

const GUID_REGEX = /guid\s*=\s*(["'])([^"']*)\1/

/**
 * Sync a GUID into a local .xs file. Returns true if the file was modified.
 */
function syncGuidToFile(filePath: string, guid: string): boolean {
  const updated = withGuid(fs.readFileSync(filePath, 'utf8'), guid)
  if (updated === null) return false
  fs.writeFileSync(filePath, updated, 'utf8')
  return true
}

/**
 * Return `content` with its GUID set to `guid`, or null when nothing changes.
 */
function withGuid(content: string, guid: string): null | string {
  const existingMatch = content.match(GUID_REGEX)

  if (existingMatch) {
    if (existingMatch[2] === guid) {
      return null
    }

    return content.replace(GUID_REGEX, `guid = "${guid}"`)
  }

  // No GUID line exists — insert before the final closing brace
  const lines = content.split('\n')
  let insertIndex = -1

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      insertIndex = i
      break
    }
  }

  if (insertIndex === -1) {
    return null
  }

  let indent = '  '
  for (let i = insertIndex - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      const indentMatch = lines[i].match(/^(\s+)/)
      if (indentMatch) {
        indent = indentMatch[1]
      }

      break
    }
  }

  lines.splice(insertIndex, 0, `${indent}guid = "${guid}"`)
  return lines.join('\n')
}

const CANONICAL_REGEX = /canonical\s*=\s*(["'])([^"']*)\1/

/**
 * Sync a server-assigned `canonical` into a local .xs file. Returns true if the
 * file was modified.
 *
 * Like the GUID, a canonical is minted by the instance and the document can only
 * ASK for one: it is unique across every workspace on the instance, so a tree
 * cloned from another workspace names canonicals that are already taken and the
 * import keeps the existing value instead. Without this writeback the local file
 * kept asking for a value the server kept refusing, so every push reported the
 * same objects as changed forever.
 *
 * Unlike the GUID this NEVER inserts a missing line: only the container kinds
 * (api_group, realtime_server, mcp_server/agent/toolset) have the field, and the
 * server omits the key for everything else, so an absent line means "this kind
 * has no canonical" rather than "not yet assigned".
 */
function syncCanonicalToFile(filePath: string, canonical: string): boolean {
  const updated = withCanonical(fs.readFileSync(filePath, 'utf8'), canonical)
  if (updated === null) return false
  fs.writeFileSync(filePath, updated, 'utf8')
  return true
}

/**
 * Return `content` with its canonical set to `canonical`, or null when nothing changes.
 */
function withCanonical(content: string, canonical: string): null | string {
  const existingMatch = content.match(CANONICAL_REGEX)
  if (!existingMatch || existingMatch[2] === canonical) {
    return null
  }

  return content.replace(CANONICAL_REGEX, `canonical = "${canonical}"`)
}

/** Apply a GUID/canonical rewrite to the in-memory copy of what was pushed. */
function updateSnapshot(
  snapshots: Map<string, string>,
  filePath: string,
  rewrite: (content: string) => null | string,
): void {
  const content = snapshots.get(filePath)
  if (content === undefined) return
  const updated = rewrite(content)
  if (updated !== null) snapshots.set(filePath, updated)
}

// ── Knowledge Preview Helpers ─────────────────────────────────────────────────

/**
 * Compute a knowledge change preview: prefer the server's `dry_run` response,
 * and fall back to a client-side diff (fetch current objects → compare) when the
 * server doesn't support it — mirroring how multidoc tolerates a missing dry-run.
 */
async function computeKnowledgePreview(
  listUrl: string,
  objects: LocalKnowledgeObject[],
  branch: string,
  shouldDelete: boolean,
  accessToken: string,
  verboseFetch: PushContext['verboseFetch'],
  verbose: boolean,
): Promise<KnowledgeDryRunResult> {
  const items = toPushItems(objects)

  try {
    const serverResult = await pushKnowledge(listUrl, accessToken, verboseFetch, verbose, {
      branch,
      delete: shouldDelete,
       
      dry_run: true,
      items,
    })
    if (serverResult.operations && serverResult.summary) {
      return {operations: serverResult.operations, summary: serverResult.summary}
    }
  } catch {
    // Server doesn't support dry_run yet; fall through to local diff.
  }

  const serverObjects = await fetchKnowledge(listUrl, branch, accessToken, verboseFetch, verbose)
  return knowledgePreview(items, serverObjects, shouldDelete)
}

/** Fold a knowledge preview's summary + operations into the multidoc DryRunResult. */
function mergeKnowledgePreview(preview: DryRunResult, knowledge: KnowledgeDryRunResult): void {
  for (const [type, counts] of Object.entries(knowledge.summary)) {
    preview.summary[type] = {
      created: counts.created,
      deleted: counts.deleted,
      truncated: 0,
      unchanged: counts.unchanged,
      updated: counts.updated,
    }
  }

  for (const op of knowledge.operations) {
    preview.operations.push({action: op.action, details: '', name: op.name, type: op.type})
  }
}

// ── Main Push Logic ─────────────────────────────────────────────────────────

/**
 * Execute a multidoc push with preview, validation, partial mode, and GUID sync.
 * Shared by both sandbox:push and workspace:push commands.
 */
export async function executePush(
  ctx: PushContext,
  target: PushTarget,
  flags: PushFlags,
): Promise<PushResult> {
  const {accessToken, command, inputDir, verboseFetch} = ctx
  const log = ctx.log ?? command.log.bind(command)
  let dryRunPreview: DryRunResult | null = null
  const stop = (stopped: NonNullable<PushResult['stopped']>): PushResult =>
    ({knowledge: {deleted: 0, imported: 0}, preview: dryRunPreview, sent: [], stopped})

  if (flags.fast && flags.sync) {
    command.error('--fast cannot be used with --sync')
  }

  if (flags.refresh && !flags.fast) {
    command.error('--refresh requires --fast')
  }

  // ── Collect knowledge entries (before file check so knowledge-only push works) ─

  let knowledgeObjects: LocalKnowledgeObject[] = []
  if (ctx.knowledge) {
    knowledgeObjects = collectKnowledgeObjects(ctx.knowledge.rootDir, flags.include, flags.exclude)
  }

  // ── Collect and filter .xs files ──────────────────────────────────────

  const allFiles = collectFiles(inputDir)
  const files = applyFilters(allFiles, inputDir, flags.include, flags.exclude, log)
  let filteredOut = describeFilteredOut(allFiles, files, inputDir)
  let filteredOutCount = allFiles.length - files.length

  const knowledgeOnly = files.length === 0 && (knowledgeObjects.length > 0 || ctx.knowledge !== undefined)

  if (files.length === 0 && !knowledgeOnly) {
    command.error(
      flags.include || flags.exclude
        ? `No .xs files remain after ${[flags.include ? `include ${flags.include.join(', ')}` : '', flags.exclude ? `exclude ${flags.exclude.join(', ')}` : ''].filter(Boolean).join(' and ')} in ${inputDir}`
        : `No .xs files found in ${inputDir}`,
    )
  }

  // ── Read documents ────────────────────────────────────────────────────

  let documentEntries: Array<{content: string; filePath: string}> = []
  let multidoc = ''
  const documentFileMap = new Map<string, string>()
  // The exact bytes of each document as read for this push (then as rewritten by GUID sync
  // and writeback). The sync record hashes these, never a later re-read of the file, so an
  // edit made while the push runs is not recorded as synced.
  const pushedBytes = new Map<string, string>()

  if (!knowledgeOnly) {
    documentEntries = readDocuments(files, pushedBytes)

    if (documentEntries.length === 0) {
      command.error(`All .xs files in ${inputDir} are empty`)
    }

    // ── Handle multi-document files ───────────────────────────────────────
    // The push pipeline assumes one document per file: the partial-diff filter
    // and GUID-writeback both parse only the first document in a file, so a
    // bundle like a single hand-authored multidoc.xs silently pushes nothing
    // (partial) or clobbers a single guid line across every document (full).
    // Rather than fail, offer to flatten each bundle in place into the
    // per-document layout `pull` produces, then re-read and continue the push.
    const multiDocFiles = findMultiDocEntries(documentEntries)
    if (multiDocFiles.length > 0) {
      const list = multiDocFiles
        .map((f) => `    ${relative(inputDir, f.filePath) || f.filePath} (${f.count} documents)`)
        .join('\n')

      log('')
      log(ux.colorize('yellow', ux.colorize('bold', '=== Multi-document file(s) detected ===')))
      log('')
      log(ux.colorize('yellow', 'These .xs files hold more than one document:'))
      log(list)
      log('')
      log(
        ux.colorize(
          'dim',
          'Push needs one document per file (partial diff + GUID writeback operate per file),\n' +
            'so a multi-doc bundle silently pushes nothing or corrupts GUIDs. I can split each\n' +
            'into the standard per-document layout (the same tree `pull` produces) and continue.',
        ),
      )
      log('')

      // Flattening DELETES the source bundle, so never do it unattended without an
      // explicit opt-in. --force means "just do it"; an interactive TTY gets a
      // prompt; a bare non-interactive run refuses (rather than silently rewriting
      // and deleting the user's files in CI).
      if (flags.force) {
        log(ux.colorize('dim', 'Flattening (--force)…'))
      } else if (process.stdin.isTTY) {
        const doFlatten = await confirm('Flatten these file(s) in place and continue the push?')
        if (!doFlatten) {
          log('Push cancelled. Run `xano flatten <file>` yourself, or re-run to be prompted again.')
          return stop('cancelled')
        }
      } else {
        command.error(
          'Multi-document .xs file(s) cannot be pushed. Run `xano flatten <file>` to split them ' +
            'into the standard per-document layout first, or re-run with --force to flatten automatically.',
        )
      }

      for (const offender of multiDocFiles) {
        try {
          const result = flattenBundleFile(offender.filePath, {log: (m) => flags.verbose && log(ux.colorize('dim', m))})
          log(
            ux.colorize(
              'dim',
              `  flattened ${relative(inputDir, offender.filePath) || offender.filePath} → ${result.written.length} files`,
            ),
          )
        } catch (error) {
          command.error(`Failed to flatten ${offender.filePath}: ${(error as Error).message}`)
        }
      }

      log('')

      // Re-collect and re-read: the bundle files are gone, replaced by the split
      // per-document tree, so the rest of the push sees a clean one-doc-per-file set.
      // The split documents land at new paths that the filter may now leave out,
      // so the filtered-out set is rebuilt from the new tree too: --delete must
      // spare those documents, the same as any other filtered-out file.
      pushedBytes.clear()
      const refreshedFiles = collectFiles(inputDir)
      const refreshedKept = applyFilters(refreshedFiles, inputDir, flags.include, flags.exclude, () => {})
      filteredOut = describeFilteredOut(refreshedFiles, refreshedKept, inputDir)
      filteredOutCount = refreshedFiles.length - refreshedKept.length
      const refreshed = readDocuments(refreshedKept, pushedBytes)
      documentEntries = refreshed

      if (documentEntries.length === 0) {
        command.error('After flattening, no .xs documents remain to push.')
      }
    }

    // ── Refuse a tree carrying more than one workspace document ───────────
    // The server applies the FIRST workspace document it sees to the workspace
    // being pushed into and silently drops the rest, with no check that the
    // document describes that workspace. A second one therefore renames the
    // destination to a foreign name while leaving all of its content intact,
    // and which name wins flips with whatever happens to be in the pushed set.
    //
    // Checked against the WHOLE tree rather than the partial changed-set, because
    // the flip-flop case is exactly the one where only the foreign document is
    // "changed" and would be the sole workspace document actually sent.
    //
    // No --force escape and no auto-fix: unlike the multi-doc bundle above there
    // is no safe repair, since only the user knows which workspace this tree is
    // meant to be. Picking one is the bug.
    const workspaceDocs = findWorkspaceEntries(documentEntries)
    if (workspaceDocs.length > 1) {
      const list = workspaceDocs
        .map((w) => `    ${relative(inputDir, w.filePath) || w.filePath}  →  workspace "${w.name}"`)
        .join('\n')

      command.error(
        `${inputDir} holds ${workspaceDocs.length} workspace documents:\n${list}\n\n` +
          'A push targets one workspace, and the server applies only the first of these and ' +
          'silently discards the rest — renaming the destination to a foreign name while leaving ' +
          'its content untouched.\n\n' +
          'Delete the ones that do not describe the workspace you are pushing to, keeping a single ' +
          'workspace/*.xs. (`pull` names this file after the workspace, so pulling a different ' +
          'workspace into this tree, or renaming one, leaves the old file behind.)',
      )
    }

    multidoc = documentEntries.map((d) => d.content).join('\n---\n')

    // ── Build document key → file path map (for GUID writeback) ─────────

    for (const entry of documentEntries) {
      const parsed = parseDocument(entry.content)
      if (parsed) {
        const key = buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
        documentFileMap.set(key, entry.filePath)
      }
    }
  }

  const allDocumentEntries = [...documentEntries]
  let recordSourceEntries = [...documentEntries]
  let exportRebuild = false
  const pendingRecordEntries: Record<string, SyncFileEntry> = {}
  // Filled after writeback; the second persist() picks up the ids through recordEntriesFor.
  const writebackIds: Record<string, SyncFileEntry> = {}
  const recordEntriesFor = (filePaths: string[]): Record<string, SyncFileEntry> => {
    const snapshots = filePaths.flatMap((filePath) => {
      const content = pushedBytes.get(filePath)
      return content === undefined ? [] : [{content, filePath}]
    })
    const entries = {...pendingRecordEntries, ...recordEntriesForContents(inputDir, snapshots)}
    for (const [relPath, found] of Object.entries(writebackIds)) {
      const entry = entries[relPath]
      if (entry && entry.key === found.key && found.id !== undefined) {
        entries[relPath] = {...entry, id: found.id}
      }
    }

    return entries
  }

  // An export rebuild re-derives the whole record, unless -i/-e limited it to part of the tree.
  // An untrusted sandbox record is always replaced: entries outside the filter describe a
  // sandbox that may since have been reset, and the new token would vouch for them.
  const replaceRecord = (): boolean => exportRebuild && (sandboxUntrusted || (!flags.include && !flags.exclude))
  // Under --records a table with items is always sent, as filterChangedEntries does without
  // --fast: the record does not say whether its rows were imported.
  const alwaysSend = (content: string): boolean => flags.records && isTableWithRecords(content)
  const persistRecord = !flags['dry-run'] && Boolean(ctx.syncTarget) && (Boolean(flags.fast) || syncStateExists(inputDir))
  const resolved =
    flags.fast || flags.writeback || persistRecord
      ? await resolveSyncTarget(ctx, flags)
      : {isLiveBranch: !ctx.branch, liveBranch: ctx.branch, target: null}
  const resolvedTarget = resolved.target
  let loadedState: null | SyncTargetState = null
  if (resolvedTarget) {
    loadedState = loadSyncState(inputDir, resolvedTarget, (message) => command.warn(message))
  } else if (ctx.syncTarget && flags.fast) {
    command.warn('Could not resolve sync target fingerprints; comparing against the server export')
  }

  let sandboxUntrusted = false
  if (ctx.syncTarget?.kind === 'sandbox' && resolvedTarget && loadedState) {
    const markerToken = readMarkerToken(
      ctx.syncTarget.markerDir,
      resolvedTarget.instance_host,
      resolvedTarget.branch_created_at,
    )
    if (!loadedState.sandbox_token || loadedState.sandbox_token !== markerToken) {
      sandboxUntrusted = true
      loadedState = null
    }
  }

  if (flags.fast && flags.env && ctx.syncTarget && !knowledgeOnly) {
    log(ux.colorize('dim', '--env: the sync record does not track environment variables; comparing every file with the dry-run'))
  }

  if (flags.fast && !flags.env && ctx.syncTarget && !knowledgeOnly) {
    const useExport = Boolean(flags.refresh) || !resolvedTarget || !loadedState
    if (useExport) {
      let exportReason = 'No sync record for this workspace/branch; comparing against the server export'
      if (flags.refresh) {
        exportReason = 'Refreshing sync record from the server export'
      } else if (sandboxUntrusted) {
        exportReason =
          'Sandbox changed since this directory\'s last push (reset, delete, or another directory); comparing against the sandbox export'
      }

      log(exportReason)
      const exportParams = new URLSearchParams({
        env: 'false',
        include_draft: 'false',
        records: flags.records.toString(),
      })
      if (target.supportsBranches) {
        exportParams.set('branch', ctx.branch)
      }

      try {
        const exportResponse = await verboseFetch(
          target.buildPushUrl(exportParams),
          {
            headers: {
              accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            method: 'GET',
          },
          flags.verbose,
          accessToken,
        )
        if (!exportResponse.ok) {
          throw new Error(`HTTP ${exportResponse.status}`)
        }

        const exported = parseExportDocuments(await exportResponse.text())
        const compared = compareLocalToExport(
          allDocumentEntries.map((entry) => ({
            ...entry,
            relPath: toRelPath(inputDir, entry.filePath),
          })),
          exported,
        )

        if (compared.serverOnly.length > 0) {
          log(
            ux.colorize(
              'dim',
              `${compared.serverOnly.length} object${compared.serverOnly.length === 1 ? '' : 's'} exist on the server but not locally; pull to get them, or --sync --delete to remove them`,
            ),
          )
        }

        exportRebuild = true
        const candidates = [...compared.candidates]
        const identical: typeof compared.identical = []
        for (const entry of compared.identical) {
          if (alwaysSend(entry.content)) candidates.push(entry)
          else identical.push(entry)
        }

        Object.assign(pendingRecordEntries, recordEntriesFor(identical.map((entry) => entry.filePath)))

        if (candidates.length === 0 && knowledgeObjects.length === 0) {
          if (resolvedTarget && !flags['dry-run']) {
            commitSyncRecordWithSandbox(
              ctx,
              inputDir,
              resolvedTarget,
              pendingRecordEntries,
              {replace: replaceRecord()},
              (message) => command.warn(message),
            )
          }

          log('')
          log('No changes to push.')
          return stop('no-changes')
        }

        documentEntries = candidates
        recordSourceEntries = [...documentEntries]
        multidoc = documentEntries.map((entry) => entry.content).join('\n---\n')
        documentFileMap.clear()
        for (const entry of documentEntries) {
          const parsed = parseDocument(entry.content)
          if (parsed) {
            documentFileMap.set(buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup), entry.filePath)
          }
        }
      } catch (error) {
        command.warn(
          `Failed to download the server export for --fast (${(error as Error).message}); falling back to a full dry-run`,
        )
        exportRebuild = false
      }
    } else if (resolvedTarget && loadedState) {
      const allHashes = collectFiles(inputDir).map((filePath) => {
        const content = pushedBytes.get(filePath)
        return {
          alwaysSend: content !== undefined && alwaysSend(content),
          relPath: toRelPath(inputDir, filePath),
          sha256: content === undefined ? hashFile(filePath) : hashBytes(content),
        }
      })
      const {candidates, deletedLocally} = {
        candidates: allHashes.filter((file) => {
          const recorded = loadedState.files[file.relPath]
          return file.alwaysSend || !recorded || recorded.sha256 !== file.sha256
        }),
        deletedLocally: Object.entries(loadedState.files)
          .filter(([relPath]) => !allHashes.some((file) => file.relPath === relPath))
          .filter(([relPath]) => pathMatchesFilters(relPath, inputDir, flags.include, flags.exclude))
          .map(([relPath, entry]) => ({key: entry.key, relPath})),
      }

      if (deletedLocally.length > 0) {
        log(
          ux.colorize(
            'dim',
            `${deletedLocally.length} file${deletedLocally.length === 1 ? '' : 's'} deleted locally since last sync; use --sync --delete to remove them remotely`,
          ),
        )
      }

      const candidatePaths = new Set(candidates.map((file) => file.relPath))
      documentEntries = allDocumentEntries.filter((entry) => candidatePaths.has(toRelPath(inputDir, entry.filePath)))
      recordSourceEntries = [...documentEntries]

      if (documentEntries.length === 0 && knowledgeObjects.length === 0) {
        log('No local changes since last sync')
        return stop('no-changes')
      }

      multidoc = documentEntries.map((entry) => entry.content).join('\n---\n')
      documentFileMap.clear()
      for (const entry of documentEntries) {
        const parsed = parseDocument(entry.content)
        if (parsed) {
          documentFileMap.set(buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup), entry.filePath)
        }
      }
    }
  }

  // ── Resolve push mode ─────────────────────────────────────────────────

  const isPartial = !flags.sync

  if (flags.delete && isPartial) {
    command.error('Cannot use --delete without --sync')
  }

  const shouldDelete = isPartial ? false : flags.delete
  const pruneMissing = shouldDelete && !knowledgeOnly

  // ── Build query params ────────────────────────────────────────────────

  const queryParams = new URLSearchParams({
    delete: shouldDelete.toString(),
    env: flags.env.toString(),
    records: flags.records.toString(),
    transaction: flags.transaction.toString(),
    truncate: flags.truncate.toString(),
  })

  if (target.supportsBranches && ctx.branch) {
    queryParams.set('branch', ctx.branch)
  }

  if (target.supportsPartial) {
    queryParams.set('partial', isPartial.toString())
  }

  if (target.sourceWorkspaceId) {
    queryParams.set('source_workspace_id', target.sourceWorkspaceId)
  }

  // Tell the server which objects the filter put out of scope, so its delete
  // sweep spares them. Only meaningful with --delete; without it nothing is
  // swept. The parameter travels in the query string (the body is the multidoc
  // itself), so it has a length ceiling: past PROTECT_GUIDS_MAX_CHARS we send
  // nothing and let the verification below refuse the push rather than issue a
  // request the server may truncate or reject.
  const protectGuidsParam = protectGuidsFor(filteredOut)

  if (shouldDelete && protectGuidsParam && protectGuidsParam.length <= PROTECT_GUIDS_MAX_CHARS) {
    queryParams.set('protect_guids', protectGuidsParam)
  }

  // ── Request headers ───────────────────────────────────────────────────

  const requestHeaders = {
    accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'text/x-xanoscript',
  }

  // ── Dry-run / Preview ─────────────────────────────────────────────────

  const dryRunUrl = knowledgeOnly ? null : target.buildDryRunUrl(queryParams)

  if (dryRunUrl && (flags['dry-run'] || !flags.force)) {
    const dryRunParams = new URLSearchParams(queryParams)
    // Always request delete info in dry-run to show remote-only items
    // and to know what exists on the server for reference checking
    dryRunParams.set('delete', 'true')
    const fullDryRunUrl = target.buildDryRunUrl(dryRunParams)!

    try {
      const dryRunResponse = await verboseFetch(
        fullDryRunUrl,
        {
          body: multidoc,
          headers: requestHeaders,
          method: 'POST',
        },
        flags.verbose,
        accessToken,
      )

      if (dryRunResponse.ok) {
        const dryRunText = await dryRunResponse.text()
        const preview = JSON.parse(dryRunText) as DryRunResult
        dryRunPreview = preview

        if (preview && preview.summary) {
          // ── Merge knowledge preview into the combined DryRunResult ──────

          if (ctx.knowledge && (knowledgeObjects.length > 0 || shouldDelete)) {
            const knowledgeDryRun = await computeKnowledgePreview(
              ctx.knowledge.listUrl(),
              knowledgeObjects,
              ctx.branch,
              shouldDelete,
              accessToken,
              verboseFetch,
              flags.verbose,
            )
            mergeKnowledgePreview(preview, knowledgeDryRun)
          }

          renderPreview(preview, shouldDelete, target, flags.verbose, isPartial, log, filteredOutCount)

          // GUARD: --include/--exclude must never cost you the objects it
          // filtered out.
          //
          // A filtered-out document is absent from the payload, so a --delete
          // sweep reads it as removed from the tree and deletes it - the exact
          // opposite of what -e means to the person typing it. The server is
          // told to spare them (protect_guids above), but this checks the
          // SERVER'S OWN preview rather than assuming that worked: an older
          // instance ignores the parameter, a document that has never been
          // pushed has no GUID to protect, and a very large filter exceeds what
          // the query string can carry. In every one of those cases the push is
          // refused rather than allowed to delete. A --force push runs the
          // same check in verifyFilteredOutSpared below.
          if (shouldDelete) {
            const endangered = deletesHittingFilteredOut(preview.operations, filteredOut)
            if (endangered.length > 0) refuseDeletesHittingFilteredOut(command, log, endangered, filteredOut)
          }

          // Check for bad cross-references using dry-run operations to avoid false positives
          const badRefs = checkReferences(allDocumentEntries, preview.operations, documentEntries)
          if (badRefs.length > 0) {
            renderBadReferences(badRefs, log)
          }

          // Check for indexes referencing non-existent schema fields
          const badIndexes = checkTableIndexes(documentEntries)
          if (badIndexes.length > 0) {
            renderBadIndexes(badIndexes, log)
          }

          // Check for critical errors that must block the push
          const criticalOps = preview.operations.filter(
            (op) => op.details?.includes('exception:') || op.details?.includes('mvp:placeholder'),
          )

          if (criticalOps.length > 0) {
            log('')
            log(ux.colorize('red', ux.colorize('bold', '=== CRITICAL ERRORS ===')))
            log('')
            log(
              ux.colorize('red', 'The following items contain syntax errors or unresolved placeholder statements'),
            )
            log(ux.colorize('red', 'that would corrupt data if pushed. These must be resolved first:'))
            log('')

            for (const op of criticalOps) {
              log(`  ${ux.colorize('red', 'BLOCKED'.padEnd(16))} ${op.type.padEnd(18)} ${op.name}`)
              if (op.details) {
                log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', op.details)}`)
              }
            }

            log('')
            log(ux.colorize('red', `Push blocked: ${criticalOps.length} critical error(s) found.`))

            if (!flags.force) {
              return stop('blocked')
            }

            log(ux.colorize('yellow', 'Proceeding anyway due to --force flag.'))
          }

          // Check for actual changes (multidoc + knowledge combined)
          const hasChanges = Object.values(preview.summary).some(
            (c) => c.created > 0 || c.updated > 0 || (shouldDelete && c.deleted > 0) || c.truncated > 0,
          )

          // Detect local records
          const tablesWithRecords = flags.records
            ? documentEntries
                .filter((d) => isTableWithRecords(d.content))
                .map((d) => {
                  const nameMatch = d.content.match(/^table\s+(\S+)/m)
                  const itemsMatch = d.content.match(/\bitems\s*=\s*\[([\s\S]*?)\n\s*\]/)
                  const itemCount = itemsMatch ? (itemsMatch[1].match(/^\s*\{/gm) || []).length : 0
                  return {name: nameMatch ? nameMatch[1] : 'unknown', records: itemCount}
                })
            : []
          const hasLocalRecords = tablesWithRecords.length > 0

          if (hasLocalRecords) {
            log('')
            log(ux.colorize('bold', '--- Records ---'))
            log('')
            for (const t of tablesWithRecords) {
              log(
                `  ${ux.colorize('yellow', 'UPSERT'.padEnd(16))} ${'table'.padEnd(18)} ${t.name} (${t.records} records)`,
              )
            }

            log('')
          }

          if (!hasChanges && !hasLocalRecords) {
            log('')
            log('No changes to push.')
            if (persistRecord) {
              commitSyncRecordWithSandbox(
                ctx,
                inputDir,
                resolvedTarget,
                recordEntriesFor(recordSourceEntries.map((entry) => entry.filePath)),
                {pruneMissing, replace: replaceRecord()},
                (message) => command.warn(message),
              )
            }

            return stop('no-changes')
          }

          if (flags['dry-run']) {
            return stop('dry-run')
          }

          // Warn when the sandbox currently holds a different source workspace than the one being
          // pushed. The backend compares the source workspace id we sent against the id stored on
          // the sandbox from its last push, so this is reliable regardless of whether the push
          // includes a workspace-settings document (unlike the old name comparison).
          let mismatchConfirmed = false
          if (target.warnOnWorkspaceMismatch && preview.source_workspace_mismatch) {
            log('')
            log(ux.colorize('yellow', ux.colorize('bold', '=== Workspace Mismatch ===')))
            log('')
            log(
              ux.colorize(
                'yellow',
                "This sandbox currently holds a different workspace than the one you're pushing.",
              ),
            )
            log(
              ux.colorize(
                'yellow',
                'Pushing on top of it can leave stale data behind. Run `xano sandbox reset` first to start clean.',
              ),
            )
            log('')
            if (process.stdin.isTTY) {
              const proceed = await confirm('Continue with push anyway?')
              if (!proceed) {
                log('Push cancelled. Run `xano sandbox reset` then retry.')
                return stop('cancelled')
              }

              mismatchConfirmed = true
            } else {
              command.error(
                'Workspace mismatch detected in non-interactive mode. Run `xano sandbox reset` first to start clean.',
              )
            }
          }

          // Confirm with user (skip if workspace mismatch prompt already obtained confirmation)
          if (!mismatchConfirmed) {
            const hasDestructive = preview.operations.some(
              (op) =>
                (shouldDelete && (op.action === 'delete' || op.action === 'cascade_delete')) ||
                op.action === 'truncate' ||
                op.action === 'drop_field' ||
                op.action === 'alter_field',
            )
            const message = hasDestructive
              ? 'Proceed with push? This includes DESTRUCTIVE operations listed above.'
              : 'Proceed with push?'

            if (process.stdin.isTTY) {
              const confirmed = await confirm(message)
              if (!confirmed) {
                log('Push cancelled.')
                return stop('cancelled')
              }
            } else {
              command.error('Non-interactive environment detected. Use --force to skip confirmation.')
            }
          }
        } else {
          // Server returned unexpected response
          log('')
          log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
          log('')
          await confirmOrAbort(command, log)
        }
      } else {
        await handleDryRunError(dryRunResponse, command, target, {log, verbose: flags.verbose})
        // If we get here, the user confirmed to proceed without preview
      }
    } catch (error) {
      // Ctrl+C or SIGINT
      if (error instanceof PushPolicyGateError) throw error
      if ((error as Error).name === 'AbortError' || (error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
        log('\nPush cancelled.')
        return stop('cancelled')
      }

      // Re-throw oclif errors
      if (error instanceof Error && 'oclif' in error) {
        throw error
      }

      // Dry-run failed unexpectedly — proceed without preview
      log('')
      log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
      if (flags.verbose) {
        log(ux.colorize('dim', `  ${(error as Error).message}`))
      }

      log('')
      await confirmOrAbort(command, log)
    }
  } else if (knowledgeOnly && (flags['dry-run'] || !flags.force)) {
    // ── Knowledge-only dry-run / preview ──────────────────────────────────
    const kPreview = await computeKnowledgePreview(
      ctx.knowledge!.listUrl(),
      knowledgeObjects,
      ctx.branch,
      shouldDelete,
      accessToken,
      verboseFetch,
      flags.verbose,
    )

    const syntheticResult: DryRunResult = {
      operations: kPreview.operations.map((op) => ({action: op.action, details: '', name: op.name, type: op.type})),
      summary: Object.fromEntries(
        Object.entries(kPreview.summary).map(([type, counts]) => [
          type,
          {created: counts.created, deleted: counts.deleted, truncated: 0, unchanged: counts.unchanged, updated: counts.updated},
        ]),
      ),
    }

    renderPreview(syntheticResult, shouldDelete, target, flags.verbose, true, log)

    const hasChanges = Object.values(syntheticResult.summary).some(
      (c) => c.created > 0 || c.updated > 0 || (shouldDelete && c.deleted > 0),
    )

    if (!hasChanges) {
      log('')
      log('No changes to push.')
      return stop('no-changes')
    }

    if (flags['dry-run']) {
      return stop('dry-run')
    }

    if (process.stdin.isTTY) {
      const confirmed = await confirm('Proceed with push?')
      if (!confirmed) {
        log('Push cancelled.')
        return stop('cancelled')
      }
    } else {
      command.error('Non-interactive environment detected. Use --force to skip confirmation.')
    }
  } else if (shouldDelete && !knowledgeOnly && filteredOut.length > 0) {
    // ── --force with --delete and a filter: no preview, but still the guard ─
    await verifyFilteredOutSpared({
      accessToken,
      command,
      dryRunUrl,
      filteredOut,
      init: {body: multidoc, headers: requestHeaders, method: 'POST'},
      log,
      target,
      verbose: flags.verbose,
      verboseFetch,
    })
  }

  // ── Show bad references in force mode (preview mode shows them inline) ─

  if (flags.force && !knowledgeOnly) {
    const badRefs = checkReferences(allDocumentEntries, undefined, documentEntries)
    if (badRefs.length > 0) {
      log('')
      renderBadReferences(badRefs, log)
    }
  }

  // ── Partial push: filter to changed documents only ────────────────────

  let sent = documentEntries
  if (!knowledgeOnly && isPartial && dryRunPreview) {
    sent = filterChangedEntries(documentEntries, dryRunPreview.operations, flags.records)

    if (sent.length === 0 && knowledgeObjects.length === 0) {
      log('No changes to push.')
      if (persistRecord) {
        commitSyncRecordWithSandbox(
          ctx,
          inputDir,
          resolvedTarget,
          recordEntriesFor(recordSourceEntries.map((entry) => entry.filePath)),
          {pruneMissing: false, replace: replaceRecord()},
          (message) => command.warn(message),
        )
      }

      return stop('no-changes')
    }

    multidoc = sent.map((d) => d.content).join('\n---\n')
  }

  const persist = (): void => {
    if (!persistRecord || !ctx.syncTarget) return
    const paths = [
      ...recordSourceEntries.map((entry) => entry.filePath),
      ...sent.map((entry) => entry.filePath),
    ]
    commitSyncRecordWithSandbox(
      ctx,
      inputDir,
      resolvedTarget,
      recordEntriesFor(paths),
      {pruneMissing, replace: replaceRecord()},
      (message) => command.warn(message),
    )
  }

  // ── Execute the actual push ───────────────────────────────────────────

  const willMutate =
    (!knowledgeOnly && Boolean(multidoc)) ||
    Boolean(ctx.knowledge && (knowledgeObjects.length > 0 || shouldDelete))
  if (willMutate && !flags['dry-run']) {
    maybeInvalidateSandboxMarker(ctx, persistRecord, (message) => command.warn(message))
  }

  const startTime = Date.now()
  let pushedDocCount = 0
  let pushResponse: Record<string, unknown> | undefined

  if (!knowledgeOnly && multidoc) {
    const apiUrl = target.buildPushUrl(queryParams)

    try {
      const response = await verboseFetch(
        apiUrl,
        {
          body: multidoc,
          headers: requestHeaders,
          method: 'POST',
        },
        flags.verbose,
        accessToken,
      )

      if (!response.ok) {
        const errorText = await response.text()
        refuseIfExplained(command, target, response.status, errorText)
        handlePushError(response, errorText, documentEntries, inputDir, command)
      }

      // Parse response for GUID map
      const responseText = await response.text()
      let guidMap: GuidMapEntry[] = []
      pushResponse = {}

      if (responseText && responseText !== 'null') {
        try {
          const responseJson = JSON.parse(responseText)
          if (responseJson && typeof responseJson === 'object') pushResponse = responseJson
          if (responseJson?.guid_map && Array.isArray(responseJson.guid_map)) {
            guidMap = responseJson.guid_map
          }
        } catch {
          if (flags.verbose) {
            log('Server response is not JSON; skipping GUID sync')
          }
        }
      }

      // Write GUIDs back to local files
      if (flags.guids && guidMap.length > 0) {
        const baseKeyMap = new Map<string, string>()
        for (const [key, fp] of documentFileMap) {
          const baseKey = key.split(':').slice(0, 2).join(':')
          if (baseKeyMap.has(baseKey)) {
            baseKeyMap.set(baseKey, '') // Mark as ambiguous
          } else {
            baseKeyMap.set(baseKey, fp)
          }
        }

        let updatedCount = 0
        let canonicalCount = 0
        for (const entry of guidMap) {
          if (!entry.guid || entry.type === 'policy') continue

          const key = buildDocumentKey(entry.type, entry.name, entry.verb, entry.api_group)
          let filePath = documentFileMap.get(key)

          if (!filePath) {
            const baseKey = `${entry.type}:${entry.name}`
            const basePath = baseKeyMap.get(baseKey)
            if (basePath) {
              filePath = basePath
            }
          }

          if (!filePath) {
            if (flags.verbose) {
              log(`  No local file found for ${entry.type} "${entry.name}", skipping GUID sync`)
            }

            continue
          }

          try {
            const updated = syncGuidToFile(filePath, entry.guid)
            if (updated) updatedCount++
            updateSnapshot(pushedBytes, filePath, (content) => withGuid(content, entry.guid))
          } catch (error) {
            command.warn(`Failed to sync GUID to ${filePath}: ${(error as Error).message}`)
          }

          if (entry.canonical) {
            const {canonical} = entry
            try {
              const updated = syncCanonicalToFile(filePath, canonical)
              if (updated) canonicalCount++
              updateSnapshot(pushedBytes, filePath, (content) => withCanonical(content, canonical))
            } catch (error) {
              command.warn(`Failed to sync canonical to ${filePath}: ${(error as Error).message}`)
            }
          }
        }

        if (updatedCount > 0) {
          log(`Synced ${updatedCount} GUIDs to local files`)
        }

        if (canonicalCount > 0) {
          log(`Synced ${canonicalCount} canonicals to local files (the instance assigned its own)`)
        }
      }

      pushedDocCount = multidoc.split('\n---\n').length
    } catch (error) {
      if (error instanceof PushPolicyGateError) throw error
      if (error instanceof Error && 'oclif' in error) throw error
      const elapsedMs = Date.now() - startTime
      command.error(`Failed to push multidoc: ${describeNetworkError(error, apiUrl, elapsedMs)}`)
    }
  }

  // Write the marker/record before writeback. Writeback is another full export, and
  // a failure or Ctrl+C there must not drop --fast state from an already-successful push.
  persist()

  let writebackMs = 0
  if (flags.writeback && pushedDocCount > 0) {
    const writeback = await writeBackFormattedDocuments({
      accessToken,
      branch: ctx.branch,
      command,
      includeEnv: flags.env,
      includeRecords: flags.records,
      inputDir,
      isLiveBranch: resolved.isLiveBranch,
      log,
      pushedBytes,
      pushedEntries: sent,
      resolvedTarget,
      syncState: loadedState,
      target,
      verbose: flags.verbose,
      verboseFetch,
      workspaceId: ctx.syncTarget?.kind === 'workspace' ? ctx.syncTarget.workspace : undefined,
      writebackDiff: flags.writebackDiff,
      writebackObjectLimit: flags.writebackObjectLimit,
    })
    writebackMs = writeback.elapsedMs
    Object.assign(writebackIds, writeback.ids)
    for (const {content, filePath} of writeback.written) {
      pushedBytes.set(filePath, content)
    }
  }

  // ── Push knowledge ────────────────────────────────────────────────────

  let knowledgeImported = 0
  let knowledgeDeleted = 0
  const pushed = (): PushResult => ({
    knowledge: {deleted: knowledgeDeleted, imported: knowledgeImported},
    preview: dryRunPreview,
    response: pushResponse,
    sent: pushResponse ? sent : [],
  })

  if (ctx.knowledge && (knowledgeObjects.length > 0 || shouldDelete)) {
    const listUrl = ctx.knowledge.listUrl()
    try {
      const result = await pushKnowledge(listUrl, accessToken, verboseFetch, flags.verbose, {
        branch: ctx.branch,
        delete: shouldDelete,
        force: false,
        items: toPushItems(knowledgeObjects),
      })
      knowledgeImported = result.imported ?? 0
      knowledgeDeleted = result.deleted ?? 0

      // Write GUIDs back into local frontmatter, matching server entries by name.
      if (flags.guids && result.guid_map && result.guid_map.length > 0) {
        const fileByName = new Map(knowledgeObjects.map((o) => [o.name, o.filePath]))
        let kGuidCount = 0
        for (const entry of result.guid_map) {
          const filePath = entry.guid && entry.name ? fileByName.get(entry.name) : undefined
          if (!filePath) continue
          try {
            const updated = syncGuidToFrontmatter(filePath, entry.guid)
            if (updated) kGuidCount++
          } catch (error) {
            command.warn(`Failed to sync knowledge GUID to ${filePath}: ${(error as Error).message}`)
          }
        }

        if (kGuidCount > 0) {
          log(`Synced ${kGuidCount} knowledge GUIDs to local files`)
        }
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      const elapsedMs = Date.now() - startTime
      const message = `Failed to push knowledge: ${describeNetworkError(error, listUrl, elapsedMs)}`
      if (pushResponse) throw new FailedAfterImportError(message, pushed())
      command.error(message)
    }
  }

  const elapsed = (Math.max(0, Date.now() - startTime - writebackMs) / 1000).toFixed(1)
  const parts: string[] = []
  if (!knowledgeOnly) parts.push(`${pushedDocCount} documents`)
  if (ctx.knowledge && (knowledgeObjects.length > 0 || shouldDelete)) {
    const kParts = [`${knowledgeImported} knowledge file${knowledgeImported === 1 ? '' : 's'}`]
    if (shouldDelete && knowledgeDeleted > 0) kParts.push(`${knowledgeDeleted} deleted`)
    parts.push(kParts.join(', '))
  }

  persist()

  log(`Pushed ${parts.join(' + ')} to ${target.label} from ${relative(process.cwd(), inputDir) || inputDir} in ${elapsed}s`)
  return pushed()
}

export interface WritebackResult {
  elapsedMs: number
  /** Object ids resolved by per-object writeback, keyed by relative path. */
  ids: Record<string, SyncFileEntry>
  /** The exact bytes written to each rewritten file. */
  written: Array<{content: string; filePath: string}>
}

export async function writeBackFormattedDocuments(args: {
  accessToken: string
  branch: string
  command: Command
  includeEnv: boolean
  includeRecords: boolean
  inputDir?: string
  isLiveBranch?: boolean
  /** Where progress goes; defaults to the command's stdout. */
  log?: (message: string) => void
  /**
   * The bytes each file held when it was pushed (after GUID sync). A file whose disk content
   * no longer matches was edited during the push, so writeback leaves it alone.
   */
  pushedBytes?: Map<string, string>
  pushedEntries: Array<{content: string; filePath: string}>
  resolvedTarget?: null | SyncTargetIdentity
  syncState?: null | SyncTargetState
  target: PushTarget
  verbose: boolean
  verboseFetch: (
    url: string,
    options: {headers?: Record<string, string>; method?: string},
    verbose: boolean,
    authToken?: string,
  ) => Promise<WritebackHttpResponse>
  workspaceId?: string
  writebackDiff?: string
  writebackObjectLimit?: number
}): Promise<WritebackResult> {
  const started = Date.now()
  const {
    accessToken,
    branch,
    command,
    includeEnv,
    includeRecords,
    inputDir,
    isLiveBranch = !branch,
    pushedBytes,
    resolvedTarget,
    syncState,
    target,
    verbose,
    verboseFetch,
    workspaceId,
    writebackDiff,
    writebackObjectLimit,
  } = args
  const log = args.log ?? command.log.bind(command)
  const elapsedLabel = () => ` (${((Date.now() - started) / 1000).toFixed(1)}s)`
  const ids: Record<string, SyncFileEntry> = {}
  const written: WritebackResult['written'] = []
  const done = (): WritebackResult => ({elapsedMs: Date.now() - started, ids, written})
  const relPathOf = (filePath: string): string => (inputDir ? toRelPath(inputDir, filePath) : filePath)

  const localContents = new Map<string, string>()
  const pushedFiles = new Map<string, string>()
  const unchangedEntries: Array<{content: string; filePath: string}> = []
  for (const entry of args.pushedEntries) {
    const parsed = parseDocument(entry.content)
    if (!parsed) continue
    let local: string
    try {
      local = fs.readFileSync(entry.filePath, 'utf8')
    } catch {
      local = entry.content
    }

    const sent = pushedBytes?.get(entry.filePath)
    if (sent !== undefined && local !== sent) {
      command.warn(`Writeback: skipped ${relPathOf(entry.filePath)}; it changed after it was read for the push`)
      continue
    }

    const key = buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
    pushedFiles.set(key, entry.filePath)
    localContents.set(entry.filePath, local)
    unchangedEntries.push(entry)
  }

  if (unchangedEntries.length === 0) return done()

  let exportedDocs: ReturnType<typeof parseExportDocuments> = []
  let pathLabel = 'export'

  if (resolvedTarget && workspaceId && writebackObjectLimit !== 0) {
    const get: ObjectGet = async (pathname, query = {}) => {
        const params = new URLSearchParams(query)
        const origin = target.instanceOrigin.replace(/\/$/, '')
        const url = `${origin}/api:meta${pathname}${params.toString() ? `?${params.toString()}` : ''}`
        const response = await verboseFetch(
          url,
          {
            headers: {
              accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            method: 'GET',
          },
          verbose,
          accessToken,
        )
        const text = await response.text()
        let json: unknown = text
        try {
          json = JSON.parse(text)
        } catch {
          // keep text
        }

        return {json, ok: response.ok, status: response.status}
    }

    let fetched: Awaited<ReturnType<typeof fetchFormattedObjects>>
    try {
      fetched = await fetchFormattedObjects({
        get,
        isLiveBranch,
        limit: writebackObjectLimit,
        pushed: unchangedEntries.map((entry) => ({
          content: localContents.get(entry.filePath) ?? entry.content,
          filePath: entry.filePath,
          relPath: relPathOf(entry.filePath),
        })),
        state: syncState ?? null,
        target: resolvedTarget,
        workspaceId,
      })
    } catch (error) {
      fetched = {ok: false, reason: (error as Error).message}
    }

    if (fetched.ok) {
      Object.assign(ids, fetched.ids)
      exportedDocs = []
      for (const result of fetched.results) {
        const parsed = parseDocument(result.content)
        if (!parsed) {
          command.warn(`Writeback: skipped ${result.filePath}; fetched document did not parse`)
          continue
        }

        exportedDocs.push({...parsed, content: result.content})
      }

      pathLabel = 'per-object'
    } else {
      command.warn(`Per-object writeback unavailable (${fetched.reason}); using full export`)
    }
  }

  if (exportedDocs.length === 0) {
    const exportParams = new URLSearchParams({
      env: includeEnv.toString(),
      records: includeRecords.toString(),
    })
    exportParams.set('include_draft', 'false')
    if (target.supportsBranches) {
      exportParams.set('branch', branch)
    }

    const exportUrl = target.buildPushUrl(exportParams)
    let response: WritebackHttpResponse
    try {
      response = await verboseFetch(
        exportUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          method: 'GET',
        },
        verbose,
        accessToken,
      )
    } catch (error) {
      command.warn(`Failed to fetch server-formatted documents for writeback: ${(error as Error).message}`)
      return done()
    }

    if (!response.ok) {
      command.warn(`Failed to fetch server-formatted documents for writeback (${response.status})`)
      return done()
    }

    const responseText = await response.text()
    exportedDocs = parseExportDocuments(responseText)
    pathLabel = 'export'
    if (exportedDocs.length === 0) {
      const preview = responseText.trim().slice(0, 200).replaceAll('\n', String.raw`\n`)
      command.warn(
        `Writeback: export contained no XanoScript documents (${pushedFiles.size} pushed). Response starts with: ${preview || '(empty)'}`,
      )
      return done()
    }
  }

  const matcher = indexLocalDocuments(pushedFiles, localContents)
  const matched = new Set<string>()
  for (const doc of exportedDocs) {
    const filePath = resolveMatchedPath(doc, matcher)
    if (filePath) matched.add(filePath)
  }

  const writebacks = selectWritebacks(exportedDocs, pushedFiles, localContents, {includeRecords})

  if (writebackDiff) {
    for (const {content, filePath} of writebacks) {
      const local = localContents.get(filePath) ?? ''
      const rel = inputDir ? relPathOf(filePath) : filePath.split(/[\\/]/).pop() || 'file.xs'
      const destBase = join(writebackDiff, rel)
      try {
        fs.mkdirSync(join(destBase, '..'), {recursive: true})
        fs.writeFileSync(`${destBase}.local.xs`, local, 'utf8')
        fs.writeFileSync(`${destBase}.server.xs`, content.trim(), 'utf8')
      } catch (error) {
        command.warn(`Failed to write writeback-diff for ${filePath}: ${(error as Error).message}`)
      }
    }
  }

  for (const {content, filePath} of writebacks) {
    // Same bytes `pull` writes: the trimmed document, no trailing newline.
    const bytes = content.trim()
    // Re-check right before writing: the fetch above can take minutes.
    let current: null | string = null
    try {
      current = fs.readFileSync(filePath, 'utf8')
    } catch {
      // Treated as changed below.
    }

    if (current !== localContents.get(filePath)) {
      command.warn(`Writeback: skipped ${relPathOf(filePath)}; it changed after it was read for the push`)
      continue
    }

    try {
      fs.writeFileSync(filePath, bytes, 'utf8')
      written.push({content: bytes, filePath})
    } catch (error) {
      command.warn(`Failed to write formatted document to ${filePath}: ${(error as Error).message}`)
    }
  }

  if (written.length > 0) {
    log(`Wrote ${written.length} formatted file${written.length === 1 ? '' : 's'} (${pathLabel}${elapsedLabel()})`)
    return done()
  }

  if (matched.size === 0) {
    command.warn(
      `Writeback: fetched ${exportedDocs.length} documents, but none matched the ${pushedFiles.size} pushed file${pushedFiles.size === 1 ? '' : 's'}${elapsedLabel()}`,
    )
    return done()
  }

  log(`Writeback: ${matched.size} pushed file${matched.size === 1 ? '' : 's'} already match the server export${elapsedLabel()}`)
  return done()
}

// ── Error Handlers ──────────────────────────────────────────────────────────

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
    UND_ERR_INVALID_ARG: `Your Node runtime rejected the CLI's HTTP dispatcher. Update the CLI, or run it under Node 24 (see DEV-7773).`,
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

/** Stop with the target's own guidance when it recognises this refusal. */
function refuseIfExplained(command: Command, target: PushTarget, status: number, body: string): void {
  let message = body
  let payload: unknown
  try {
    const parsed = JSON.parse(body)
    if (typeof parsed?.message === 'string') message = parsed.message
    payload = parsed?.payload
  } catch {
    // Not JSON
  }

  const refusal = payload as Record<string, unknown> | undefined
  if (status === 403 && refusal?.code === 'policy_gate') throw new PushPolicyGateError(refusal, message === body ? undefined : message)
  // The plan's policy cap: the platform's message names the plan, its cap and the remedy, and the
  // push itself would be refused the same way, so the preview stops here rather than skipping.
  if (status === 403 && refusal?.code === 'policy_plan_limit') command.error(`Push refused (${status}): ${message}`)
  if (refusal?.code === 'policy_gate_transaction_required') {
    command.error('Push refused: the live branch policy gate requires a transaction. Remove --no-transaction and retry. Nothing was imported.')
  }

  const guidance = target.explainRefusal?.(status, payload)
  if (guidance) command.error(`Push refused (${status}): ${message}${guidance}`)
}

/** `: <server message>` from a failed preview's JSON body, or '' when it carries none. */
function previewFailureReason(errorText: string): string {
  try {
    const errorJson = JSON.parse(errorText)
    if (typeof errorJson?.message === 'string' && errorJson.message.trim()) return `: ${errorJson.message.trim().replace(/\.$/, '')}`
  } catch {
    // Not JSON
  }

  return ''
}

async function handleDryRunError(
  response: Response,
  command: Command,
  target: PushTarget,
  {log, verbose}: {log: (msg: string) => void; verbose: boolean},
): Promise<void> {
  const errorText = await response.text()
  refuseIfExplained(command, target, response.status, errorText)

  if (response.status === 404) {
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.message) {
        command.error(errorJson.message)
      }
    } catch {
      // Not JSON
    }

    if (target.supportsBranches) {
      command.error('Workspace not found. Check the workspace ID and try again.')
    }

    log('')
    log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
    log('')
  } else {
    // Check if push is disabled
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.message?.includes('Push is disabled')) {
        log('')
        log(
          ux.colorize(
            'red',
            ux.colorize(
              'bold',
              'Direct push is disabled to protect your production workspace from unintended changes.',
            ),
          ),
        )
        log(
          ux.colorize(
            'dim',
            'Use your sandbox environment to test and review changes before applying them to your production workspace.',
          ),
        )
        log('')
        log(ux.colorize('dim', 'To apply changes to the workspace, use the sandbox review flow:'))
        log(
          `  ${ux.colorize('cyan', 'xano sandbox push')}    ${ux.colorize('dim', '— push changes to your sandbox')}`,
        )
        log(
          `  ${ux.colorize('cyan', 'xano sandbox review')}  ${ux.colorize('dim', '— edit any logic, inspect the snapshot diff, and promote changes to the workspace')}`,
        )
        log('')
        log(
          ux.colorize(
            'dim',
            'To enable direct push, go to Workspace Settings → CLI → Allow Direct Workspace Push.',
          ),
        )
        log('')
        log(
          ux.colorize(
            'dim',
            "Note: Free plan instances don't include sandbox environments, so direct push is always enabled.",
          ),
        )
        log('')
        process.exit(0)
      }
    } catch {
      // Not JSON, fall through
    }

    command.warn(`Push preview failed (${response.status})${previewFailureReason(errorText)}. Skipping preview.`)
    if (verbose) {
      log(ux.colorize('dim', errorText))
    }
  }

  await confirmOrAbort(command, log)
}

async function confirmOrAbort(
  command: Command,
  log: (msg: string) => void,
): Promise<void> {
  if (process.stdin.isTTY) {
    const confirmed = await confirm('Proceed with push?')
    if (!confirmed) {
      log('Push cancelled.')
      command.exit(0)
    }
  } else {
    command.error('Non-interactive environment detected. Use --force to skip confirmation.')
  }
}

function handlePushError(
  response: Response,
  errorText: string,
  documentEntries: Array<{content: string; filePath: string}>,
  inputDir: string,
  command: Command,
): never {
  let errorMessage = `Push failed (${response.status})`

  try {
    const errorJson = JSON.parse(errorText)
    errorMessage += `: ${errorJson.message}`
    if (errorJson.payload?.param) {
      errorMessage += `\n  Parameter: ${errorJson.payload.param}`
    }

    // Provide guidance when push is disabled (workspace-specific)
    if (errorJson.message?.includes('Push is disabled')) {
      command.error(
        `Direct push is disabled to protect your production workspace from unintended changes.\n` +
          `Use your sandbox environment to test and review changes before applying them to your production workspace.\n\n` +
          `Alternatively, use sandbox commands:\n` +
          `  xano sandbox push <directory>\n` +
          `  xano sandbox review\n\n` +
          `To enable direct push, go to Workspace Settings → CLI → Allow Direct Workspace Push.\n\n` +
          `Note: Free plan instances don't include sandbox environments, so direct push is always enabled.`,
      )
    }
  } catch {
    errorMessage += `\n${errorText}`
  }

  // Provide guidance when sandbox access is denied (free plan restriction)
  if (response.status === 500 && errorMessage.includes('Access Denied')) {
    command.error('Sandbox is not available on the Free plan. Upgrade your plan to use sandbox features.')
  }

  // Surface local files involved in duplicate GUID errors
  const guidMatch = errorMessage.match(/Duplicate \w+ guid: (\S+)/)
  if (guidMatch) {
    const dupeFiles = findFilesWithGuid(documentEntries, guidMatch[1])
    if (dupeFiles.length > 0) {
      const relPaths = dupeFiles.map((f) => relative(inputDir, f))
      errorMessage += `\n  Local files with this GUID:\n${relPaths.map((f) => `    ${f}`).join('\n')}`
    }
  }

  command.error(errorMessage)
}

export {parseExportDocuments, preserveLocalTableRecords, selectWritebacks} from './export-compare.js'