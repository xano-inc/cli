import {Flags} from '@oclif/core'
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
  state?: string
}

export default class TenantCreate extends BaseCommand {
  static description = 'Create a new tenant in a workspace'
  static examples = [
    `$ xano tenant create --display "Production"
Created tenant: Production (production) - ID: 42
`,
    `$ xano tenant create --display "Staging" --description "Staging env" --cluster-id 1 --platform-id 1 --license tier2 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    'cluster-id': Flags.integer({
      description: 'Cluster ID to deploy to (required for tier2/tier3)',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Tenant description',
      required: false,
    }),
    display: Flags.string({
      description: 'Display name for the tenant',
      required: true,
    }),
    domain: Flags.string({
      description: 'Custom domain for the tenant',
      required: false,
    }),
    ingress: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable ingress',
    }),
    license: Flags.string({
      default: 'tier1',
      description: 'License tier',
      options: ['tier1', 'tier2', 'tier3'],
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'platform-id': Flags.integer({
      description: 'Platform ID to use',
      required: false,
    }),
    tasks: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable background tasks',
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TenantCreate)

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

    const body: Record<string, unknown> = {
      display: flags.display,
      ingress: flags.ingress,
      license: flags.license,
      tag: [],
      tasks: flags.tasks,
    }

    if (flags.description) body.description = flags.description
    if (flags['cluster-id']) body.cluster_id = flags['cluster-id']
    if (flags['platform-id']) body.platform_id = flags['platform-id']
    if (flags.domain) body.domain = flags.domain

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
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
        this.log(`Created tenant: ${tenant.display || tenant.name} (${tenant.name}) - ID: ${tenant.id}`)
        if (tenant.state) {
          this.log(`  State: ${tenant.state}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create tenant: ${error.message}`)
      } else {
        this.error(`Failed to create tenant: ${String(error)}`)
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
