import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class TenantLicenseSet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Set/update the license for a tenant'
  static examples = [
    `$ xano tenant license set my-tenant
Reads from license_my-tenant.yaml
`,
    `$ xano tenant license set my-tenant --file ./license.yaml`,
    `$ xano tenant license set my-tenant --value 'key: value'`,
    `$ xano tenant license set my-tenant -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    clean: Flags.boolean({
      default: false,
      description:
        '[IMPORTANT] ALWAYS confirm with the user before deleting the source license file after upload. Removes the source file after successful upload.',
      exclusive: ['value'],
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to license file (default: license_<tenant_name>.yaml)',
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantLicenseSet)

    const tenantName = args.tenant_name
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

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/license`

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
        this.log(`Tenant license updated successfully for ${tenantName}`)
      }

      if (flags.clean && sourceFilePath && fs.existsSync(sourceFilePath)) {
        fs.unlinkSync(sourceFilePath)
        this.log(`Removed ${sourceFilePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set tenant license: ${error.message}`)
      } else {
        this.error(`Failed to set tenant license: ${String(error)}`)
      }
    }
  }

}
