import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface RunResult {
  message?: string
  results?: Array<{message?: string; status: string}>
  status: string
}

export default class EphemeralUnitTestRun extends BaseCommand {
  static override args = {
    unit_test_id: Args.string({
      description: 'ID of the unit test to run',
      required: true,
    }),
  }
  static description = 'Run a unit test for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral unit-test run abc-123 -t e1a2-b3c4-x5y6
Running unit test abc-123...
Result: PASS
`,
    `$ xano ephemeral unit-test run abc-123 -t e1a2-b3c4-x5y6 -o json`,
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
    tenant: Flags.string({
      char: 't',
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralUnitTestRun)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\nCreate a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${encodeURIComponent(flags.tenant)}/unit_test/${encodeURIComponent(args.unit_test_id)}/run`

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
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
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
      if (error instanceof Error) {
        this.error(`Failed to run unit test: ${error.message}`)
      } else {
        this.error(`Failed to run unit test: ${String(error)}`)
      }
    }
  }
}
