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
  ephemeral?: boolean
  id: number
  license?: string
  name: string
  state?: string
}

export default class TenantList extends BaseCommand {
  static description = 'List all tenants in a workspace'
  static examples = [
    `$ xano tenant list
Tenants in workspace 5:
  - My Tenant (my-tenant) [ok] - tier1
  - Staging (staging) [ok] - tier1
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
            const ephemeral = tenant.ephemeral ? ' [ephemeral]' : ''
            this.log(`  - ${tenant.display || tenant.name} (${tenant.name})${state}${license}${ephemeral}`)
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
