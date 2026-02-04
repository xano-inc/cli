import {Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'
import type {Project, CreateProjectInput} from '../../../../lib/run-types.js'

export default class RunProjectsCreate extends BaseRunCommand {
  static args = {}

  static override flags = {
    ...BaseRunCommand.baseFlags,
    name: Flags.string({
      char: 'n',
      description: 'Project name',
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Project description',
      required: false,
      default: '',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  static description = 'Create a new project'

  static examples = [
    `$ xano run projects create -n "My Project"
Project created successfully!
  ID:   abc123-def456-ghi789
  Name: My Project
`,
    `$ xano run projects create -n "My Project" -d "Description here"
Project created successfully!
  ID:   abc123-def456-ghi789
  Name: My Project
`,
    `$ xano run projects create -n "My Project" -o json
{ "id": "abc123-def456-ghi789", "name": "My Project", ... }
`,
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(RunProjectsCreate)

    // Initialize (no project required for creating projects)
    await this.initRunCommand(flags.profile)

    const input: CreateProjectInput = {
      name: flags.name,
      description: flags.description || '',
    }

    try {
      const url = this.httpClient.buildUrl('/project')
      const project = await this.httpClient.post<Project>(url, input)

      if (flags.output === 'json') {
        this.outputJson(project)
      } else {
        this.log('Project created successfully!')
        this.log(`  ID:          ${project.id}`)
        this.log(`  Name:        ${project.name}`)
        if (project.description) {
          this.log(`  Description: ${project.description}`)
        }
        this.log(`  Access:      ${project.access}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create project: ${error.message}`)
      } else {
        this.error(`Failed to create project: ${String(error)}`)
      }
    }
  }
}
