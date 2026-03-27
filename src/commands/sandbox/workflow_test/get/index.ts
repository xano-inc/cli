import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class SandboxWorkflowTestGet extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test',
      required: true,
    }),
  }
  static description = 'Get a workflow test for a sandbox environment'
  static examples = [`$ xano sandbox workflow-test get 42`, `$ xano sandbox workflow-test get 42 -o json`]
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
    const {args, flags} = await this.parse(SandboxWorkflowTestGet)
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
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const test = await response.json()

      if (flags.output === 'json') {
        this.log(JSON.stringify(test, null, 2))
      } else {
        const t = test as {description?: string; id: number; name: string}
        this.log(`Workflow Test: ${t.name} (ID: ${t.id})`)
        if (t.description) this.log(`  Description: ${t.description}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get workflow test: ${error.message}`)
      } else {
        this.error(`Failed to get workflow test: ${String(error)}`)
      }
    }
  }
}
