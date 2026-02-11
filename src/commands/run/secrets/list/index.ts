import {Flags} from '@oclif/core'

import type {SecretKeysResponse} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSecretsList extends BaseRunCommand {
  static args = {}
static description = 'List all secret keys'
static examples = [
    `$ xano run secrets list
NAME                TYPE                                  REPO
docker-registry     kubernetes.io/dockerconfigjson        ghcr.io
service-account     kubernetes.io/service-account-token   -
`,
    `$ xano run secrets list -o json
{ "secrets": [{ "name": "docker-registry", "type": "kubernetes.io/dockerconfigjson", "repo": "ghcr.io" }] }
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'table',
      description: 'Output format',
      options: ['table', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RunSecretsList)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildProjectUrl('/secret/key')
      const result = await this.httpClient.get<SecretKeysResponse>(url)

      if (flags.output === 'json') {
        this.outputJson(result)
      } else if (result.secrets.length === 0) {
          this.log('No secrets found.')
        } else {
          // Print header
          this.log('NAME                     TYPE                                  REPO')
          this.log('-'.repeat(80))

          for (const secret of result.secrets) {
            const name = secret.name.slice(0, 24).padEnd(24)
            const type = secret.type.padEnd(37)
            const repo = secret.repo || '-'
            this.log(`${name} ${type} ${repo}`)
          }
        }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list secrets: ${error.message}`)
      } else {
        this.error(`Failed to list secrets: ${String(error)}`)
      }
    }
  }
}
