import {Args, Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'
import type {SecretType, UpdateSecretInput} from '../../../../lib/run-types.js'

export default class RunSecretsSet extends BaseRunCommand {
  static args = {
    name: Args.string({
      description: 'Secret name',
      required: true,
    }),
  }

  static override flags = {
    ...BaseRunCommand.baseFlags,
    type: Flags.string({
      char: 't',
      description: 'Secret type',
      required: true,
      options: ['dockerconfigjson', 'service-account-token'],
    }),
    value: Flags.string({
      char: 'v',
      description: 'Secret value',
      required: true,
    }),
    repo: Flags.string({
      char: 'r',
      description: 'Repository (for dockerconfigjson type)',
      required: false,
    }),
  }

  static description = 'Set a secret'

  static examples = [
    `$ xano run secrets set docker-registry -t dockerconfigjson -v '{"auths":{"ghcr.io":{"auth":"..."}}}' -r ghcr.io
Secret 'docker-registry' set successfully!
`,
    `$ xano run secrets set service-key -t service-account-token -v 'token-value-here'
Secret 'service-key' set successfully!
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunSecretsSet)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile)

    // Map short type to full type
    const typeMap: Record<string, SecretType> = {
      'dockerconfigjson': 'kubernetes.io/dockerconfigjson',
      'service-account-token': 'kubernetes.io/service-account-token',
    }

    const secretType = typeMap[flags.type]
    if (!secretType) {
      this.error(`Invalid secret type: ${flags.type}`)
    }

    const input: UpdateSecretInput = {
      name: args.name,
      secret: {
        name: args.name,
        type: secretType,
        value: flags.value,
        ...(flags.repo && {repo: flags.repo}),
      },
    }

    try {
      const url = this.httpClient.buildProjectUrl('/secret')
      await this.httpClient.patch(url, input)

      this.log(`Secret '${args.name}' set successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set secret: ${error.message}`)
      } else {
        this.error(`Failed to set secret: ${String(error)}`)
      }
    }
  }
}
