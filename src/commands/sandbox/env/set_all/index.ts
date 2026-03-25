import {Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class SandboxEnvSetAll extends BaseCommand {
  static description =
    'Set all environment variables for a sandbox environment from a YAML file (replaces all existing)'
  static examples = [
    `$ xano sandbox env set_all
Reads from env_<tenant>.yaml
`,
    `$ xano sandbox env set_all --file ./my-env.yaml`,
    `$ xano sandbox env set_all -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    clean: Flags.boolean({
      default: false,
      description: 'Remove the source file after successful upload',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to env file (default: env_<sandbox_name>.yaml)',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxEnvSetAll)
    const {profile} = this.resolveProfile(flags)

    const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
    const tenantName = tenant.name

    const sourceFilePath = path.resolve(flags.file || `env_${tenantName}.yaml`)

    if (!fs.existsSync(sourceFilePath)) {
      this.error(`File not found: ${sourceFilePath}`)
    }

    const fileContent = fs.readFileSync(sourceFilePath, 'utf8')
    const envMap = yaml.load(fileContent) as Record<string, string>

    if (!envMap || typeof envMap !== 'object') {
      this.error('Invalid env file format. Expected a YAML map of key: value pairs.')
    }

    const envs = Object.entries(envMap).map(([name, value]) => ({name, value: String(value)}))

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/tenant/${tenantName}/env_all`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({envs}),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      if (flags.output === 'json') {
        const result = await response.json()
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`All environment variables updated for sandbox environment ${tenantName} (${envs.length} variables)`)
      }

      if (flags.clean && fs.existsSync(sourceFilePath)) {
        fs.unlinkSync(sourceFilePath)
        this.log(`Removed ${sourceFilePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set sandbox environment variables: ${error.message}`)
      } else {
        this.error(`Failed to set sandbox environment variables: ${String(error)}`)
      }
    }
  }
}
