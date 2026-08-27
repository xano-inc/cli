import {Command, ux} from '@oclif/core'
import {minimatch} from 'minimatch'
import * as fs from 'node:fs'
import {join, relative} from 'node:path'

import {buildDocumentKey, findFilesWithGuid, parseDocument} from './document-parser.js'
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
import {describeNetworkError} from './network-error.js'
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
export function applyFilters(
  files: string[],
  inputDir: string,
  include: string[] | undefined,
  exclude: string[] | undefined,
  log: (msg: string) => void,
): string[] {
  let filtered = files
  const totalCount = files.length

  if (include && include.length > 0) {
    filtered = filtered.filter((f) => {
      const rel = relative(inputDir, f)
      return include.some((pattern) => minimatch(rel, pattern, {matchBase: true}))
    })

    log('')
    log(`  ${ux.colorize('dim', 'Include:')} ${include.map((p) => ux.colorize('cyan', p)).join(', ')}`)
    log(`  ${ux.colorize('dim', 'Matched:')} ${ux.colorize('bold', String(filtered.length))} of ${totalCount} files`)
  }

  if (exclude && exclude.length > 0) {
    const beforeCount = filtered.length
    filtered = filtered.filter((f) => {
      const rel = relative(inputDir, f)
      return !exclude.some((pattern) => minimatch(rel, pattern, {matchBase: true}))
    })

    log('')
    log(`  ${ux.colorize('dim', 'Exclude:')} ${exclude.map((p) => ux.colorize('cyan', p)).join(', ')}`)
    log(
      `  ${ux.colorize('dim', 'Kept:')}    ${ux.colorize('bold', String(filtered.length))} of ${beforeCount} files (excluded ${beforeCount - filtered.length})`,
    )
  }

  return filtered
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

          renderPreview(preview, shouldDelete, target, flags.verbose, isPartial, log)

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
        }

        if (updatedCount > 0) {
          log(`Synced ${updatedCount} GUIDs to local files`)
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
