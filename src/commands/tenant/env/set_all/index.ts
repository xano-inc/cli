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

export default class TenantEnvSetAll extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Set all environment variables for a tenant from a YAML file (replaces all existing)'
  static examples = [
    `$ xano tenant env set_all my-tenant
Reads from env_my-tenant.yaml
`,
    `$ xano tenant env set_all my-tenant --file ./my-env.yaml`,
    `$ xano tenant env set_all my-tenant -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    clean: Flags.boolean({
      default: false,
      description: 'Remove the source file after successful upload',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to env file (default: env_<tenant_name>.yaml)',
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
    const {args, flags} = await this.parse(TenantEnvSetAll)

    const tenantName = args.tenant_name
    const sourceFilePath = path.resolve(flags.file || `env_${tenantName}.yaml`)

    if (!fs.existsSync(sourceFilePath)) {
      this.error(`File not found: ${sourceFilePath}`)
    }

    const fileContent = fs.readFileSync(sourceFilePath, 'utf8')
    const envMap = yaml.load(fileContent) as Record<string, string>

    if (!envMap || typeof envMap !== 'object') {
      this.error('Invalid env file format. Expected a YAML map of key: value pairs.')
    }

    const envs = Object.entries(envMap).map(([name, value]) => ({name, value: String(value)}))

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

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/env_all`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({envs}),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      if (flags.output === 'json') {
        const result = await response.json()
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`All environment variables updated for tenant ${tenantName} (${envs.length} variables)`)
      }

      if (flags.clean && fs.existsSync(sourceFilePath)) {
        fs.unlinkSync(sourceFilePath)
        this.log(`Removed ${sourceFilePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set tenant environment variables: ${error.message}`)
      } else {
        this.error(`Failed to set tenant environment variables: ${String(error)}`)
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
