import {Args, Flags} from '@oclif/core'
import * as readline from 'node:readline'

import BaseCommand from '../../../../base-command.js'

export default class TenantBackupDelete extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name that owns the backup',
      required: true,
    }),
  }
  static description =
    '[CRITICAL] NEVER delete a backup without explicit user confirmation; this removes your restore point. Deletes a tenant backup permanently.'
  static examples = [
    `$ xano tenant backup delete t1234-abcd-xyz1 --backup_id 10
Are you sure you want to delete backup #10? This action cannot be undone. (y/N) y
Deleted backup #10
`,
    `$ xano tenant backup delete t1234-abcd-xyz1 --backup_id 10 --force`,
    `$ xano tenant backup delete t1234-abcd-xyz1 --backup_id 10 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    backup_id: Flags.integer({
      description: 'Backup ID to delete',
      required: true,
    }),
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantBackupDelete)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const backupId = flags.backup_id

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete backup #${backupId}? This action cannot be undone.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/backup/${backupId}`

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
        this.log(JSON.stringify({backup_id: backupId, deleted: true, tenant_name: tenantName}, null, 2))
      } else {
        this.log(`Deleted backup #${backupId}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete backup: ${error.message}`)
      } else {
        this.error(`Failed to delete backup: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
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
