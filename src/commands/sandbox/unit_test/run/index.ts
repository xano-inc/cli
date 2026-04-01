import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface RunResult {
  message?: string
  results?: Array<{message?: string; status: string}>
  status: string
}

export default class SandboxUnitTestRun extends BaseCommand {
  static override args = {
    unit_test_id: Args.string({
      description: 'ID of the unit test to run',
      required: true,
    }),
  }
  static description = 'Run a unit test for a sandbox environment'
  static examples = [
    `$ xano sandbox unit-test run abc-123
Running unit test abc-123...
Result: PASS
`,
    `$ xano sandbox unit-test run abc-123 -o json`,
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
    const {args, flags} = await this.parse(SandboxUnitTestRun)
    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/unit_test/${encodeURIComponent(args.unit_test_id)}/run`

    try {
      if (flags.output === 'summary') {
        this.log(`Running unit test ${args.unit_test_id}...`)
      }

      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
      }

      const result = (await response.json()) as RunResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        if (result.status === 'ok') {
          this.log('Result: PASS')
        } else {
          this.log('Result: FAIL')
          const failedExpects = result.results?.filter((r) => r.status === 'fail') ?? []
          for (const expect of failedExpects) {
            if (expect.message) {
              this.log(`  Error: ${expect.message}`)
            }
          }

          this.exit(1)
        }
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to run unit test: ${error.message}`)
      } else {
        this.error(`Failed to run unit test: ${String(error)}`)
      }
    }
  }
}
