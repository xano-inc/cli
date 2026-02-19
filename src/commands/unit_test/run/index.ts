import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
}

interface RunResult {
  message?: string
  results?: Array<{message?: string; status: string}>
  status: string
}

export default class UnitTestRun extends BaseCommand {
  static override args = {
    unit_test_id: Args.string({
      description: 'ID of the unit test to run',
      required: true,
    }),
  }
  static description = 'Run a unit test'
  static examples = [
    `$ xano unit-test run abc-123
Running unit test abc-123...
Result: PASS
`,
    `$ xano unit-test run abc-123 -o json`,
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(UnitTestRun)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/unit_test/${args.unit_test_id}/run`

    try {
      if (flags.output === 'summary') {
        this.log(`Running unit test ${args.unit_test_id}...`)
      }

      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
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

      const result = await response.json() as RunResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        if (result.status === 'ok') {
          this.log('Result: PASS')
        } else {
          this.log('Result: FAIL')
          const failedExpects = result.results?.filter(r => r.status === 'fail') ?? []
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

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      return parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }
  }
}
