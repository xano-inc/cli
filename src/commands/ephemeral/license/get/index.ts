import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class EphemeralLicenseGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
  static description = 'Get the license for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral license get my-tenant
License saved to license_my-tenant.yaml
`,
    `$ xano ephemeral license get my-tenant --file ./my-license.yaml`,
    `$ xano ephemeral license get my-tenant --view`,
    `$ xano ephemeral license get my-tenant -o json`,
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralLicenseGet)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}/license`

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
        this.error(`Failed to get ephemeral tenant license: ${error.message}`)
      } else {
        this.error(`Failed to get ephemeral tenant license: ${String(error)}`)
      }
    }
  }
}
