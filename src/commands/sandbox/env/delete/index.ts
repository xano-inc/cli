import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class SandboxEnvDelete extends BaseCommand {
  static description = 'Delete an environment variable from a sandbox environment'
  static examples = [
    `$ xano sandbox env delete --name DATABASE_URL
Are you sure you want to delete environment variable 'DATABASE_URL'? (y/N) y
Environment variable 'DATABASE_URL' deleted
`,
    `$ xano sandbox env delete --name DATABASE_URL --force`,
    `$ xano sandbox env delete --name DATABASE_URL -f -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Environment variable name',
      required: true,
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
    const {flags} = await this.parse(SandboxEnvDelete)
    const {profile} = this.resolveProfile(flags)

    const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
    const tenantName = tenant.name
    const envName = flags.name

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete environment variable '${envName}' from sandbox environment ${tenantName}?`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/tenant/${tenantName}/env/${envName}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'DELETE',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({deleted: true, env_name: envName, tenant_name: tenantName}, null, 2))
      } else {
        this.log(`Environment variable '${envName}' deleted from sandbox environment ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete sandbox environment variable: ${error.message}`)
      } else {
        this.error(`Failed to delete sandbox environment variable: ${String(error)}`)
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
