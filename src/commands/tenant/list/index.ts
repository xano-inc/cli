import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  cluster?: {id?: number; name?: string}
  display?: string
  type?: string
  id: number
  license?: string
  name: string
  platform?: {id?: number; name?: string}
  release?: string | {id?: number; name?: string}
  state?: string
}

export default class TenantList extends BaseCommand {
  static description = 'List all tenants in a workspace'
  static examples = [
    `$ xano tenant list
Tenants in workspace 5:
  - My Tenant (my-tenant) [ok] - tier1
      Cluster: us-central
      Release: r1
      Platform: default
  - Staging (staging) [ok] - tier1
      Cluster: us-central
      Release: r1
`,
    `$ xano tenant list -w 5 --output json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
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
    const {flags} = await this.parse(TenantList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant`

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

      const data = (await response.json()) as Tenant[] | {items?: Tenant[]; tenants?: Tenant[]}

      let tenants: Tenant[]
      if (Array.isArray(data)) {
        tenants = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        tenants = data.items
      } else if (data && typeof data === 'object' && 'tenants' in data && Array.isArray(data.tenants)) {
        tenants = data.tenants
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenants, null, 2))
      } else {
        if (tenants.length === 0) {
          this.log('No tenants found')
        } else {
          this.log(`Tenants in workspace ${workspaceId}:`)
          for (const tenant of tenants) {
            const state = tenant.state ? ` [${tenant.state}]` : ''
            const license = tenant.license ? ` - ${tenant.license}` : ''
            const typeLabel = tenant.type && tenant.type !== 'standard' ? ` [${tenant.type}]` : ''
            this.log(`  - ${tenant.display || tenant.name} (${tenant.name})${state}${license}${typeLabel}`)
            if (tenant.cluster?.name) this.log(`      Cluster: ${tenant.cluster.name}`)
            const releaseName = typeof tenant.release === 'string' ? tenant.release : tenant.release?.name
            const releaseId = typeof tenant.release === 'object' ? tenant.release?.id : undefined
            if (releaseName) this.log(`      Release: ${releaseName} (ID: ${releaseId})`)
            if (tenant.platform?.name) this.log(`      Platform: ${tenant.platform.name}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list tenants: ${error.message}`)
      } else {
        this.error(`Failed to list tenants: ${String(error)}`)
      }
    }
  }

}
