import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

interface BuildCreateResponse {
  [key: string]: any
  id: number
  name: string
  status?: string
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Generate a default build name from a compact timestamp: `YYYYMMDD-HHmmss`
 * (e.g. `20260531-143022`). Sortable, distinct down to the second, and uses
 * local time so it lines up with when the user ran the command.
 */
export function generateBuildName(date: Date = new Date()): string {
  const y = date.getFullYear()
  const mo = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  const h = pad2(date.getHours())
  const mi = pad2(date.getMinutes())
  const s = pad2(date.getSeconds())
  return `${y}${mo}${d}-${h}${mi}${s}`
}

export default class StaticHostBuildCreate extends BaseCommand {
  static hidden = true
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
static description = '[Deprecated: use "static_host build push -f <file>" instead] Create a new build from a zip file'
static examples = [
    `$ xano static_host:build:create default -f ./build.zip -n "v1.0.0"
Build created successfully!
ID: 123
Name: v1.0.0
Status: pending
`,
    `$ xano static_host:build:create default -f ./build.zip
Build created successfully!
ID: 123
Name: 20260531-143022
Status: pending
`,
    `$ xano static_host:build:create default -w 40 -f ./dist.zip -n "production" -d "Production build"
Build created successfully!
ID: 124
Name: production
Description: Production build
`,
    `$ xano static_host:build:create myhost -f ./app.zip -n "release-1.2" -o json
{
  "id": 125,
  "name": "release-1.2",
  "status": "pending"
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Build description',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to zip file to upload',
      required: true,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Build name (auto-generated from the current timestamp if omitted)',
      required: false,
    }),
    'no-wait': Flags.boolean({
      default: false,
      description: 'Return immediately after upload instead of waiting for the build to finish',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    this.warn('`static_host build create` is deprecated. Use `static_host build push -f <file>` instead.')

    const {args, flags} = await this.parse(StaticHostBuildCreate)

    const {profile, profileName} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano static_host:build:create <static_host> -f <file> -n <name> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Validate file exists
    const filePath = path.resolve(flags.file)
    if (!fs.existsSync(filePath)) {
      this.error(`File not found: ${filePath}`)
    }

    // Check if file is readable
    try {
      fs.accessSync(filePath, fs.constants.R_OK)
    } catch {
      this.error(`File is not readable: ${filePath}`)
    }

    // Get file stats
    const stats = fs.statSync(filePath)
    if (!stats.isFile()) {
      this.error(`Path is not a file: ${filePath}`)
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build`

    // Create FormData
    const formData = new (globalThis as any).FormData()

    // Read file and create blob
    const fileBuffer = fs.readFileSync(filePath)
    const blob = new Blob([fileBuffer], {type: 'application/zip'})
    formData.append('file', blob, path.basename(filePath))

    // Name is optional — fall back to a timestamped name so builds can be
    // created without thinking up a label each time.
    const buildName = flags.name ?? generateBuildName()
    formData.append('name', buildName)

    if (flags.description) {
      formData.append('description', flags.description)
    }

    // Create build via API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: formData,
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
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

      const result = await response.json() as BuildCreateResponse

      // Validate response
      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        // summary format
        this.log('Build created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)

        if (result.status) {
          this.log(`Status: ${result.status}`)
        }

        if (flags.description) {
          this.log(`Description: ${flags.description}`)
        }
      }

      // Async (package.json) builds keep running after upload. Unless --no-wait,
      // poll until the build finishes so the CLI mirrors the UI's progress.
      const inProgress = result.status !== undefined && !['error', 'ok'].includes(result.status)
      if (inProgress && !flags['no-wait']) {
        const finalStatus = await this.waitForBuild({
          buildId: result.id,
          profile,
          quiet: flags.output === 'json',
          staticHost: args.static_host,
          verbose: flags.verbose,
          workspaceId,
        })
        if (finalStatus === 'error') {
          this.error(`Build ${result.id} failed (status: error). Check the build log with: xano static_host build get ${args.static_host} --build_id ${result.id}`)
        }
      }

      if (flags.output !== 'json') {
        await this.logStaticHostUrls({profile, staticHost: args.static_host, verbose: flags.verbose, workspaceId})
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create build: ${error.message}`)
      } else {
        this.error(`Failed to create build: ${String(error)}`)
      }
    }
  }

}
