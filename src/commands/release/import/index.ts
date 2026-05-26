import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

interface ImportResult {
  id: number
}

export default class ReleaseImport extends BaseCommand {
  static override args = {}
  static description =
    '[IMPORTANT] ALWAYS confirm with the user before importing a release. Imports a release file into a workspace.'
  static examples = [
    `$ xano release import --file ./my-release.tar.gz
Imported release as #15
`,
    `$ xano release import --file ./my-release.tar.gz -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Path to the release file (.tar.gz)',
      required: true,
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
    const {flags} = await this.parse(ReleaseImport)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const filePath = path.resolve(flags.file)

    if (!fs.existsSync(filePath)) {
      this.error(`File not found: ${filePath}`)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/import`

    try {
      const fileBuffer = fs.readFileSync(filePath)
      const blob = new Blob([fileBuffer], {type: 'application/gzip'})

      const formData = new FormData()
      formData.append('file', blob, path.basename(filePath))

      const response = await this.verboseFetch(
        apiUrl,
        {
          body: formData,
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
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

      const result = await response.json() as ImportResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(2)
        this.log(`Imported release as #${result.id} (${sizeMb} MB)`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to import release: ${error.message}`)
      } else {
        this.error(`Failed to import release: ${String(error)}`)
      }
    }
  }
}
