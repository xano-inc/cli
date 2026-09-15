import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {buildPagingJson} from '../../../utils/paging.js'

interface Tenant {
  display?: string
  ephemeral_expires_at?: number | string
  id: number
  license?: string
  name: string
  state?: string
  workspace_id?: number
}

interface PagedEnvelope {
  curPage?: number
  items?: Tenant[]
  nextPage?: null | number
  prevPage?: null | number
}

export default class EphemeralList extends BaseCommand {
  static description = 'List ephemeral tenants in a workspace, or across the whole instance with --global'
  static examples = [
    `$ xano ephemeral list
Ephemeral tenants in workspace 5:
  - PR preview (e4f2-9ab1-...) [ok] - expires in 1h 0m
  - Demo (e7a3-2c10-...) [ok] - expires in 23h 12m
`,
    `$ xano ephemeral list --global
Ephemeral tenants (all workspaces):
  - PR preview (e4f2-9ab1-...) [ok] - expires in 1h 0m
`,
    `$ xano ephemeral list -w 5 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    global: Flags.boolean({
      default: false,
      description: 'List ephemeral tenants across the whole instance (all workspaces)',
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
    const {flags} = await this.parse(EphemeralList)

    const {profile} = this.resolveProfile(flags)

    let workspaceId: string | undefined
    let apiUrl: string

    if (flags.global) {
      apiUrl = `${profile.instance_origin}/api:meta/ephemeral`
    } else {
      workspaceId = flags.workspace || profile.workspace
      if (!workspaceId) {
        this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
      }

      apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/ephemeral`
    }

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as PagedEnvelope | Tenant[]

      let tenants: Tenant[]
      if (Array.isArray(data)) {
        tenants = data
      } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
        tenants = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(buildPagingJson({items: tenants}, {tier: 'none'}), null, 2))
      } else if (tenants.length === 0) {
        this.log('No ephemeral tenants found')
      } else {
        this.log(flags.global ? 'Ephemeral tenants (all workspaces):' : `Ephemeral tenants in workspace ${workspaceId}:`)
        for (const tenant of tenants) {
          const state = tenant.state ? ` [${tenant.state}]` : ''
          const expires = ` - expires ${this.formatExpiration(tenant.ephemeral_expires_at)}`
          const workspaceLabel = flags.global && tenant.workspace_id ? ` (workspace ${tenant.workspace_id})` : ''
          this.log(`  - ${tenant.display || tenant.name} (${tenant.name})${state}${expires}${workspaceLabel}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list ephemeral tenants: ${error.message}`)
      } else {
        this.error(`Failed to list ephemeral tenants: ${String(error)}`)
      }
    }
  }

  /**
   * Render a unix-epoch-seconds expiration as a human-readable "in Xh Ym" string,
   * falling back to an ISO timestamp if the value has already passed or is malformed.
   */
  private formatExpiration(expiresAt?: number | string): string {
    if (!expiresAt) {
      return '-'
    }

    // The API serializes the timestamp field as a date string
    // ("2026-07-24 19:49:15+0000"); tolerate a raw unix-epoch number too.
    const expiresMs =
      typeof expiresAt === 'number' ? expiresAt * 1000 : Date.parse(String(expiresAt).replace(' ', 'T'))

    if (Number.isNaN(expiresMs)) {
      return String(expiresAt)
    }

    const diffSeconds = (expiresMs - Date.now()) / 1000

    if (diffSeconds <= 0) {
      return `${new Date(expiresMs).toISOString()} (expired)`
    }

    const hours = Math.floor(diffSeconds / 3600)
    const minutes = Math.floor((diffSeconds % 3600) / 60)
    return `in ${hours}h ${minutes}m`
  }

}
