import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  display?: string
  ephemeral_expires_at?: number
  id: number
  name: string
  state?: string
}

export default class EphemeralCreate extends BaseCommand {
  static override args = {
    display: Args.string({
      description: 'Display name for the ephemeral tenant',
      required: true,
    }),
  }
  static description =
    'Creates a new ephemeral (short-lived) tenant in a workspace. Ephemeral tenants are always tier1 and auto-expire; they require a workspace.'
  static examples = [
    `$ xano ephemeral create "PR preview"
Created ephemeral tenant: PR preview (e4f2-9ab1-...) - ID: 42
  Expires: in 1 hour
`,
    `$ xano ephemeral create "Demo" --expires-hours 24 -w 114`,
    `$ xano ephemeral create "Load test" --description "48h soak" --expires-hours 48 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Ephemeral tenant description',
      required: false,
    }),
    'expires-hours': Flags.integer({
      default: 1,
      description: 'Hours until the tenant auto-expires (1-72)',
      max: 72,
      min: 1,
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
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralCreate)

    const {profile} = this.resolveProfile(flags)

    // Ephemeral tenants REQUIRE a workspace (unlike sandbox, which is workspace-agnostic).
    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Ephemeral tenants require a workspace — use --workspace or set one in your profile.')
    }

    const body: Record<string, unknown> = {
      display: args.display,
      expires_hours: flags['expires-hours'],
      tag: [],
    }

    if (flags.description) body.description = flags.description

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/ephemeral`

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

        if (tenant.ephemeral_expires_at) {
          this.log(`  Expires: ${new Date(tenant.ephemeral_expires_at * 1000).toISOString()}`)
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
