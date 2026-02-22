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

interface Release {
  branch?: string
  created_at?: number | string
  description?: string
  hotfix?: boolean
  id: number
  name: string
  resource_size?: number
}

export default class ReleasePush extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Directory containing .xs documents to create the release from',
      required: true,
    }),
  }
  static override description = 'Create a new release from local XanoScript files via the multidoc endpoint'
  static override examples = [
    `$ xano release push ./my-release -n "v1.0"
Created release: v1.0 - ID: 10
`,
    `$ xano release push ./output -n "v2.0" -w 40 -d "Major update"
Created release: v2.0 - ID: 15
`,
    `$ xano release push ./backup -n "v1.1-hotfix" --hotfix --profile production
Created release: v1.1-hotfix - ID: 20
`,
    `$ xano release push ./my-release -n "v1.0" --no-records --no-env
Create release from schema only, skip records and environment variables
`,
    `$ xano release push ./my-release -n "v1.0" -o json
Output release details as JSON
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      default: '',
      description: 'Release description',
      required: false,
    }),
    env: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Include environment variables (default: true, use --no-env to exclude)',
      required: false,
    }),
    hotfix: Flags.boolean({
      default: false,
      description: 'Mark as a hotfix release',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the release',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    records: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Include records (default: true, use --no-records to exclude)',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleasePush)

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
          `  1. Provide it as a flag: xano release push <directory> -n <name> -w <workspace_id>\n` +
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

    // Construct the API URL with query params
    const queryParams = new URLSearchParams({
      description: flags.description,
      env: flags.env.toString(),
      hotfix: flags.hotfix.toString(),
      name: flags.name,
      records: flags.records.toString(),
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/multidoc?${queryParams.toString()}`

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
        let errorMessage = `Release creation failed (${response.status})`

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

      const release = await response.json() as Release

      if (flags.output === 'json') {
        this.log(JSON.stringify(release, null, 2))
      } else {
        this.log(`Created release: ${release.name} - ID: ${release.id}`)
        if (release.branch) this.log(`  Branch: ${release.branch}`)
        if (release.hotfix) this.log(`  Hotfix: true`)
        if (release.description) this.log(`  Description: ${release.description}`)
        this.log(`  Documents: ${documents.length}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create release: ${error.message}`)
      } else {
        this.error(`Failed to create release: ${String(error)}`)
      }
    }
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
