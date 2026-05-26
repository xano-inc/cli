import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

export default class TenantDelete extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to delete',
      required: true,
    }),
  }
  static description = 'Delete a tenant permanently. This destroys all associated infrastructure and cannot be undone.'
  static examples = [
    `$ xano tenant delete t1234-abcd-xyz1
Are you sure you want to delete tenant t1234-abcd-xyz1? This action cannot be undone. (y/N) y
Deleted tenant t1234-abcd-xyz1
`,
    `$ xano tenant delete t1234-abcd-xyz1 --force
Deleted tenant t1234-abcd-xyz1
`,
    `$ xano tenant delete t1234-abcd-xyz1 -f -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[CRITICAL] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDelete)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const tenantName = args.tenant_name

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete tenant ${tenantName}? This action cannot be undone.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}`

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
        this.log(JSON.stringify({deleted: true, tenant_name: tenantName}, null, 2))
      } else {
        this.log(`Deleted tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete tenant: ${error.message}`)
      } else {
        this.error(`Failed to delete tenant: ${String(error)}`)
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
