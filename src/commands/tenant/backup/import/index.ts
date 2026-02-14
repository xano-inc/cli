import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

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

interface ImportResult {
  id: number
}

export default class TenantBackupImport extends BaseCommand {
  static override args = {
    tenant_id: Args.integer({
      description: 'Tenant ID to import backup into',
      required: true,
    }),
  }
  static description = 'Import a backup file into a tenant'
  static examples = [
    `$ xano tenant backup import 42 --file ./my-backup.tar.gz
Imported backup as #15 for tenant 42
`,
    `$ xano tenant backup import 42 --file ./my-backup.tar.gz --description "Restored from production" -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      default: '',
      description: 'Backup description',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to the backup file (.tar.gz)',
      required: true,
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
    const {args, flags} = await this.parse(TenantBackupImport)

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
    const filePath = path.resolve(flags.file)

    if (!fs.existsSync(filePath)) {
      this.error(`File not found: ${filePath}`)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantId}/backup/import`

    try {
      const fileBuffer = fs.readFileSync(filePath)
      const blob = new Blob([fileBuffer], {type: 'application/gzip'})

      const formData = new FormData()
      formData.append('file', blob, path.basename(filePath))
      formData.append('description', flags.description)

      const response = await this.verboseFetch(
        apiUrl,
        {
          body: formData,
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
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

      const result = await response.json() as ImportResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(2)
        this.log(`Imported backup as #${result.id} for tenant ${tenantId} (${sizeMb} MB)`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to import backup: ${error.message}`)
      } else {
        this.error(`Failed to import backup: ${String(error)}`)
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
