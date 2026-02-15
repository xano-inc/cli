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
  display?: string
  id: number
  name: string
  platform?: {id?: number; name?: string}
  state?: string
}

export default class TenantDeployPlatform extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to deploy to',
      required: true,
    }),
  }
  static description = 'Deploy a platform version to a tenant'
  static examples = [
    `$ xano tenant deploy-platform t1234-abcd-xyz1 --platform-id 5
Deployed platform 5 to tenant: My Tenant (my-tenant)
`,
    `$ xano tenant deploy-platform t1234-abcd-xyz1 --platform-id 5 -o json`,
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
    'platform-id': Flags.integer({
      description: 'Platform ID to deploy',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployPlatform)

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
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const tenantName = args.tenant_name
    const platformId = flags['platform-id']
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/platform/deploy`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({platform_id: platformId}),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const tenant = await response.json() as Tenant

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Deployed platform ${platformId} to tenant: ${tenant.display || tenant.name} (${tenant.name})`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
        if (tenant.platform?.name) this.log(`  Platform: ${tenant.platform.name}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to deploy platform to tenant: ${error.message}`)
      } else {
        this.error(`Failed to deploy platform to tenant: ${String(error)}`)
      }
    }
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile create'`,
      )
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
