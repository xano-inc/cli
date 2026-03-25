import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class SandboxLicenseSet extends BaseCommand {
  static description = 'Set/update the license for a sandbox environment'
  static examples = [
    `$ xano sandbox license set
Reads from license_<tenant>.yaml
`,
    `$ xano sandbox license set --file ./license.yaml`,
    `$ xano sandbox license set --value 'key: value'`,
    `$ xano sandbox license set -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    clean: Flags.boolean({
      default: false,
      description: 'Remove the source file after successful upload',
      exclusive: ['value'],
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to license file (default: license_<sandbox_name>.yaml)',
      exclusive: ['value'],
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    value: Flags.string({
      description: 'Inline license value',
      exclusive: ['file', 'clean'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxLicenseSet)
    const {profile} = this.resolveProfile(flags)

    const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
    const tenantName = tenant.name

    let licenseValue: string
    let sourceFilePath: string | undefined

    if (flags.value) {
      licenseValue = flags.value
    } else {
      sourceFilePath = path.resolve(flags.file || `license_${tenantName}.yaml`)
      if (!fs.existsSync(sourceFilePath)) {
        this.error(`File not found: ${sourceFilePath}`)
      }

      licenseValue = fs.readFileSync(sourceFilePath, 'utf8')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/tenant/${tenantName}/license`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({value: licenseValue}),
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

      const result = await response.json()

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Sandbox environment license updated successfully for ${tenantName}`)
      }

      if (flags.clean && sourceFilePath && fs.existsSync(sourceFilePath)) {
        fs.unlinkSync(sourceFilePath)
        this.log(`Removed ${sourceFilePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set sandbox environment license: ${error.message}`)
      } else {
        this.error(`Failed to set sandbox environment license: ${String(error)}`)
      }
    }
  }
}
