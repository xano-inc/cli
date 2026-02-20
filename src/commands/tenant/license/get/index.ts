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

export default class TenantLicenseGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Get the license for a tenant'
  static examples = [
    `$ xano tenant license get my-tenant
License saved to license_my-tenant.yaml
`,
    `$ xano tenant license get my-tenant --file ./my-license.yaml
License saved to my-license.yaml
`,
    `$ xano tenant license get my-tenant --view`,
    `$ xano tenant license get my-tenant -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Output file path (default: license_<tenant_name>.yaml)',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    view: Flags.boolean({
      default: false,
      description: 'Print license to stdout instead of saving to file',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantLicenseGet)

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
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/license`

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

      const license = await response.json()

      // The license is a raw YAML string — write it directly, not yaml.dump'd
      const licenseContent = typeof license === 'string' ? license : JSON.stringify(license, null, 2)

      if (flags.view || flags.output === 'json') {
        if (flags.output === 'json') {
          this.log(JSON.stringify(license, null, 2))
        } else {
          this.log(licenseContent)
        }
      } else {
        const filePath = path.resolve(flags.file || `license_${tenantName}.yaml`)
        fs.writeFileSync(filePath, licenseContent, 'utf8')
        this.log(`License saved to ${filePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get tenant license: ${error.message}`)
      } else {
        this.error(`Failed to get tenant license: ${String(error)}`)
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
