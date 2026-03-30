import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class SandboxLicenseGet extends BaseCommand {
  static description = 'Get the license for a sandbox environment'
  static examples = [
    `$ xano sandbox license get
License saved to license_<tenant>.yaml
`,
    `$ xano sandbox license get --file ./my-license.yaml`,
    `$ xano sandbox license get --view`,
    `$ xano sandbox license get -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Output file path (default: license_<sandbox_name>.yaml)',
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
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxLicenseGet)
    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/license`

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
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
      }

      const license = await response.json()

      const licenseContent = typeof license === 'string' ? license : JSON.stringify(license, null, 2)

      if (flags.view || flags.output === 'json') {
        if (flags.output === 'json') {
          this.log(JSON.stringify(license, null, 2))
        } else {
          this.log(licenseContent)
        }
      } else {
        const filePath = path.resolve(flags.file || `license.yaml`)
        fs.writeFileSync(filePath, licenseContent, 'utf8')
        this.log(`License saved to ${filePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get sandbox environment license: ${error.message}`)
      } else {
        this.error(`Failed to get sandbox environment license: ${String(error)}`)
      }
    }
  }
}
