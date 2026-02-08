import {Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'
import type {Project} from '../../../../lib/run-types.js'

export default class RunProjectsList extends BaseRunCommand {
  static args = {}

  static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'table',
      options: ['table', 'json'],
    }),
  }

  static description = 'List all projects'

  static examples = [
    `$ xano run projects list
ID                                    NAME           ACCESS
abc123-def456-ghi789                  My Project     private
xyz789-uvw456-rst123                  Test Project   public
`,
    `$ xano run projects list -o json
[
  { "id": "abc123-def456-ghi789", "name": "My Project", ... }
]
`,
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(RunProjectsList)

    // Initialize (no project required for listing projects)
    await this.initRunCommand(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildUrl('/project')
      const projects = await this.httpClient.get<Project[]>(url)

      if (flags.output === 'json') {
        this.outputJson(projects)
      } else {
        this.outputTable(projects)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list projects: ${error.message}`)
      } else {
        this.error(`Failed to list projects: ${String(error)}`)
      }
    }
  }

  private outputTable(projects: Project[]): void {
    if (projects.length === 0) {
      this.log('No projects found.')
      return
    }

    // Print header
    this.log('ID                                    NAME                      ACCESS')
    this.log('-'.repeat(75))

    for (const project of projects) {
      const id = project.id.padEnd(36)
      const name = project.name.slice(0, 24).padEnd(25)
      const access = project.access
      this.log(`${id}  ${name} ${access}`)
    }
  }
}
