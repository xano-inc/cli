import {Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

export default class SandboxEnvGetAll extends BaseCommand {
  static description = 'Get all environment variables for a sandbox environment and save to a YAML file'
  static examples = [
    `$ xano sandbox env get_all
Environment variables saved to env_<tenant>.yaml
`,
    `$ xano sandbox env get_all --file ./my-env.yaml`,
    `$ xano sandbox env get_all --view`,
    `$ xano sandbox env get_all -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Output file path (default: env_<sandbox_name>.yaml)',
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
    const {flags} = await this.parse(SandboxEnvGetAll)
    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/env_all`

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

      const envMap = (await response.json()) as Record<string, string>

      if (flags.output === 'json') {
        this.log(JSON.stringify(envMap, null, 2))
      } else if (flags.view) {
        const envYaml = yaml.dump(envMap, {lineWidth: -1, sortKeys: true})
        this.log(envYaml.trimEnd())
      } else {
        const filePath = path.resolve(flags.file || `env.yaml`)
        const envYaml = yaml.dump(envMap, {lineWidth: -1, sortKeys: true})
        fs.writeFileSync(filePath, envYaml, 'utf8')
        this.log(`Environment variables saved to ${filePath}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get sandbox environment variables: ${error.message}`)
      } else {
        this.error(`Failed to get sandbox environment variables: ${String(error)}`)
      }
    }
  }
}
