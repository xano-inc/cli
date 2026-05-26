import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class TenantClusterDelete extends BaseCommand {
  static override args = {
    cluster_id: Args.integer({
      description: 'Cluster ID to delete',
      required: true,
    }),
  }
  static description =
    '[CRITICAL] NEVER run without explicit user confirmation; this removes an entire cluster. Deletes a tenant cluster permanently.'
  static examples = [
    `$ xano tenant cluster delete 3
Are you sure you want to delete tenant cluster 3? This action cannot be undone. (y/N) y
Tenant cluster 3 deleted successfully
`,
    `$ xano tenant cluster delete 3 --force
Tenant cluster 3 deleted successfully
`,
    `$ xano tenant cluster delete 3 -f -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[CRITICAL] Skips the confirmation prompt.',
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
    const {args, flags} = await this.parse(TenantClusterDelete)

    const {profile} = this.resolveProfile(flags)

    const clusterId = args.cluster_id

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete tenant cluster ${clusterId}? This action cannot be undone.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/tenant/cluster/${clusterId}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'DELETE',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({cluster_id: clusterId, deleted: true}, null, 2))
      } else {
        this.log(`Tenant cluster ${clusterId} deleted successfully`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete tenant cluster: ${error.message}`)
      } else {
        this.error(`Failed to delete tenant cluster: ${String(error)}`)
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
