import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

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

interface Backup {
  _release?: {name?: string}
  _user?: {email?: string; name?: string}
  created_at?: string
  description?: string
  id: number
}

export default class TenantBackupList extends BaseCommand {
  static override args = {
    tenant_id: Args.integer({
      description: 'Tenant ID to list backups for',
      required: true,
    }),
  }
  static description = 'List backups for a tenant'
  static examples = [
    `$ xano tenant backup list 42
Backups for tenant 42:
  - #1 - Pre-deploy backup (2024-01-15)
  - #2 - Daily backup (2024-01-16)
`,
    `$ xano tenant backup list 42 -o json`,
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
    page: Flags.integer({
      default: 1,
      description: 'Page number for pagination',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantBackupList)

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

    const tenantId = args.tenant_id
    const queryParams = new URLSearchParams({page: flags.page.toString()})
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantId}/backup?${queryParams.toString()}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
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

      const data = await response.json() as Backup[] | {items?: Backup[]}

      let backups: Backup[]
      if (Array.isArray(data)) {
        backups = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        backups = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(backups, null, 2))
      } else {
        if (backups.length === 0) {
          this.log(`No backups found for tenant ${tenantId}`)
        } else {
          this.log(`Backups for tenant ${tenantId}:`)
          for (const backup of backups) {
            let date = 'unknown'
            if (backup.created_at) {
              const d = new Date(backup.created_at)
              date = Number.isNaN(d.getTime()) ? backup.created_at : d.toISOString().split('T')[0]
            }
            const desc = backup.description || 'No description'
            this.log(`  - #${backup.id} - ${desc} (${date})`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list backups: ${error.message}`)
      } else {
        this.error(`Failed to list backups: ${String(error)}`)
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
