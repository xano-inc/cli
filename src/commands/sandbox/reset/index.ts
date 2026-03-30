import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

export default class SandboxReset extends BaseCommand {
  static description = 'Reset your sandbox environment (clears all workspace data and drafts)'
  static examples = [
    `$ xano sandbox reset
Are you sure you want to reset your sandbox environment? All workspace data and drafts will be cleared. (y/N) y
Sandbox environment has been reset.
`,
    `$ xano sandbox reset --force`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxReset)
    const {profile} = this.resolveProfile(flags)

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to reset your sandbox environment? All workspace data and drafts will be cleared.`,
      )
      if (!confirmed) {
        this.log('Reset cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/reset`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
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
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
      }

      this.log('Sandbox environment has been reset.')
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to reset sandbox environment: ${error.message}`)
      } else {
        this.error(`Failed to reset sandbox environment: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
  }
}
