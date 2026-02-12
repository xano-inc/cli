import {Args, Flags} from '@oclif/core'

import type {SecretValueResponse} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSecretsGet extends BaseRunCommand {
  static args = {
    name: Args.string({
      description: 'Secret name',
      required: true,
    }),
  }
static description = 'Get a secret value'
static examples = [
    `$ xano run secrets get docker-registry
{"auths":{"ghcr.io":{"auth":"..."}}}
`,
    `$ xano run secrets get docker-registry -o json
{ "name": "docker-registry", "type": "kubernetes.io/dockerconfigjson", "value": "..." }
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'value',
      description: 'Output format',
      options: ['value', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunSecretsGet)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildProjectUrl('/secret', {name: args.name})
      const result = await this.httpClient.get<SecretValueResponse>(url)

      if (flags.output === 'json') {
        this.outputJson(result)
      } else {
        this.log(result.value)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get secret: ${error.message}`)
      } else {
        this.error(`Failed to get secret: ${String(error)}`)
      }
    }
  }
}
