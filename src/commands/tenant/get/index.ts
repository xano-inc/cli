import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
}

interface Tenant {
  cluster?: {name?: string}
  created_at?: string
  deployed_at?: string
  description?: string
  display?: string
  domain?: string
  ephemeral?: boolean
  id: number
  ingress?: boolean
  license?: string
  name: string
  platform?: {id?: number; name?: string}
  release?: {name?: string}
  state?: string
  tasks?: boolean
  version?: number
  xano_domain?: string
}

export default class TenantGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to retrieve',
      required: true,
    }),
  }
  static description = 'Get details of a specific tenant'
  static examples = [
    `$ xano tenant get t1234-abcd-xyz1
Tenant: My Tenant (my-tenant)
  State: ok
  License: tier1
  Domain: my-tenant.xano.io
  Cluster: default
  Release: v1.0
`,
    `$ xano tenant get t1234-abcd-xyz1 -w 5 -o json`,
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
    const {args, flags} = await this.parse(TenantGet)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
          `Create a profile using 'xano profile create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

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
        if (tenant.release?.name) this.log(`  Release: ${tenant.release.name}`)
        if (tenant.platform?.name) this.log(`  Platform: ${tenant.platform.name}`)
        if (tenant.version !== undefined) this.log(`  Version: ${tenant.version}`)
        if (tenant.tasks !== undefined) this.log(`  Tasks: ${tenant.tasks}`)
        if (tenant.ingress !== undefined) this.log(`  Ingress: ${tenant.ingress}`)
        if (tenant.ephemeral) this.log(`  Ephemeral: ${tenant.ephemeral}`)
        if (tenant.deployed_at) {
          const d = new Date(tenant.deployed_at)
          const deployedDate = Number.isNaN(d.getTime()) ? tenant.deployed_at : d.toISOString().split('T')[0]
          this.log(`  Deployed: ${deployedDate}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get tenant: ${error.message}`)
      } else {
        this.error(`Failed to get tenant: ${String(error)}`)
      }
    }
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}\n` + `Create a profile using 'xano profile create'`)
    }

    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      return parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }
  }
}
