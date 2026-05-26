import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  display?: string
  id: number
  name: string
  release?: {name?: string}
  state?: string
}

export default class TenantDeployRelease extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to deploy to',
      required: true,
    }),
  }
  static description =
    '[CRITICAL] STOP and confirm with the user before deploying a release to a tenant; this mutates the live tenant. Deploys a release to a tenant.'
  static examples = [
    `$ xano tenant deploy_release t1234-abcd-xyz1 --release v1.0
Deployed release "v1.0" to tenant: My Tenant (my-tenant)
`,
    `$ xano tenant deploy_release t1234-abcd-xyz1 --release v1.0 -o json`,
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
    release: Flags.string({
      char: 'r',
      description: 'Release name to deploy',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRelease)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const releaseName = flags.release
    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/deploy`

    this.warn('This may take a few minutes. Please be patient.')

    const startTime = Date.now()

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({release_name: releaseName}),
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
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        this.log(`Deployed release "${releaseName}" to tenant: ${tenant.display || tenant.name} (${tenant.name})`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
        if (tenant.release?.name) this.log(`  Release: ${tenant.release.name}`)
        this.log(`  Time: ${elapsed}s`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to deploy to tenant: ${error.message}`)
      } else {
        this.error(`Failed to deploy to tenant: ${String(error)}`)
      }
    }
  }

}
