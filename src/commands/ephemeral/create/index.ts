import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  display?: string
  id: number
  name: string
  state?: string
}

export default class EphemeralCreate extends BaseCommand {
  static override args = {
    display: Args.string({
      description: 'Optional display name for the ephemeral tenant',
      required: false,
    }),
  }
  static description = 'Create an ephemeral tenant (workspace-agnostic, no background tasks)'
  static examples = [
    `$ xano ephemeral create
Created ephemeral tenant: e1a2-b3c4-x5y6 - ID: 42
`,
    `$ xano ephemeral create "My Ephemeral"`,
    `$ xano ephemeral create "CI Tenant" -d "For CI/CD" -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    access: Flags.string({
      char: 'a',
      default: 'private',
      description: 'Access level (private or shared)',
      options: ['private', 'shared'],
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Tenant description',
      required: false,
    }),
    domain: Flags.string({
      description: 'Custom domain for the tenant',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralCreate)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const body: Record<string, unknown> = {
      access: flags.access,
      display: args.display || '',
      tag: [],
    }

    if (flags.description) body.description = flags.description
    if (flags.domain) body.domain = flags.domain

    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
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
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const tenant = (await response.json()) as Tenant

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Created ephemeral tenant: ${tenant.display || tenant.name} (${tenant.name}) - ID: ${tenant.id}`)
        if (tenant.state) {
          this.log(`  State: ${tenant.state}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create ephemeral tenant: ${error.message}`)
      } else {
        this.error(`Failed to create ephemeral tenant: ${String(error)}`)
      }
    }
  }
}
