import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface StaticHost {
  [key: string]: unknown
  description?: string
  id: number
  name: string
}

export default class StaticHostCreate extends BaseCommand {
  static args = {
    name: Args.string({
      description: 'Name for the new static host',
      required: true,
    }),
  }
  static description = 'Create a new static host in the workspace'
  static examples = [
    `$ xano static_host create marketing
Created static host 'marketing' (ID: 7)
`,
    `$ xano static_host create marketing --description "Marketing site" -w 40
Created static host 'marketing' (ID: 7)
`,
    `$ xano static_host create marketing -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      description: 'Description for the static host',
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
    const {args, flags} = await this.parse(StaticHostCreate)

    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano static_host create <name> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({description: flags.description ?? '', name: args.name}),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const message = await this.parseApiError(response, `Failed to create static host '${args.name}'`)
        this.error(message)
      }

      const host = (await response.json()) as StaticHost

      if (flags.output === 'json') {
        this.log(JSON.stringify(host, null, 2))
      } else {
        this.log(`Created static host '${host.name}' (ID: ${host.id})`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create static host: ${error.message}`)
      } else {
        this.error(`Failed to create static host: ${String(error)}`)
      }
    }
  }
}
