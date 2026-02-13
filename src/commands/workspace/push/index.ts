import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

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
    env: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Include environment variables in import (default: true, use --no-env to exclude)',
      required: false,
    }),
    records: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Include records in import (default: true, use --no-records to exclude)',
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

    // Read each file and join with --- separator
    const documents: string[] = []
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8').trim()
      if (content) {
        documents.push(content)
      }
    }

    if (documents.length === 0) {
      this.error(`All .xs files in ${args.directory} are empty`)
    }

    const multidoc = documents.join('\n---\n')

    // Determine branch from flag or profile
    const branch = flags.branch || profile.branch || ''

    // Construct the API URL
    const queryParams = new URLSearchParams({branch, env: flags.env.toString(), records: flags.records.toString(), truncate: flags.truncate.toString()})
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc?${queryParams.toString()}`

    // POST the multidoc to the API
    const requestHeaders = {
      'accept': 'application/json',
      'Authorization': `Bearer ${profile.access_token}`,
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
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      // Log the response if any
      const responseText = await response.text()
      if (responseText && responseText !== 'null') {
        this.log(responseText)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to push multidoc: ${error.message}`)
      } else {
        this.error(`Failed to push multidoc: ${String(error)}`)
      }
    }

    this.log(`Pushed ${documents.length} documents from ${args.directory}`)
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
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile:create'`,
      )
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
