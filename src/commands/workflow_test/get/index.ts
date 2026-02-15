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

interface WorkflowTest {
  branch?: {id: number; name?: string}
  created_at?: string
  description?: string
  id: number
  name: string
  tag?: string[]
  updated_at?: string
  xanoscript?: {message?: string; status: string; value?: string}
}

export default class WorkflowTestGet extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test',
      required: true,
    }),
  }
  static description = 'Get a specific workflow test'
  static examples = [
    `$ xano workflow-test get 1
Workflow Test: my-test (ID: 1)
  Description: Validates auth endpoints
  Branch: main
`,
    `$ xano workflow-test get 1 -o xs`,
    `$ xano workflow-test get 1 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    'include-draft': Flags.boolean({
      default: false,
      description: 'Include draft version',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json', 'xs'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkflowTestGet)

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

    const params = new URLSearchParams({include_xanoscript: 'true'})
    if (flags['include-draft']) {
      params.set('include_draft', 'true')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/workflow_test/${args.workflow_test_id}?${params}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
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

      const test = await response.json() as WorkflowTest

      if (flags.output === 'json') {
        this.log(JSON.stringify(test, null, 2))
      } else if (flags.output === 'xs') {
        if (test.xanoscript?.status === 'ok' && test.xanoscript.value) {
          this.log(test.xanoscript.value)
        } else {
          this.error(`XanoScript not available: ${test.xanoscript?.message || 'unknown error'}`)
        }
      } else {
        this.log(`Workflow Test: ${test.name} (ID: ${test.id})`)
        if (test.description) {
          this.log(`  Description: ${test.description}`)
        }

        if (test.branch?.name) {
          this.log(`  Branch: ${test.branch.name}`)
        } else if (test.branch?.id) {
          this.log(`  Branch ID: ${test.branch.id}`)
        }

        if (test.tag && test.tag.length > 0) {
          this.log(`  Tags: ${test.tag.join(', ')}`)
        }

        if (test.created_at) {
          this.log(`  Created: ${test.created_at}`)
        }

        if (test.updated_at) {
          this.log(`  Updated: ${test.updated_at}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get workflow test: ${error.message}`)
      } else {
        this.error(`Failed to get workflow test: ${String(error)}`)
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
