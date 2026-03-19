import {Args, Flags, ux} from '@oclif/core'
import * as yaml from 'js-yaml'
import {minimatch} from 'minimatch'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {buildDocumentKey, findFilesWithGuid, parseDocument} from '../../../utils/document-parser.js'

interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
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
  workspace_name?: string
  operations: DryRunOperation[]
  summary: Record<string, DryRunSummary>
}

export default class Push extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Directory containing documents to push (as produced by workspace pull)',
      required: true,
    }),
  }
  static override description =
    'Push local documents to a workspace. By default, only changed files are pushed (partial mode). Use --sync to push all files. Shows a preview of changes before pushing unless --force is specified. Use --dry-run to preview only.'
  static override examples = [
    `$ xano workspace push ./my-workspace
Push only changed files (default partial mode)
`,
    `$ xano workspace push ./my-workspace --sync
Push all files to the workspace
`,
    `$ xano workspace push ./my-workspace --sync --delete
Push all files and delete remote objects not included
`,
    `$ xano workspace push ./my-workspace --dry-run
Preview changes without pushing
`,
    `$ xano workspace push ./my-workspace --force
Skip preview and push immediately (for CI/CD)
`,
    `$ xano workspace push ./output -w 40
Pushed 15 documents from ./output
`,
    `$ xano workspace push ./backup --profile production
Pushed 58 documents from ./backup
`,
    `$ xano workspace push ./my-workspace -b dev
Pushed 42 documents from ./my-workspace
`,
    `$ xano workspace push ./my-workspace --no-records
Push schema only, skip importing table records
`,
    `$ xano workspace push ./my-workspace --no-env
Push without overwriting environment variables
`,
    `$ xano workspace push ./my-workspace --truncate
Truncate all table records before importing
`,
    `$ xano workspace push ./my-workspace -i "**/func*"
Push only files matching the glob pattern
`,
    `$ xano workspace push ./my-workspace -i "function/*" -i "table/*"
Push files matching multiple patterns
`,
    `$ xano workspace push ./my-workspace -e "table/*"
Push all files except tables
`,
    `$ xano workspace push ./my-workspace -i "function/*" -e "**/test*"
Push functions but exclude test files
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch name (optional if set in profile, defaults to live)',
      required: false,
    }),
    delete: Flags.boolean({
      default: false,
      description: 'Delete workspace objects not included in the push (requires --sync)',
      required: false,
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Show preview of changes without pushing (exit after preview)',
      required: false,
    }),
    env: Flags.boolean({
      default: false,
      description: 'Include environment variables in import',
      required: false,
    }),
    sync: Flags.boolean({
      default: false,
      description: 'Full push — send all files, not just changed ones. Required for --delete.',
      required: false,
    }),
    records: Flags.boolean({
      default: false,
      description: 'Include records in import',
      required: false,
    }),
    guids: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Write server-assigned GUIDs back to local files (use --no-guids to skip)',
      required: false,
    }),
    transaction: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Wrap import in a database transaction (use --no-transaction for debugging purposes)',
      required: false,
    }),
    truncate: Flags.boolean({
      default: false,
      description: 'Truncate all table records before importing',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    exclude: Flags.string({
      char: 'e',
      description:
        'Glob pattern to exclude files (e.g. "table/*", "**/test*"). Matched against relative paths from the push directory.',
      multiple: true,
      required: false,
    }),
    include: Flags.string({
      char: 'i',
      description:
        'Glob pattern to include files (e.g. "**/func*", "table/*.xs"). Matched against relative paths from the push directory.',
      multiple: true,
      required: false,
    }),
    force: Flags.boolean({
      default: false,
      description: 'Skip preview and confirmation prompt (for CI/CD pipelines)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)

    // Get profile name (default or from flag/env)
    const profileName = flags.profile || this.getDefaultProfile()

    // Load credentials
    const credentials = this.loadCredentials()

    // Get the profile configuration
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
          `Create a profile using 'xano profile:create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    // Validate required fields
    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano workspace push <directory> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Resolve the input directory
    const inputDir = path.resolve(args.directory)

    if (!fs.existsSync(inputDir)) {
      this.error(`Directory not found: ${inputDir}`)
    }

    if (!fs.statSync(inputDir).isDirectory()) {
      this.error(`Not a directory: ${inputDir}`)
    }

    // Collect all .xs files from the directory tree
    const allFiles = this.collectFiles(inputDir)
    let files = allFiles

    // Apply glob include(s) if specified
    if (flags.include && flags.include.length > 0) {
      files = files.filter((f) => {
        const rel = path.relative(inputDir, f)
        return flags.include!.some((pattern) => minimatch(rel, pattern, {matchBase: true}))
      })

      this.log('')
      this.log(`  ${ux.colorize('dim', 'Include:')} ${flags.include.map((p) => ux.colorize('cyan', p)).join(', ')}`)
      this.log(
        `  ${ux.colorize('dim', 'Matched:')} ${ux.colorize('bold', String(files.length))} of ${allFiles.length} files`,
      )
    }

    // Apply glob exclude(s) if specified
    if (flags.exclude && flags.exclude.length > 0) {
      const beforeCount = files.length
      files = files.filter((f) => {
        const rel = path.relative(inputDir, f)
        return !flags.exclude!.some((pattern) => minimatch(rel, pattern, {matchBase: true}))
      })

      this.log('')
      this.log(`  ${ux.colorize('dim', 'Exclude:')} ${flags.exclude.map((p) => ux.colorize('cyan', p)).join(', ')}`)
      this.log(
        `  ${ux.colorize('dim', 'Kept:')}    ${ux.colorize('bold', String(files.length))} of ${beforeCount} files (excluded ${beforeCount - files.length})`,
      )
    }

    if (files.length === 0) {
      this.error(
        flags.include || flags.exclude
          ? `No .xs files remain after ${[flags.include ? `include ${flags.include.join(', ')}` : '', flags.exclude ? `exclude ${flags.exclude.join(', ')}` : ''].filter(Boolean).join(' and ')} in ${args.directory}`
          : `No .xs files found in ${args.directory}`,
      )
    }

    // Read each file and track file path alongside content
    const documentEntries: Array<{content: string; filePath: string}> = []
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8').trim()
      if (content) {
        documentEntries.push({content, filePath})
      }
    }

    if (documentEntries.length === 0) {
      this.error(`All .xs files in ${args.directory} are empty`)
    }

    let multidoc = documentEntries.map((d) => d.content).join('\n---\n')

    // Build lookup map from document key to file path (for GUID writeback)
    const documentFileMap = new Map<string, string>()
    for (const entry of documentEntries) {
      const parsed = parseDocument(entry.content)
      if (parsed) {
        const key = buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
        documentFileMap.set(key, entry.filePath)
      }
    }

    // Determine branch from flag or profile
    const branch = flags.branch || profile.branch || ''

    const isPartial = !flags.sync

    if (flags.delete && isPartial) {
      this.error('Cannot use --delete without --sync')
    }

    const shouldDelete = isPartial ? false : flags.delete

    // Construct the API URL
    const queryParams = new URLSearchParams({
      branch,
      delete: shouldDelete.toString(),
      env: flags.env.toString(),
      partial: isPartial.toString(),
      records: flags.records.toString(),
      transaction: flags.transaction.toString(),
      truncate: flags.truncate.toString(),
    })

    // POST the multidoc to the API
    const requestHeaders = {
      accept: 'application/json',
      Authorization: `Bearer ${profile.access_token}`,
      'Content-Type': 'text/x-xanoscript',
    }

    // Preview mode: show what would change before pushing
    let dryRunPreview: DryRunResult | null = null
    if (flags['dry-run'] || !flags.force) {
      const dryRunParams = new URLSearchParams(queryParams)
      // Request delete info in dry-run so we can show remote-only items (skip for partial)
      if (!isPartial) {
        dryRunParams.set('delete', 'true')
      }
      const dryRunUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc/dry-run?${dryRunParams.toString()}`

      try {
        const dryRunResponse = await this.verboseFetch(
          dryRunUrl,
          {
            body: multidoc,
            headers: requestHeaders,
            method: 'POST',
          },
          flags.verbose,
          profile.access_token,
        )

        if (!dryRunResponse.ok) {
          if (dryRunResponse.status === 404) {
            // Check if the workspace itself doesn't exist
            const wsCheckUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}`
            const wsCheckResponse = await this.verboseFetch(
              wsCheckUrl,
              {
                headers: {
                  accept: 'application/json',
                  Authorization: `Bearer ${profile.access_token}`,
                },
                method: 'GET',
              },
              flags.verbose,
              profile.access_token,
            )

            if (!wsCheckResponse.ok) {
              this.error(`Workspace ${workspaceId} not found on this instance.`)
            }

            // Workspace exists — dry-run endpoint just not available
            this.log('')
            this.log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
            this.log('')
          } else {
            const errorText = await dryRunResponse.text()
            this.warn(`Push preview failed (${dryRunResponse.status}). Skipping preview.`)
            if (flags.verbose) {
              this.log(ux.colorize('dim', errorText))
            }
          }

          if (process.stdin.isTTY) {
            const confirmed = await this.confirm('Proceed with push?')
            if (!confirmed) {
              this.log('Push cancelled.')
              return
            }
          } else {
            this.error('Non-interactive environment detected. Use --force to skip confirmation.')
          }

          // Skip the rest of preview logic
        } else {
          const dryRunText = await dryRunResponse.text()
          const preview = JSON.parse(dryRunText) as DryRunResult
          dryRunPreview = preview

          // Check if the server returned a valid dry-run response
          if (preview && preview.summary) {
            this.renderPreview(preview, shouldDelete, workspaceId, flags.verbose, isPartial)

            // Check for critical errors that must block the push
            const criticalOps = preview.operations.filter(
              (op) => op.details?.includes('exception:') || op.details?.includes('mvp:placeholder'),
            )

            if (criticalOps.length > 0) {
              this.log('')
              this.log(ux.colorize('red', ux.colorize('bold', '=== CRITICAL ERRORS ===')))
              this.log('')
              this.log(
                ux.colorize('red', 'The following items contain syntax errors or unresolved placeholder statements'),
              )
              this.log(ux.colorize('red', 'that would corrupt data if pushed. These must be resolved first:'))
              this.log('')

              for (const op of criticalOps) {
                this.log(`  ${ux.colorize('red', 'BLOCKED'.padEnd(16))} ${op.type.padEnd(18)} ${op.name}`)
                if (op.details) {
                  this.log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', op.details)}`)
                }
              }

              this.log('')
              this.log(ux.colorize('red', `Push blocked: ${criticalOps.length} critical error(s) found.`))

              if (!flags.force) {
                return
              }

              this.log(ux.colorize('yellow', 'Proceeding anyway due to --force flag.'))
            }

            // Check if there are any actual changes (exclude deletes when --delete is off)
            const hasChanges = Object.values(preview.summary).some(
              (c) => c.created > 0 || c.updated > 0 || (shouldDelete && c.deleted > 0) || c.truncated > 0,
            )

            // Detect if local files contain records that would be imported
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
              this.log('')
              this.log(ux.colorize('bold', '--- Records ---'))
              this.log('')
              for (const t of tablesWithRecords) {
                this.log(
                  `  ${ux.colorize('yellow', 'UPSERT'.padEnd(16))} ${'table'.padEnd(18)} ${t.name} (${t.records} records)`,
                )
              }

              this.log('')
            }

            if (!hasChanges && !hasLocalRecords) {
              this.log('')
              this.log('No changes to push.')
              return
            }

            if (flags['dry-run']) {
              return
            }

            const hasDestructive = preview.operations.some(
              (op: {action: string}) =>
                (shouldDelete && (op.action === 'delete' || op.action === 'cascade_delete')) ||
                op.action === 'truncate' ||
                op.action === 'drop_field' ||
                op.action === 'alter_field',
            )
            const message = hasDestructive
              ? 'Proceed with push? This includes DESTRUCTIVE operations listed above.'
              : 'Proceed with push?'

            if (process.stdin.isTTY) {
              const confirmed = await this.confirm(message)
              if (!confirmed) {
                this.log('Push cancelled.')
                return
              }
            } else {
              this.error('Non-interactive environment detected. Use --force to skip confirmation.')
            }
          } else {
            // Server returned unexpected response (older version)
            this.log('')
            this.log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
            this.log('')
            if (process.stdin.isTTY) {
              const confirmed = await this.confirm('Proceed with push?')
              if (!confirmed) {
                this.log('Push cancelled.')
                return
              }
            } else {
              this.error('Non-interactive environment detected. Use --force to skip confirmation.')
            }
          }
        }
      } catch (error) {
        // Ctrl+C or SIGINT — exit cleanly
        if ((error as Error).name === 'AbortError' || (error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
          this.log('\nPush cancelled.')
          return
        }

        // Re-throw oclif errors (e.g. from this.error()) so they exit properly
        if (error instanceof Error && 'oclif' in error) {
          throw error
        }

        // If dry-run fails unexpectedly, proceed without preview
        this.log('')
        this.log(ux.colorize('dim', 'Push preview not yet available on this instance.'))
        if (flags.verbose) {
          this.log(ux.colorize('dim', `  ${(error as Error).message}`))
        }

        this.log('')
        if (process.stdin.isTTY) {
          const confirmed = await this.confirm('Proceed with push?')
          if (!confirmed) {
            this.log('Push cancelled.')
            return
          }
        } else {
          this.error('Non-interactive environment detected. Use --force to skip confirmation.')
        }
      }
    }

    // For partial pushes, filter to only changed documents
    if (isPartial && dryRunPreview) {
      const changedKeys = new Set(
        dryRunPreview.operations
          .filter((op) => op.action !== 'unchanged' && op.action !== 'delete' && op.action !== 'cascade_delete')
          .map((op) => `${op.type}:${op.name}`),
      )

      const filteredEntries = documentEntries.filter((entry) => {
        const parsed = parseDocument(entry.content)
        if (!parsed) return true
        // For queries, operation name includes verb (e.g., "path/{id} DELETE")
        const opName = parsed.verb ? `${parsed.name} ${parsed.verb}` : parsed.name
        if (changedKeys.has(`${parsed.type}:${opName}`)) return true
        // Keep table documents that contain records when --records is active
        if (flags.records && parsed.type === 'table' && /\bitems\s*=\s*\[/m.test(entry.content)) return true
        return false
      })

      if (filteredEntries.length === 0) {
        this.log('No changes to push.')
        return
      }

      multidoc = filteredEntries.map((d) => d.content).join('\n---\n')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc?${queryParams.toString()}`
    const startTime = Date.now()

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: multidoc,
          headers: requestHeaders,
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Push failed (${response.status})`

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage += `: ${errorJson.message}`
          if (errorJson.payload?.param) {
            errorMessage += `\n  Parameter: ${errorJson.payload.param}`
          }
        } catch {
          errorMessage += `\n${errorText}`
        }

        // Surface local files involved in duplicate GUID errors
        const guidMatch = errorMessage.match(/Duplicate \w+ guid: (\S+)/)
        if (guidMatch) {
          const dupeFiles = findFilesWithGuid(documentEntries, guidMatch[1])
          if (dupeFiles.length > 0) {
            const relPaths = dupeFiles.map((f) => path.relative(inputDir, f))
            errorMessage += `\n  Local files with this GUID:\n${relPaths.map((f) => `    ${f}`).join('\n')}`
          }
        }

        this.error(errorMessage)
      }

      // Parse the response for GUID map
      const responseText = await response.text()
      let guidMap: GuidMapEntry[] = []

      if (responseText && responseText !== 'null') {
        try {
          const responseJson = JSON.parse(responseText)
          if (responseJson?.guid_map && Array.isArray(responseJson.guid_map)) {
            guidMap = responseJson.guid_map
          }
        } catch {
          // Response is not JSON (e.g., older server version)
          if (flags.verbose) {
            this.log('Server response is not JSON; skipping GUID sync')
          }
        }
      }

      // Write GUIDs back to local files
      if (flags.guids && guidMap.length > 0) {
        // Build a secondary lookup by type:name only (without verb/api_group)
        // for cases where the server omits those fields
        const baseKeyMap = new Map<string, string>()
        for (const [key, fp] of documentFileMap) {
          const baseKey = key.split(':').slice(0, 2).join(':')
          // Only use base key if there's no ambiguity (single entry per base key)
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

          // Fallback: try type:name only if full key didn't match
          if (!filePath) {
            const baseKey = `${entry.type}:${entry.name}`
            const basePath = baseKeyMap.get(baseKey)
            if (basePath) {
              filePath = basePath
            }
          }

          if (!filePath) {
            if (flags.verbose) {
              this.log(`  No local file found for ${entry.type} "${entry.name}", skipping GUID sync`)
            }

            continue
          }

          try {
            const updated = syncGuidToFile(filePath, entry.guid)
            if (updated) updatedCount++
          } catch (error) {
            this.warn(`Failed to sync GUID to ${filePath}: ${(error as Error).message}`)
          }
        }

        if (updatedCount > 0) {
          this.log(`Synced ${updatedCount} GUIDs to local files`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to push multidoc: ${error.message}`)
      } else {
        this.error(`Failed to push multidoc: ${String(error)}`)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const pushedCount = multidoc.split('\n---\n').length
    this.log(`Pushed ${pushedCount} documents from ${args.directory} in ${elapsed}s`)
  }

  private async confirm(message: string): Promise<boolean> {
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

  private renderPreview(
    result: DryRunResult,
    willDelete: boolean,
    workspaceId: string,
    verbose = false,
    partial = false,
  ): void {
    const typeLabels: Record<string, string> = {
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

    this.log('')
    const wsLabel = result.workspace_name ? `${result.workspace_name} (${workspaceId})` : `Workspace ${workspaceId}`
    this.log(ux.colorize('bold', `=== Push Preview: ${wsLabel} ===`))
    if (!partial) {
      this.log(ux.colorize('red', '  --sync: all documents will be sent, including unchanged'))
    }

    this.log('')

    for (const [type, counts] of Object.entries(result.summary)) {
      const label = typeLabels[type] || type
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
        this.log(`  ${label.padEnd(20)} ${parts.join('  ')}`)
      }
    }

    const changes = result.operations.filter(
      (op: {action: string}) =>
        op.action === 'create' || op.action === 'update' || op.action === 'add_field' || op.action === 'update_field',
    )
    const destructive = result.operations.filter(
      (op: {action: string}) =>
        op.action === 'delete' ||
        op.action === 'cascade_delete' ||
        op.action === 'truncate' ||
        op.action === 'drop_field' ||
        op.action === 'alter_field',
    )

    if (changes.length > 0) {
      this.log('')
      this.log(ux.colorize('bold', '--- Changes ---'))
      this.log('')

      for (const op of changes) {
        const color = op.action === 'update' || op.action === 'update_field' ? 'yellow' : 'green'
        const actionLabel = op.action.toUpperCase()
        this.log(`  ${ux.colorize(color, actionLabel.padEnd(16))} ${op.type.padEnd(18)} ${op.name}`)
        if (op.details) {
          this.log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', op.details)}`)
        }

        if (verbose && op.reason) {
          this.log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', `reason: ${op.reason}`)}`)
        }
      }
    }

    // Split destructive ops by category
    const deleteOps = destructive.filter(
      (op: {action: string}) => op.action === 'delete' || op.action === 'cascade_delete',
    )
    const alwaysDestructive = destructive.filter(
      (op: {action: string}) => op.action === 'truncate' || op.action === 'drop_field' || op.action === 'alter_field',
    )

    // Show destructive operations (deletes only when --delete, truncates/drop_field always)
    const shownDestructive = [...(willDelete ? deleteOps : []), ...alwaysDestructive]
    if (shownDestructive.length > 0) {
      this.log('')
      this.log(ux.colorize('bold', '--- Destructive Operations ---'))
      this.log('')

      for (const op of shownDestructive) {
        const color = op.action === 'truncate' || op.action === 'alter_field' ? 'yellow' : 'red'
        const actionLabel = op.action.toUpperCase()
        this.log(`  ${ux.colorize(color, actionLabel.padEnd(16))} ${op.type.padEnd(18)} ${op.name}`)
        if (op.details) {
          this.log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', op.details)}`)
        }

        if (verbose && op.reason) {
          this.log(`  ${' '.repeat(16)} ${' '.repeat(18)} ${ux.colorize('dim', `reason: ${op.reason}`)}`)
        }
      }
    }

    // Warn about potential field renames (add + drop on same table)
    const addFieldTables = new Set(
      result.operations
        .filter((op: {action: string; name: string}) => op.action === 'add_field')
        .map((op: {name: string}) => op.name),
    )
    const dropFieldTables = new Set(
      result.operations
        .filter((op: {action: string; name: string}) => op.action === 'drop_field')
        .map((op: {name: string}) => op.name),
    )
    const renameCandidates = [...addFieldTables].filter((t) => dropFieldTables.has(t))
    if (renameCandidates.length > 0) {
      this.log('')
      this.log(
        ux.colorize(
          'yellow',
          `  Note: Table(s) ${renameCandidates.map((t) => `"${t}"`).join(', ')} have both added and dropped fields.`,
        ),
      )
      this.log(
        ux.colorize('yellow', '  If this is intended to be a field rename, use the Xano Admin — renaming is not'),
      )
      this.log(ux.colorize('yellow', '  currently available through the CLI or Metadata API.'))
    }

    // Show remote-only items when not using --delete (skip for partial pushes)
    if (!willDelete && !partial && deleteOps.length > 0) {
      this.log('')
      this.log(ux.colorize('dim', '--- Remote Only (not included in push) ---'))
      this.log('')

      for (const op of deleteOps) {
        this.log(ux.colorize('dim', `  ${op.type.padEnd(18)} ${op.name}`))
      }

      this.log('')
      this.log(ux.colorize('dim', `  Use --delete to remove these ${deleteOps.length} item(s) from remote.`))
    }

    this.log('')
  }

  /**
   * Recursively collect all .xs files from a directory, sorted by
   * type subdirectory name then filename for deterministic ordering.
   */
  private collectFiles(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir, {withFileTypes: true})

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.collectFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.xs')) {
        files.push(fullPath)
      }
    }

    return files.sort()
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}\n` + `Create a profile using 'xano profile:create'`)
    }

    // Read credentials file
    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      return parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }
  }
}

const GUID_REGEX = /guid\s*=\s*(["'])([^"']*)\1/

/**
 * Sync a GUID into a local .xs file. Returns true if the file was modified.
 *
 * - If the file already has a matching GUID, returns false (no change).
 * - If the file has a different GUID, updates it.
 * - If the file has no GUID, inserts one before the final closing brace.
 */
function syncGuidToFile(filePath: string, guid: string): boolean {
  const content = fs.readFileSync(filePath, 'utf8')
  const existingMatch = content.match(GUID_REGEX)

  if (existingMatch) {
    // Already has a GUID
    if (existingMatch[2] === guid) {
      return false // Already matches
    }

    // Update existing GUID
    const updated = content.replace(GUID_REGEX, `guid = "${guid}"`)
    fs.writeFileSync(filePath, updated, 'utf8')
    return true
  }

  // No GUID line exists — insert before the final closing brace of the top-level block
  const lines = content.split('\n')
  let insertIndex = -1

  // Find the last closing brace (top-level block end)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      insertIndex = i
      break
    }
  }

  if (insertIndex === -1) {
    return false // Could not find insertion point
  }

  // Determine indentation from the line above the closing brace
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
