import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {findFilesWithGuid} from '../../../utils/document-parser.js'

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

export default class Push extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Directory containing documents to push (as produced by tenant pull or workspace pull)',
      required: true,
    }),
  }
  static override description = 'Push local documents to a tenant via the Xano Metadata API multidoc endpoint'
  static override examples = [
    `$ xano tenant push ./my-workspace -t my-tenant
Pushed 42 documents to tenant my-tenant from ./my-workspace
`,
    `$ xano tenant push ./output -t my-tenant -w 40
Pushed 15 documents to tenant my-tenant from ./output
`,
    `$ xano tenant push ./backup -t my-tenant --profile production
Pushed 58 documents to tenant my-tenant from ./backup
`,
    `$ xano tenant push ./my-workspace -t my-tenant --records
Include table records in import
`,
    `$ xano tenant push ./my-workspace -t my-tenant --env
Include environment variables in import
`,
    `$ xano tenant push ./my-workspace -t my-tenant --truncate
Truncate all table records before importing
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    env: Flags.boolean({
      default: false,
      description: 'Include environment variables in import',
      required: false,
    }),
    records: Flags.boolean({
      default: false,
      description: 'Include records in import',
      required: false,
    }),
    tenant: Flags.string({
      char: 't',
      description: 'Tenant name to push to',
      required: true,
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
          `  1. Provide it as a flag: xano tenant push <directory> -t <tenant_name> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    const tenantName = flags.tenant

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

    // Construct the API URL
    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      records: flags.records.toString(),
      transaction: flags.transaction.toString(),
      truncate: flags.truncate.toString(),
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/multidoc?${queryParams.toString()}`

    // POST the multidoc to the API
    const requestHeaders = {
      accept: 'application/json',
      Authorization: `Bearer ${profile.access_token}`,
      'Content-Type': 'text/x-xanoscript',
    }

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

      // Parse the response (suppress raw output; only show in verbose mode)
      const responseText = await response.text()
      if (responseText && responseText !== 'null' && flags.verbose) {
        this.log(responseText)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to push multidoc: ${error.message}`)
      } else {
        this.error(`Failed to push multidoc: ${String(error)}`)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    this.log(`Pushed ${documentEntries.length} documents to tenant ${tenantName} from ${args.directory} in ${elapsed}s`)
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
