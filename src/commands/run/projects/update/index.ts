import {Args, Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'
import type {Project, UpdateProjectInput} from '../../../../lib/run-types.js'

export default class RunProjectsUpdate extends BaseRunCommand {
  static args = {
    projectId: Args.string({
      description: 'Project ID to update',
      required: true,
    }),
  }

  static override flags = {
    ...BaseRunCommand.baseFlags,
    name: Flags.string({
      char: 'n',
      description: 'New project name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New project description',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  static description = 'Update a project'

  static examples = [
    `$ xano run projects update abc123-def456 -n "New Name"
Project updated successfully!
  ID:   abc123-def456
  Name: New Name
`,
    `$ xano run projects update abc123-def456 -d "New description"
Project updated successfully!
  ID:          abc123-def456
  Description: New description
`,
    `$ xano run projects update abc123-def456 -n "New Name" -o json
{ "id": "abc123-def456", "name": "New Name", ... }
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunProjectsUpdate)

    // Initialize (no project required)
    await this.initRunCommand(flags.profile, flags.verbose)

    // Check if any update flags were provided
    if (!flags.name && flags.description === undefined) {
      this.error('At least one of --name or --description must be provided')
    }

    const input: UpdateProjectInput = {}
    if (flags.name) {
      input.name = flags.name
    }
    if (flags.description !== undefined) {
      input.description = flags.description
    }

    try {
      const url = this.httpClient.buildUrl(`/project/${args.projectId}`)
      const project = await this.httpClient.patch<Project>(url, input)

      if (flags.output === 'json') {
        this.outputJson(project)
      } else {
        this.log('Project updated successfully!')
        this.log(`  ID:          ${project.id}`)
        this.log(`  Name:        ${project.name}`)
        if (project.description) {
          this.log(`  Description: ${project.description}`)
        }
        this.log(`  Access:      ${project.access}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to update project: ${error.message}`)
      } else {
        this.error(`Failed to update project: ${String(error)}`)
      }
    }
  }
}
