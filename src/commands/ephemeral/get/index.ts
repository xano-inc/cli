import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  cluster?: {id?: number; name?: string}
  created_at?: string
  deployed_at?: string
  description?: string
  display?: string
  domain?: string
  ephemeral_expires_at?: number | string
  id: number
  ingress?: boolean
  license?: string
  name: string
  platform?: {id?: number; name?: string}
  release?: string | {id?: number; name?: string}
  state?: string
  tasks?: boolean
  type?: string
  version?: number
  xano_domain?: string
}

export default class EphemeralGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name to retrieve',
      required: true,
    }),
  }
  static description = 'Get details of a specific ephemeral tenant'
  static examples = [
    `$ xano ephemeral get e4f2-9ab1-xyz1
Tenant: PR preview (e4f2-9ab1-xyz1)
  State: ok
  License: tier1
  Expires: in 1h 0m
`,
    `$ xano ephemeral get e4f2-9ab1-xyz1 -w 5 -o json`,
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
    const {args, flags} = await this.parse(EphemeralGet)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}`

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

      const tenant = (await response.json()) as Tenant

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Tenant: ${tenant.display || tenant.name} (${tenant.name})`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
        if (tenant.license) this.log(`  License: ${tenant.license}`)
        if (tenant.xano_domain) this.log(`  Domain: ${tenant.xano_domain}`)
        if (tenant.domain) this.log(`  Custom Domain: ${tenant.domain}`)
        if (tenant.cluster?.name) this.log(`  Cluster: ${tenant.cluster.name}`)
        const releaseName = typeof tenant.release === 'string' ? tenant.release : tenant.release?.name
        const releaseId = typeof tenant.release === 'object' ? tenant.release?.id : undefined
        if (releaseName) this.log(`  Release: ${releaseName} (ID: ${releaseId})`)
        if (tenant.platform?.name) this.log(`  Platform: ${tenant.platform.name}`)
        if (tenant.version !== undefined) this.log(`  Version: ${tenant.version}`)
        if (tenant.tasks !== undefined) this.log(`  Tasks: ${tenant.tasks}`)
        if (tenant.ingress !== undefined) this.log(`  Ingress: ${tenant.ingress}`)
        if (tenant.type) this.log(`  Type: ${tenant.type}`)
        this.log(`  Expires: ${this.formatExpiration(tenant.ephemeral_expires_at)}`)
        if (tenant.deployed_at) {
          const d = new Date(tenant.deployed_at)
          const deployedDate = Number.isNaN(d.getTime()) ? tenant.deployed_at : d.toISOString().split('T')[0]
          this.log(`  Deployed: ${deployedDate}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get ephemeral tenant: ${error.message}`)
      } else {
        this.error(`Failed to get ephemeral tenant: ${String(error)}`)
      }
    }
  }

  /**
   * Render a unix-epoch-seconds expiration as a human-readable "in Xh Ym" string,
   * falling back to an ISO timestamp if the value has already passed or is absent.
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
