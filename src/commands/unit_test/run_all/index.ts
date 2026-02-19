import {Flags} from '@oclif/core'
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

interface UnitTest {
  id: string
  name: string
  obj_name: string
  obj_type: string
}

interface RunResult {
  message?: string
  results?: Array<{message?: string; status: string}>
  status: string
}

interface TestResult {
  message?: string
  name: string
  obj_name: string
  obj_type: string
  status: 'fail' | 'pass'
}

export default class UnitTestRunAll extends BaseCommand {
  static description = 'Run all unit tests in a workspace'
  static examples = [
    `$ xano unit-test run-all
Running 5 unit tests...

PASS  my-test [function: math]
PASS  auth-check [query: /user/login]
FAIL  data-validation [function: validate]
      Error: assertion failed

Results: 2 passed, 1 failed
`,
    `$ xano unit-test run-all --obj-type function -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Filter by branch name',
      required: false,
    }),
    'obj-type': Flags.string({
      description: 'Filter by object type',
      options: ['function', 'query', 'middleware'],
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
    const {flags} = await this.parse(UnitTestRunAll)

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
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/unit_test`

    try {
      // Step 1: List all unit tests
      const listParams = new URLSearchParams()
      listParams.set('per_page', '10000')
      if (flags.branch) {
        listParams.set('branch', flags.branch)
      }

      if (flags['obj-type']) {
        listParams.set('obj_type', flags['obj-type'])
      }

      const listResponse = await this.verboseFetch(
        `${baseUrl}?${listParams}`,
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

      if (!listResponse.ok) {
        const errorText = await listResponse.text()
        this.error(`Failed to list unit tests: ${listResponse.status}: ${listResponse.statusText}\n${errorText}`)
      }

      const data = (await listResponse.json()) as UnitTest[] | {items?: UnitTest[]}

      let tests: UnitTest[]
      if (Array.isArray(data)) {
        tests = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        tests = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (tests.length === 0) {
        this.log('No unit tests found')
        return
      }

      if (flags.output === 'summary') {
        this.log(`Running ${tests.length} unit test${tests.length === 1 ? '' : 's'}...\n`)
      }

      // Step 2: Run each test
      const results: TestResult[] = []

      for (const test of tests) {
        const runUrl = `${baseUrl}/${test.id}/run`

        try {
          const runResponse = await this.verboseFetch(
            runUrl,
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

          if (!runResponse.ok) {
            const errorText = await runResponse.text()
            const result: TestResult = {
              message: `API error ${runResponse.status}: ${errorText}`,
              name: test.name,
              obj_name: test.obj_name,
              obj_type: test.obj_type,
              status: 'fail',
            }
            results.push(result)

            if (flags.output === 'summary') {
              this.log(`FAIL  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
              this.log(`      Error: API error ${runResponse.status}`)
            }

            continue
          }

          const runResult = (await runResponse.json()) as RunResult
          const passed = runResult.status === 'ok'
          const failedExpects = runResult.results?.filter((r) => r.status === 'fail') ?? []
          const result: TestResult = {
            message: failedExpects[0]?.message,
            name: test.name,
            obj_name: test.obj_name,
            obj_type: test.obj_type,
            status: passed ? 'pass' : 'fail',
          }
          results.push(result)

          if (flags.output === 'summary') {
            if (passed) {
              this.log(`PASS  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
            } else {
              this.log(`FAIL  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
              for (const expect of failedExpects) {
                if (expect.message) {
                  this.log(`      Error: ${expect.message}`)
                }
              }
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          results.push({
            message,
            name: test.name,
            obj_name: test.obj_name,
            obj_type: test.obj_type,
            status: 'fail',
          })

          if (flags.output === 'summary') {
            this.log(`FAIL  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
            this.log(`      Error: ${message}`)
          }
        }
      }

      // Step 3: Summary
      const passed = results.filter((r) => r.status === 'pass').length
      const failed = results.filter((r) => r.status === 'fail').length

      if (flags.output === 'json') {
        this.log(JSON.stringify({passed, failed, results}, null, 2))
      } else {
        this.log(`\nResults: ${passed} passed, ${failed} failed`)
      }

      if (failed > 0) {
        process.exitCode = 1
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to run unit tests: ${error.message}`)
      } else {
        this.error(`Failed to run unit tests: ${String(error)}`)
      }
    }
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}\n` + `Create a profile using 'xano profile create'`)
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
