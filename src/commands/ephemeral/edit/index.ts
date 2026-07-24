import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  description?: string
  display?: string
  domain?: string
  id: number
  ingress?: boolean
  name: string
  proxy?: string
  rbac?: {enabled?: boolean}
  tag?: Array<{tag: string}>
  tasks?: boolean
}

export default class EphemeralEdit extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name to edit',
      required: true,
    }),
  }
  static description = 'Edit an existing ephemeral tenant'
  static examples = [
    `$ xano ephemeral edit e4f2-9ab1-xyz1 --display "New Name" --description "Updated description"
Updated tenant: New Name (e4f2-9ab1-xyz1) - ID: 42
`,
    `$ xano ephemeral edit e4f2-9ab1-xyz1 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'New description',
      required: false,
    }),
    display: Flags.string({
      description: 'New display name',
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
    const {args, flags} = await this.parse(EphemeralEdit)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const tenantName = args.tenant_name
    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}`
    const headers = {
      'accept': 'application/json',
      'Authorization': `Bearer ${profile.access_token}`,
      'Content-Type': 'application/json',
    }

    try {
      // Fetch current tenant state (PUT requires all fields)
      const getResponse = await this.verboseFetch(
        baseUrl,
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

      if (!getResponse.ok) {
        const errorText = await getResponse.text()
        this.error(
          `Failed to fetch tenant: ${getResponse.status} ${getResponse.statusText}\n${errorText}`,
        )
      }

      const current = await getResponse.json() as Tenant

      // Merge in user-provided values
      const body: Record<string, unknown> = {
        description: flags.description !== undefined ? flags.description : (current.description ?? ''),
        display: flags.display !== undefined ? flags.display : (current.display ?? current.name),
        domain: current.domain ?? '',
        ingress: current.ingress ?? false,
        proxy: current.proxy ?? '',
        rbac: {
          enabled: current.rbac?.enabled ?? false,
        },
        tag: current.tag ?? [],
        tasks: current.tasks ?? false,
      }

      // Update tenant
      const putResponse = await this.verboseFetch(
        baseUrl,
        {
          body: JSON.stringify(body),
          headers,
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!putResponse.ok) {
        const errorText = await putResponse.text()
        this.error(
          `API request failed with status ${putResponse.status}: ${putResponse.statusText}\n${errorText}`,
        )
      }

      const tenant = await putResponse.json() as Tenant

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Updated tenant: ${tenant.display || tenant.name} (${tenant.name}) - ID: ${tenant.id}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to edit ephemeral tenant: ${error.message}`)
      } else {
        this.error(`Failed to edit ephemeral tenant: ${String(error)}`)
      }
    }
  }

}
