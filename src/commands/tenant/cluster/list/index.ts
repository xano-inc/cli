import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface TenantCluster {
  created_at?: string
  description?: string
  domain?: string
  id: number
  ingress?: Record<string, unknown>
  name: string
  type?: string
  warm?: Record<string, unknown>
}

export default class TenantClusterList extends BaseCommand {
  static description = 'List all tenant clusters'
  static examples = [
    `$ xano tenant cluster list
Tenant clusters:
  - us-east-1 (standard) [ID: 1]
  - eu-west-1 (run) [ID: 2]
`,
    `$ xano tenant cluster list --output json`,
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
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TenantClusterList)

    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/tenant/cluster`

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

      const data = (await response.json()) as TenantCluster[] | {items?: TenantCluster[]}

      let clusters: TenantCluster[]
      if (Array.isArray(data)) {
        clusters = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        clusters = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(clusters, null, 2))
      } else {
        if (clusters.length === 0) {
          this.log('No tenant clusters found')
        } else {
          this.log('Tenant clusters:')
          for (const cluster of clusters) {
            const type = cluster.type ? ` (${cluster.type})` : ''
            this.log(`  - ${cluster.name}${type} [ID: ${cluster.id}]`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list tenant clusters: ${error.message}`)
      } else {
        this.error(`Failed to list tenant clusters: ${String(error)}`)
      }
    }
  }

}
