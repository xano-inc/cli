import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface StaticHost {
  [key: string]: unknown
  description?: string
  id: number
  name: string
}

export default class EphemeralStaticHostCreate extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
  static description = 'Create a new static host for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral static_host create e4f2-9ab1-xyz1 --name marketing
Created static host 'marketing' (ID: 7)
`,
    `$ xano ephemeral static_host create e4f2-9ab1-xyz1 -n marketing --description "Marketing site" -w 40
Created static host 'marketing' (ID: 7)
`,
    `$ xano ephemeral static_host create e4f2-9ab1-xyz1 -n marketing -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      description: 'Description for the static host',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the new static host',
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
    const {args, flags} = await this.parse(EphemeralStaticHostCreate)

    const {profile, profileName} = this.resolveProfile(flags)

    const tenantName = args.tenant_name

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano ephemeral static_host create <tenant_name> --name <name> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/static_host`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({description: flags.description ?? '', name: flags.name}),
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
        const message = await this.parseApiError(response, `Failed to create static host '${flags.name}'`)
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
