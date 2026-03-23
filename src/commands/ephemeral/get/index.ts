import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  cluster?: {id?: number; name?: string}
  created_at?: string
  deployed_at?: string
  description?: string
  display?: string
  domain?: string
  ephemeral?: boolean
  ephemeral_access?: string
  id: number
  ingress?: boolean
  license?: string
  name: string
  platform?: {id?: number; name?: string}
  release?: string | {id?: number; name?: string}
  state?: string
  tasks?: boolean
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
  static description = 'Get details of an ephemeral tenant'
  static examples = [
    `$ xano ephemeral get t1234-abcd-xyz1
Ephemeral Tenant: My Tenant (my-tenant)
  State: ok
  License: tier1
  Domain: my-tenant.xano.io
`,
    `$ xano ephemeral get t1234-abcd-xyz1 -o json`,
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
    const {args, flags} = await this.parse(EphemeralGet)

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

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}`

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
        this.log(`Ephemeral Tenant: ${tenant.display || tenant.name} (${tenant.name})`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
        if (tenant.ephemeral_access) this.log(`  Access: ${tenant.ephemeral_access}`)
        if (tenant.license) this.log(`  License: ${tenant.license}`)
        if (tenant.xano_domain) this.log(`  Domain: ${tenant.xano_domain}`)
        if (tenant.domain) this.log(`  Custom Domain: ${tenant.domain}`)
        if (tenant.cluster?.name) this.log(`  Cluster: ${tenant.cluster.name}`)
        const releaseName = typeof tenant.release === 'string' ? tenant.release : tenant.release?.name
        const releaseId = typeof tenant.release === 'object' ? tenant.release?.id : undefined
        if (releaseName) this.log(`  Release: ${releaseName} (ID: ${releaseId})`)
        if (tenant.platform?.name) this.log(`  Platform: ${tenant.platform.name}`)
        if (tenant.version !== undefined) this.log(`  Version: ${tenant.version}`)
        if (tenant.ingress !== undefined) this.log(`  Ingress: ${tenant.ingress}`)
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
}
