import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class TenantEnvGetAll extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Get all environment variables for a tenant and save to a YAML file'
  static examples = [
    `$ xano tenant env get_all my-tenant
Environment variables saved to env_my-tenant.yaml
`,
    `$ xano tenant env get_all my-tenant --file ./my-env.yaml`,
    `$ xano tenant env get_all my-tenant --view`,
    `$ xano tenant env get_all my-tenant -o json`,
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantEnvGetAll)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/env_all`

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
        this.error(`Failed to get tenant environment variables: ${error.message}`)
      } else {
        this.error(`Failed to get tenant environment variables: ${String(error)}`)
      }
    }
  }

}
