import {Command, ux} from '@oclif/core'
import {minimatch} from 'minimatch'
import * as fs from 'node:fs'
import {join, relative} from 'node:path'

import {buildDocumentKey, findFilesWithGuid, parseDocument} from './document-parser.js'
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
  /** Human-readable label for log messages (e.g., "sandbox environment", "workspace 40") */
  label: string
  /** Does this target support branches? */
  supportsBranches: boolean
  /** Does this target support the partial query param? */
  supportsPartial: boolean
}

export interface PushContext {
  accessToken: string
  branch: string
  command: Command
  inputDir: string
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
  summary: Record<string, DryRunSummary>
  workspace_name?: string
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
  api_group: 'API Groups',
  function: 'Functions',
  mcp_server: 'MCP Servers',
  middleware: 'Middleware',
  query: 'API Endpoints',
  realtime_channel: 'Realtime Channels',
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
  targetLabel: string,
  verbose: boolean,
  partial: boolean,
  log: (msg: string) => void,
): void {
  log('')
  log(ux.colorize('bold', `=== Push Preview: ${targetLabel} ===`))
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

  // ── Collect and filter files ──────────────────────────────────────────

  const allFiles = collectFiles(inputDir)
  const files = applyFilters(allFiles, inputDir, flags.include, flags.exclude, log)

  if (files.length === 0) {
    command.error(
      flags.include || flags.exclude
        ? `No .xs files remain after ${[flags.include ? `include ${flags.include.join(', ')}` : '', flags.exclude ? `exclude ${flags.exclude.join(', ')}` : ''].filter(Boolean).join(' and ')} in ${inputDir}`
        : `No .xs files found in ${inputDir}`,
    )
  }

  // ── Read documents ────────────────────────────────────────────────────

  const documentEntries = readDocuments(files)

  if (documentEntries.length === 0) {
    command.error(`All .xs files in ${inputDir} are empty`)
  }

  let multidoc = documentEntries.map((d) => d.content).join('\n---\n')

  // ── Build document key → file path map (for GUID writeback) ───────────

  const documentFileMap = new Map<string, string>()
  for (const entry of documentEntries) {
    const parsed = parseDocument(entry.content)
    if (parsed) {
      const key = buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
      documentFileMap.set(key, entry.filePath)
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

  // ── Request headers ───────────────────────────────────────────────────

  const requestHeaders = {
    accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'text/x-xanoscript',
  }

  // ── Dry-run / Preview ─────────────────────────────────────────────────

  let dryRunPreview: DryRunResult | null = null
  const dryRunUrl = target.buildDryRunUrl(queryParams)

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

      if (!dryRunResponse.ok) {
        await handleDryRunError(dryRunResponse, command, flags)
        // If we get here, the user confirmed to proceed without preview
      } else {
        const dryRunText = await dryRunResponse.text()
        const preview = JSON.parse(dryRunText) as DryRunResult
        dryRunPreview = preview

        if (preview && preview.summary) {
          renderPreview(preview, shouldDelete, target.label, flags.verbose, isPartial, log)

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

          // Check for actual changes
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

          // Confirm with user
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
        } else {
          // Server returned unexpected response
          log('')
          log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
          log('')
          await confirmOrAbort(command, log)
        }
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
  }

  // ── Show bad references in force mode (preview mode shows them inline) ─

  if (flags.force) {
    const badRefs = checkReferences(documentEntries)
    if (badRefs.length > 0) {
      log('')
      renderBadReferences(badRefs, log)
    }
  }

  // ── Partial push: filter to changed documents only ────────────────────

  if (isPartial && dryRunPreview) {
    const changedKeys = new Set(
      dryRunPreview.operations
        .filter((op) => op.action !== 'unchanged' && op.action !== 'delete' && op.action !== 'cascade_delete')
        .map((op) => `${op.type}:${op.name}`),
    )

    const filteredEntries = documentEntries.filter((entry) => {
      const parsed = parseDocument(entry.content)
      if (!parsed) return true
      const opName = parsed.verb ? `${parsed.name} ${parsed.verb}` : parsed.name
      if (changedKeys.has(`${parsed.type}:${opName}`)) return true
      // Keep table documents that contain records when --records is active
      if (flags.records && parsed.type === 'table' && /\bitems\s*=\s*\[/m.test(entry.content)) return true
      return false
    })

    if (filteredEntries.length === 0) {
      log('No changes to push.')
      return
    }

    multidoc = filteredEntries.map((d) => d.content).join('\n---\n')
  }

  // ── Execute the actual push ───────────────────────────────────────────

  const apiUrl = target.buildPushUrl(queryParams)
  const startTime = Date.now()

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
  } catch (error) {
    if (error instanceof Error && 'oclif' in error) throw error
    if (error instanceof Error) {
      command.error(`Failed to push multidoc: ${error.message}`)
    } else {
      command.error(`Failed to push multidoc: ${String(error)}`)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const pushedCount = multidoc.split('\n---\n').length
  log(`Pushed ${pushedCount} documents to ${target.label} from ${relative(process.cwd(), inputDir) || inputDir} in ${elapsed}s`)
}

// ── Error Handlers ──────────────────────────────────────────────────────────

async function handleDryRunError(
  response: Response,
  command: Command,
  flags: PushFlags,
): Promise<void> {
  const log = command.log.bind(command)

  if (response.status === 404) {
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
        // Exit cleanly — this is workspace-specific, but harmless for sandbox since
        // sandbox won't receive this error
        command.exit(0)
        return
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
