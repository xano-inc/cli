import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

export default class SandboxGet extends BaseCommand {
  static description = 'Get your sandbox environment (creates one if it does not exist)'
  static examples = [
    `$ xano sandbox get
Sandbox Environment: (tc24-abcd-x1y2)
  State: ok
  License: tier1
`,
    `$ xano sandbox get -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxGet)
    const {profile} = this.resolveProfile(flags)

    try {
      const tenant = await this.getOrCreateSandbox(profile, flags.verbose)

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Sandbox Environment: ${tenant.display || tenant.name} (${tenant.name})`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
        if (tenant.xano_domain) this.log(`  Domain: ${tenant.xano_domain}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get sandbox environment: ${error.message}`)
      } else {
        this.error(`Failed to get sandbox environment: ${String(error)}`)
      }
    }
  }
}
