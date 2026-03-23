import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class EphemeralEnvGetAll extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
  static description = 'Get all environment variables for an ephemeral tenant and save to a YAML file'
  static examples = [
    `$ xano ephemeral env get_all my-tenant
Environment variables saved to env_my-tenant.yaml
`,
    `$ xano ephemeral env get_all my-tenant --file ./my-env.yaml`,
    `$ xano ephemeral env get_all my-tenant --view`,
    `$ xano ephemeral env get_all my-tenant -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Output file path (default: env_<tenant_name>.yaml)',
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
      description: 'Print environment variables to stdout instead of saving to file',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralEnvGetAll)

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
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}/env_all`

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

      const envMap = (await response.json()) as Record<string, string>

      if (flags.output === 'json') {
        this.log(JSON.stringify(envMap, null, 2))
      } else if (flags.view) {
        const envYaml = yaml.dump(envMap, {lineWidth: -1, sortKeys: true})
        this.log(envYaml.trimEnd())
      } else {
        const filePath = path.resolve(flags.file || `env_${tenantName}.yaml`)
        const envYaml = yaml.dump(envMap, {lineWidth: -1, sortKeys: true})
        fs.writeFileSync(filePath, envYaml, 'utf8')
        this.log(`Environment variables saved to ${filePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get ephemeral tenant environment variables: ${error.message}`)
      } else {
        this.error(`Failed to get ephemeral tenant environment variables: ${String(error)}`)
      }
    }
  }
}
