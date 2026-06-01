import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface Build {
  [key: string]: any
  created_at?: number | string
  description?: string
  id: number
  name: string
  status?: string
  updated_at?: number | string
}

export default class StaticHostBuildGet extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
static description = 'Get details of a specific build for a static host'
static examples = [
    `$ xano static_host:build:get default --build_id 52
Build Details:
ID: 52
Name: v1.0.0
Status: completed
`,
    `$ xano static_host:build:get default --build_id 52 -w 40
Build Details:
ID: 52
Name: v1.0.0
Status: completed
`,
    `$ xano static_host:build:get myhost --build_id 123 --profile production
Build Details:
ID: 123
Name: production-build
`,
    `$ xano static_host:build:get default --build_id 52 -o json
{
  "id": 52,
  "name": "v1.0.0",
  "status": "completed"
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    build_id: Flags.string({
      description: 'Build ID',
      required: true,
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
    const {args, flags} = await this.parse(StaticHostBuildGet)

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
        `  1. Provide it as a flag: xano static_host:build:get <static_host> --build_id <id> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build/${flags.build_id}`

    // Fetch build from the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
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

      const build = await response.json() as Build

      // Validate response
      if (!build || typeof build !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(build, null, 2))
      } else {
        // summary format
        this.log('Build Details:')
        this.log(`ID: ${build.id}`)
        this.log(`Name: ${build.name}`)

        if (build.description) {
          this.log(`Description: ${build.description}`)
        }

        if (build.status) {
          this.log(`Status: ${build.status}`)
        }

        if (typeof build.file_count === 'number') {
          this.log(`Files: ${build.file_count}`)
        }

        if (typeof build.file_bytes === 'number') {
          this.log(`Size: ${build.file_bytes} bytes`)
        }

        if (build.created_at) {
          this.log(`Created: ${build.created_at}`)
        }

        if (build.updated_at) {
          this.log(`Updated: ${build.updated_at}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch build: ${error.message}`)
      } else {
        this.error(`Failed to fetch build: ${String(error)}`)
      }
    }
  }

}
