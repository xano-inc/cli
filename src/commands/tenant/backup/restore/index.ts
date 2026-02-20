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

export default class TenantRestore extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to restore',
      required: true,
    }),
  }
  static description = 'Restore a tenant from a backup. This replaces the current tenant data.'
  static examples = [
    `$ xano tenant backup restore t1234-abcd-xyz1 --backup_id 10
Are you sure you want to restore tenant t1234-abcd-xyz1 from backup 10? This will replace current data. (y/N) y
Restored tenant t1234-abcd-xyz1 from backup #10
`,
    `$ xano tenant backup restore t1234-abcd-xyz1 --backup_id 10 --force -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    backup_id: Flags.integer({
      description: 'Backup ID to restore from',
      required: true,
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
      required: false,
    }),
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
    const {args, flags} = await this.parse(TenantRestore)

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
    const backupId = flags.backup_id

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to restore tenant ${tenantName} from backup ${backupId}? This will replace current data.`,
      )
      if (!confirmed) {
        this.log('Restore cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/restore`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({backup_id: backupId}),
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

      const tenant = (await response.json()) as {state?: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Restored tenant ${tenantName} from backup #${backupId}`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to restore tenant: ${error.message}`)
      } else {
        this.error(`Failed to restore tenant: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
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
