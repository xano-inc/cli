import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class SandboxWorkflowTestDelete extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test to delete',
      required: true,
    }),
  }
  static description = 'Delete a workflow test for a sandbox environment'
  static examples = [
    `$ xano sandbox workflow-test delete 42
Deleted workflow test 42
`,
    `$ xano sandbox workflow-test delete 42 -o json`,
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
    const {args, flags} = await this.parse(SandboxWorkflowTestDelete)
    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/workflow_test/${args.workflow_test_id}`

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
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
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
}
