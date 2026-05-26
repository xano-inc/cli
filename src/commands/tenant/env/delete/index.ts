import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class TenantEnvDelete extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Delete an environment variable from a tenant'
  static examples = [
    `$ xano tenant env delete my-tenant --name DATABASE_URL
Are you sure you want to delete environment variable 'DATABASE_URL' from tenant my-tenant? (y/N) y
Environment variable 'DATABASE_URL' deleted from tenant my-tenant
`,
    `$ xano tenant env delete my-tenant --name DATABASE_URL --force
Environment variable 'DATABASE_URL' deleted from tenant my-tenant
`,
    `$ xano tenant env delete my-tenant --name DATABASE_URL -f -w 5 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[IMPORTANT] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantEnvDelete)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const envName = flags.name

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete environment variable '${envName}' from tenant ${tenantName}?`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/env/${envName}`

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
        this.log(`Environment variable '${envName}' deleted from tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete tenant environment variable: ${error.message}`)
      } else {
        this.error(`Failed to delete tenant environment variable: ${String(error)}`)
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
