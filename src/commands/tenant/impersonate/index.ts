import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import open from 'open'

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

interface ImpersonateResponse {
  _ti: string
}

export default class TenantImpersonate extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to impersonate',
      required: true,
    }),
  }

  static description = 'Impersonate a tenant and open it in the browser'

  static examples = [
    `$ xano tenant impersonate my-tenant
Opening browser...
Impersonation successful!
`,
    `$ xano tenant impersonate my-tenant -o json`,
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
    'url-only': Flags.boolean({
      char: 'u',
      default: false,
      description: 'Print the URL without opening the browser',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantImpersonate)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
          `Create a profile using 'xano auth'`,
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

    try {
      const response = await this.getImpersonateResponse(profile, workspaceId, tenantName)

      if (flags.output === 'json') {
        this.log(JSON.stringify(response, null, 2))
      } else {
        const frontendUrl = this.getFrontendUrl(profile.instance_origin)
        const params = new URLSearchParams({
          _ti: response._ti,
        })
        const impersonateUrl = `${frontendUrl}/impersonate?${params.toString()}`

        if (flags['url-only']) {
          this.log(impersonateUrl)
        } else {
          this.log('Opening browser...')
          await open(impersonateUrl)
          this.log('Impersonation successful!')
        }
      }

      process.exit(0)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to impersonate tenant: ${error.message}`)
      } else {
        this.error(`Failed to impersonate tenant: ${String(error)}`)
      }
    }
  }

  private async getImpersonateResponse(
    profile: ProfileConfig,
    workspaceId: string,
    tenantName: string,
  ): Promise<ImpersonateResponse> {
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${encodeURIComponent(tenantName)}/impersonate`

    const {verbose} = await this.parse(TenantImpersonate).then((r) => r.flags)

    const response = await this.verboseFetch(
      apiUrl,
      {
        headers: {
          Authorization: `Bearer ${profile.access_token}`,
          accept: 'application/json',
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
    }

    const result = (await response.json()) as ImpersonateResponse

    if (!result._ti) {
      throw new Error('No one-time token returned from impersonate API')
    }

    return result
  }

  private getFrontendUrl(instanceOrigin: string): string {
    try {
      const url = new URL(instanceOrigin)
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        url.port = '4200'
        return url.origin
      }
    } catch {
      // fall through
    }

    return instanceOrigin
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}\n` + `Create a profile using 'xano auth'`)
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
