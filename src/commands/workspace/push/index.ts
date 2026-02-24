import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {buildDocumentKey, parseDocument} from '../../../utils/document-parser.js'

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

export default class Push extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Directory containing documents to push (as produced by workspace pull)',
      required: true,
    }),
  }
  static override description = 'Push local documents to a workspace via the Xano Metadata API multidoc endpoint'
  static override examples = [
    `$ xano workspace push ./my-workspace
Pushed 42 documents from ./my-workspace
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
    `$ xano workspace push ./my-functions --partial
Push some files without a workspace block (implies --no-delete)
`,
    `$ xano workspace push ./my-workspace --no-delete
Patch files without deleting existing workspace objects
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
    `$ xano workspace push ./my-workspace --truncate --no-records
Truncate all table records without importing new ones
`,
    `$ xano workspace push ./my-workspace --no-records --no-env
Push schema only, skip records and environment variables
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
      allowNo: true,
      default: false,
      description: 'Delete workspace objects not included in the push (default: false)',
      required: false,
    }),
    env: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Include environment variables in import (default: true, use --no-env to exclude)',
      required: false,
    }),
    partial: Flags.boolean({
      default: false,
      description: 'Partial push — workspace block is not required, existing objects are kept (implies --no-delete)',
      required: false,
    }),
    records: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Include records in import (default: true, use --no-records to exclude)',
      required: false,
    }),
    'sync-guids': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Write server-assigned GUIDs back to local files (use --no-sync-guids to skip)',
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
    const files = this.collectFiles(inputDir)

    if (files.length === 0) {
      this.error(`No .xs files found in ${args.directory}`)
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

    const multidoc = documentEntries.map((d) => d.content).join('\n---\n')

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

    // --partial implies --no-delete
    const shouldDelete = flags.partial ? false : flags.delete

    // Construct the API URL
    const queryParams = new URLSearchParams({
      branch,
      delete: shouldDelete.toString(),
      env: flags.env.toString(),
      partial: flags.partial.toString(),
      records: flags.records.toString(),
      truncate: flags.truncate.toString(),
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc?${queryParams.toString()}`

    // POST the multidoc to the API
    const requestHeaders = {
      accept: 'application/json',
      Authorization: `Bearer ${profile.access_token}`,
      'Content-Type': 'text/x-xanoscript',
    }

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
      if (flags['sync-guids'] && guidMap.length > 0) {
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

    this.log(`Pushed ${documentEntries.length} documents from ${args.directory}`)
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
