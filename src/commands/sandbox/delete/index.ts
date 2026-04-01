import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

export default class SandboxDelete extends BaseCommand {
  static description =
    'Delete your sandbox environment completely (debugging only — it will be re-created on next access)'
  static examples = [
    `$ xano sandbox delete
Are you sure you want to DELETE your sandbox environment? This destroys all data. (y/N) y
Sandbox environment deleted.
`,
    `$ xano sandbox delete --force`,
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
    const {flags} = await this.parse(SandboxDelete)
    const {profile} = this.resolveProfile(flags)

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to DELETE your sandbox environment? This destroys all data and the tenant will be re-created on next access.`,
      )
      if (!confirmed) {
        this.log('Delete cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/me`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'DELETE',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const message = await this.parseApiError(response, 'Failed to delete sandbox environment')
        this.error(message)
      }

      this.log('Sandbox environment deleted.')
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to delete sandbox environment: ${error.message}`)
      } else {
        this.error(`Failed to delete sandbox environment: ${String(error)}`)
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
