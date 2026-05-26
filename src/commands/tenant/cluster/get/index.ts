import {Args, Flags} from '@oclif/core'

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

export default class TenantClusterGet extends BaseCommand {
  static override args = {
    cluster_id: Args.integer({
      description: 'Cluster ID to retrieve',
      required: true,
    }),
  }
  static description = 'Get details of a specific tenant cluster'
  static examples = [
    `$ xano tenant cluster get 1
Cluster: us-east-1
  ID: 1
  Type: standard
  Domain: us-east-1.xano.io
`,
    `$ xano tenant cluster get 1 -o json`,
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
    const {args, flags} = await this.parse(TenantClusterGet)

    const {profile} = this.resolveProfile(flags)

    const clusterId = args.cluster_id
    const apiUrl = `${profile.instance_origin}/api:meta/tenant/cluster/${clusterId}`

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

      const cluster = (await response.json()) as TenantCluster

      if (flags.output === 'json') {
        this.log(JSON.stringify(cluster, null, 2))
      } else {
        this.log(`Cluster: ${cluster.name}`)
        this.log(`  ID: ${cluster.id}`)
        if (cluster.type) this.log(`  Type: ${cluster.type}`)
        if (cluster.description) this.log(`  Description: ${cluster.description}`)
        if (cluster.domain) this.log(`  Domain: ${cluster.domain}`)
        if (cluster.warm) this.log(`  Warm: ${JSON.stringify(cluster.warm)}`)
        if (cluster.ingress) this.log(`  Ingress: ${JSON.stringify(cluster.ingress)}`)
        if (cluster.created_at) {
          const d = new Date(cluster.created_at)
          const createdDate = Number.isNaN(d.getTime()) ? cluster.created_at : d.toISOString().split('T')[0]
          this.log(`  Created: ${createdDate}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get tenant cluster: ${error.message}`)
      } else {
        this.error(`Failed to get tenant cluster: ${String(error)}`)
      }
    }
  }

}
