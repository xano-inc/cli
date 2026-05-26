import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../../base-command.js'

export default class TenantClusterLicenseSet extends BaseCommand {
  static override args = {
    cluster_id: Args.integer({
      description: 'Tenant cluster ID',
      required: true,
    }),
  }
  static description = 'Set/update the license (kubeconfig) for a tenant cluster'
  static examples = [
    `$ xano tenant cluster license set 1
Reads from kubeconfig-1.yaml
`,
    `$ xano tenant cluster license set 1 --file ./kubeconfig.yaml`,
    `$ xano tenant cluster license set 1 --value 'apiVersion: v1...'`,
    `$ xano tenant cluster license set 1 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    clean: Flags.boolean({
      default: false,
      description:
        '[IMPORTANT] ALWAYS confirm with the user before deleting the source kubeconfig file after upload. Removes the source file after successful upload.',
      exclusive: ['value'],
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to kubeconfig file (default: kubeconfig_<cluster_id>.yaml)',
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
      description: 'Inline kubeconfig YAML value',
      exclusive: ['file', 'clean'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantClusterLicenseSet)

    const clusterId = args.cluster_id
    let licenseValue: string
    let sourceFilePath: string | undefined

    if (flags.value) {
      licenseValue = flags.value
    } else {
      sourceFilePath = path.resolve(flags.file || `kubeconfig_${clusterId}.yaml`)
      if (!fs.existsSync(sourceFilePath)) {
        this.error(`File not found: ${sourceFilePath}`)
      }

      licenseValue = fs.readFileSync(sourceFilePath, 'utf8')
    }

    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/tenant/cluster/${clusterId}/license`

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
        this.log(`Tenant cluster license updated successfully for cluster ${clusterId}`)
      }

      if (flags.clean && sourceFilePath && fs.existsSync(sourceFilePath)) {
        fs.unlinkSync(sourceFilePath)
        this.log(`Removed ${sourceFilePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set tenant cluster license: ${error.message}`)
      } else {
        this.error(`Failed to set tenant cluster license: ${String(error)}`)
      }
    }
  }

}
