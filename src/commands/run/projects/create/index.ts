import {Flags} from '@oclif/core'

import type {CreateProjectInput, Project} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunProjectsCreate extends BaseRunCommand {
  static args = {}
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
static override flags = {
    ...BaseRunCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      default: '',
      description: 'Project description',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Project name',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RunProjectsCreate)

    // Initialize (no project required for creating projects)
    await this.initRunCommand(flags.profile, flags.verbose)

    const input: CreateProjectInput = {
      description: flags.description || '',
      name: flags.name,
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
