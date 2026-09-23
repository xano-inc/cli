import {Command, ux} from '@oclif/core'
import {minimatch} from 'minimatch'
import * as fs from 'node:fs'
import {join, relative} from 'node:path'

import {buildDocumentKey, findFilesWithGuid, parseDocument} from './document-parser.js'
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
import {type BadIndex, type BadReference, checkReferences, checkTableIndexes} from './reference-checker.js'

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface PushFlags {
  delete: boolean
  'dry-run': boolean
  env: boolean
  exclude?: string[]
  force: boolean
  guids: boolean
  include?: string[]
  records: boolean
  sync: boolean
  transaction: boolean
  truncate: boolean
  verbose: boolean
}

export interface PushTarget {
  /** Build the dry-run URL. Return null if dry-run is not supported for this target. */
  buildDryRunUrl: (queryParams: URLSearchParams) => null | string
  /** Build the actual push URL */
  buildPushUrl: (queryParams: URLSearchParams) => string
  /** CLI version string */
  cliVersion: string
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

export interface PushContext {
  accessToken: string
  branch: string
  command: Command
  inputDir: string
  /** Optional knowledge sync config. Only workspace push sets this. */
  knowledge?: KnowledgeConfig
  verboseFetch: (url: string, options: RequestInit, verbose: boolean, authToken?: string) => Promise<Response>
}

interface GuidMapEntry {
  api_group?: string
  canonical?: string
  guid: string
  name: string
  type: string
  verb?: string
}

interface DryRunSummary {
  created: number
  deleted: number
  truncated: number
  unchanged: number
  updated: number
}

interface DryRunOperation {
  action: string
  details: string
  name: string
  reason?: string
  type: string
}

interface DryRunResult {
  operations: DryRunOperation[]
  /** True when the sandbox currently holds a different source workspace than the one being pushed. */
  source_workspace_mismatch?: boolean
  summary: Record<string, DryRunSummary>
  workspace_name?: string
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
 * VERIFY the server actually did.
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

    const parsed = parseDocument(content)
    if (!parsed) continue

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

/**
 * Read .xs files into document entries, skipping empty files.
 */
export function readDocuments(files: string[]): Array<{content: string; filePath: string}> {
  const entries: Array<{content: string; filePath: string}> = []
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8').trim()
    if (content) {
      entries.push({content, filePath})
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
  const content = fs.readFileSync(filePath, 'utf8')
  const existingMatch = content.match(GUID_REGEX)

  if (existingMatch) {
    if (existingMatch[2] === guid) {
      return false
    }

    const updated = content.replace(GUID_REGEX, `guid = "${guid}"`)
    fs.writeFileSync(filePath, updated, 'utf8')
    return true
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
    return false
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
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  return true
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
  const content = fs.readFileSync(filePath, 'utf8')
  const existingMatch = content.match(CANONICAL_REGEX)

  if (!existingMatch || existingMatch[2] === canonical) {
    return false
  }

  fs.writeFileSync(filePath, content.replace(CANONICAL_REGEX, `canonical = "${canonical}"`), 'utf8')
  return true
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
      // eslint-disable-next-line camelcase -- external Metadata API field name
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
): Promise<void> {
  const {accessToken, command, inputDir, verboseFetch} = ctx
  const log = command.log.bind(command)

  // ── Collect knowledge entries (before file check so knowledge-only push works) ─

  let knowledgeObjects: LocalKnowledgeObject[] = []
  if (ctx.knowledge) {
    knowledgeObjects = collectKnowledgeObjects(ctx.knowledge.rootDir, flags.include, flags.exclude)
  }

  // ── Collect and filter .xs files ──────────────────────────────────────

  const allFiles = collectFiles(inputDir)
  const files = applyFilters(allFiles, inputDir, flags.include, flags.exclude, log)
  const filteredOut = describeFilteredOut(allFiles, files, inputDir)
  const filteredOutCount = allFiles.length - files.length

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

  if (!knowledgeOnly) {
    documentEntries = readDocuments(files)

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
          return
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
      const refreshed = readDocuments(applyFilters(collectFiles(inputDir), inputDir, flags.include, flags.exclude, () => {}))
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

  // ── Resolve push mode ─────────────────────────────────────────────────

  const isPartial = !flags.sync

  if (flags.delete && isPartial) {
    command.error('Cannot use --delete without --sync')
  }

  const shouldDelete = isPartial ? false : flags.delete

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
  const protectableGuids = filteredOut.map((d) => d.guid).filter((g): g is string => typeof g === 'string' && g.length > 0)
  const protectGuidsParam = protectableGuids.join(',')

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

  let dryRunPreview: DryRunResult | null = null
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
          // refused rather than allowed to delete.
          if (shouldDelete) {
            const endangered = deletesHittingFilteredOut(preview.operations, filteredOut)
            if (endangered.length > 0) {
              log('')
              log(ux.colorize('red', '--- Refusing to push ---'))
              log('')
              log(
                `  --delete would remove ${endangered.length} object(s) that --include/--exclude filtered out:`,
              )
              log('')
              for (const hit of endangered.slice(0, 10)) {
                log(`  ${ux.colorize('red', 'DELETE'.padEnd(8))} ${hit.type.padEnd(18)} ${hit.name}  ${ux.colorize('dim', `(${hit.relPath})`)}`)
              }

              if (endangered.length > 10) {
                log(ux.colorize('dim', `  ... and ${endangered.length - 10} more`))
              }

              log('')
              const unprotectable = filteredOut.filter((d) => !d.guid).length
              if (unprotectable > 0) {
                log(
                  ux.colorize(
                    'dim',
                    `  ${unprotectable} filtered-out document(s) have no guid yet, so the server cannot be told to spare them.`,
                  ),
                )
              }

              if (protectGuidsParam.length > PROTECT_GUIDS_MAX_CHARS) {
                log(ux.colorize('dim', '  Too many filtered-out documents to declare in one request.'))
              }

              log(ux.colorize('dim', '  This instance may also predate protected pushes.'))
              log('')
              command.error('Re-run without --delete, or without the --include/--exclude filter.')
            }
          }

          // Check for bad cross-references using dry-run operations to avoid false positives
          const badRefs = checkReferences(documentEntries, preview.operations)
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
              return
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
                .filter((d) => /^table\s+/m.test(d.content) && /\bitems\s*=\s*\[/m.test(d.content))
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
            return
          }

          if (flags['dry-run']) {
            return
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
                return
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
                return
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
        await handleDryRunError(dryRunResponse, command, flags, target)
        // If we get here, the user confirmed to proceed without preview
      }
    } catch (error) {
      // Ctrl+C or SIGINT
      if ((error as Error).name === 'AbortError' || (error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
        log('\nPush cancelled.')
        return
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
      return
    }

    if (flags['dry-run']) {
      return
    }

    if (process.stdin.isTTY) {
      const confirmed = await confirm('Proceed with push?')
      if (!confirmed) {
        log('Push cancelled.')
        return
      }
    } else {
      command.error('Non-interactive environment detected. Use --force to skip confirmation.')
    }
  }

  // ── Show bad references in force mode (preview mode shows them inline) ─

  if (flags.force && !knowledgeOnly) {
    const badRefs = checkReferences(documentEntries)
    if (badRefs.length > 0) {
      log('')
      renderBadReferences(badRefs, log)
    }
  }

  // ── Partial push: filter to changed documents only ────────────────────

  if (!knowledgeOnly && isPartial && dryRunPreview) {
    const filteredEntries = filterChangedEntries(documentEntries, dryRunPreview.operations, flags.records)

    if (filteredEntries.length === 0 && knowledgeObjects.length === 0) {
      log('No changes to push.')
      return
    }

    if (filteredEntries.length > 0) {
      multidoc = filteredEntries.map((d) => d.content).join('\n---\n')
    } else {
      multidoc = ''
    }
  }

  // ── Execute the actual push ───────────────────────────────────────────

  const startTime = Date.now()
  let pushedDocCount = 0

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
        handlePushError(response, await response.text(), documentEntries, inputDir, command)
      }

      // Parse response for GUID map
      const responseText = await response.text()
      let guidMap: GuidMapEntry[] = []

      if (responseText && responseText !== 'null') {
        try {
          const responseJson = JSON.parse(responseText)
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
          if (!entry.guid) continue

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
          } catch (error) {
            command.warn(`Failed to sync GUID to ${filePath}: ${(error as Error).message}`)
          }

          if (entry.canonical) {
            try {
              const updated = syncCanonicalToFile(filePath, entry.canonical)
              if (updated) canonicalCount++
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
      if (error instanceof Error && 'oclif' in error) throw error
      const elapsedMs = Date.now() - startTime
      command.error(`Failed to push multidoc: ${describeNetworkError(error, apiUrl, elapsedMs)}`)
    }
  }

  // ── Push knowledge ────────────────────────────────────────────────────

  let knowledgeImported = 0
  let knowledgeDeleted = 0

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
      command.error(`Failed to push knowledge: ${describeNetworkError(error, listUrl, elapsedMs)}`)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const parts: string[] = []
  if (!knowledgeOnly) parts.push(`${pushedDocCount} documents`)
  if (ctx.knowledge && (knowledgeObjects.length > 0 || shouldDelete)) {
    const kParts = [`${knowledgeImported} knowledge file${knowledgeImported === 1 ? '' : 's'}`]
    if (shouldDelete && knowledgeDeleted > 0) kParts.push(`${knowledgeDeleted} deleted`)
    parts.push(kParts.join(', '))
  }

  log(`Pushed ${parts.join(' + ')} to ${target.label} from ${relative(process.cwd(), inputDir) || inputDir} in ${elapsed}s`)
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

async function handleDryRunError(
  response: Response,
  command: Command,
  flags: PushFlags,
  target: PushTarget,
): Promise<void> {
  const log = command.log.bind(command)

  if (response.status === 404) {
    const errorText = await response.text()

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
    const errorText = await response.text()

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

    command.warn(`Push preview failed (${response.status}). Skipping preview.`)
    if (flags.verbose) {
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
