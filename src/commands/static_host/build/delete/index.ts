import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class StaticHostBuildDelete extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
  static description = 'Delete a static host build permanently. This action cannot be undone.'
  static examples = [
    `$ xano static_host build delete default --build_id 52
Are you sure you want to delete build 52 from static host 'default'? This action cannot be undone. (y/N) y
Deleted build 52 from static host 'default'
`,
    `$ xano static_host build delete default --build_id 52 --force
Deleted build 52 from static host 'default'
`,
    `$ xano static_host build delete myhost --build_id 123 -w 40 -f
Deleted build 123 from static host 'myhost'
`,
    `$ xano static_host build delete default --build_id 52 -f -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    build_id: Flags.string({
      description: 'Build ID to delete',
      required: true,
    }),
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
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostBuildDelete)

    const {profile, profileName} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano static_host build delete <static_host> --build_id <id> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete build ${flags.build_id} from static host '${args.static_host}'? This action cannot be undone.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build/${flags.build_id}`

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
        this.log(JSON.stringify({build_id: flags.build_id, deleted: true, static_host: args.static_host}, null, 2))
      } else {
        this.log(`Deleted build ${flags.build_id} from static host '${args.static_host}'`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete build: ${error.message}`)
      } else {
        this.error(`Failed to delete build: ${String(error)}`)
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
