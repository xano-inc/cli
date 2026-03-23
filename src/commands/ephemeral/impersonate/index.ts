import {Args, Flags} from '@oclif/core'
import open from 'open'

import BaseCommand from '../../../base-command.js'

interface ImpersonateResponse {
  _ti: string
}

export default class EphemeralImpersonate extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name to impersonate',
      required: true,
    }),
  }

  static description = 'Impersonate an ephemeral tenant and open it in the browser'

  static examples = [
    `$ xano ephemeral impersonate my-tenant
Opening browser...
Impersonation successful!
`,
    `$ xano ephemeral impersonate my-tenant -u`,
    `$ xano ephemeral impersonate my-tenant -o json`,
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralImpersonate)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano auth'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${encodeURIComponent(tenantName)}/impersonate`

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

      const result = (await response.json()) as ImpersonateResponse

      if (!result._ti) {
        this.error('No one-time token returned from impersonate API')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const frontendUrl = this.getFrontendUrl(profile.instance_origin)
        const params = new URLSearchParams({
          _ti: result._ti,
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
        this.error(`Failed to impersonate ephemeral tenant: ${error.message}`)
      } else {
        this.error(`Failed to impersonate ephemeral tenant: ${String(error)}`)
      }
    }
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
}
