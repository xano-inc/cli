import {Args, Flags} from '@oclif/core'
import * as readline from 'node:readline'

import BaseCommand from '../../../base-command.js'

export default class WorkflowTestDelete extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test to delete',
      required: true,
    }),
  }
  static description = 'Delete a workflow test'
  static examples = [
    `$ xano workflow-test delete 1
Are you sure you want to delete workflow test 1? (y/N) y
Deleted workflow test 1
`,
    `$ xano workflow-test delete 1 --force`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[IMPORTANT] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
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
    const {args, flags} = await this.parse(WorkflowTestDelete)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    if (!flags.force) {
      const confirmed = await this.confirm(`Are you sure you want to delete workflow test ${args.workflow_test_id}? (y/N) `)
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/workflow_test/${args.workflow_test_id}`

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
        this.log(JSON.stringify({deleted: true, workflow_test_id: args.workflow_test_id}, null, 2))
      } else {
        this.log(`Deleted workflow test ${args.workflow_test_id}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete workflow test: ${error.message}`)
      } else {
        this.error(`Failed to delete workflow test: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
  }
}
