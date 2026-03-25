import {Flags} from '@oclif/core'
import open from 'open'

import BaseCommand from '../../../base-command.js'

interface ImpersonateResponse {
  _ti: string
}

export default class SandboxReview extends BaseCommand {
  static description = 'Open your sandbox environment in the browser to review and promote changes'

  static examples = [
    `$ xano sandbox review
Opening browser...
Review session started!
`,
    `$ xano sandbox review -u`,
    `$ xano sandbox review -o json`,
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
    const {flags} = await this.parse(SandboxReview)
    const {profile} = this.resolveProfile(flags)

    const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
    const tenantName = tenant.name

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/tenant/${encodeURIComponent(tenantName)}/impersonate`

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
          this.log('Review session started!')
        }
      }

      process.exit(0)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to open sandbox review: ${error.message}`)
      } else {
        this.error(`Failed to open sandbox review: ${String(error)}`)
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
