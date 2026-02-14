import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

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

interface ExportLink {
  src: string
}

export default class ReleaseExport extends BaseCommand {
  static override args = {
    release_id: Args.integer({
      description: 'Release ID to export',
      required: true,
    }),
  }
  static description = 'Export (download) a release to a local file'
  static examples = [
    `$ xano release export 10
Downloaded release #10 to ./release-10.tar.gz
`,
    `$ xano release export 10 --output ./backups/my-release.tar.gz`,
    `$ xano release export 10 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    format: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    output: Flags.string({
      description: 'Output file path (defaults to ./release-{id}.tar.gz)',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleaseExport)

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

    const releaseId = args.release_id

    // Step 1: Get signed download URL
    const exportUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseId}/export`

    try {
      const response = await this.verboseFetch(
        exportUrl,
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

      const exportLink = await response.json() as ExportLink

      if (!exportLink.src) {
        this.error('API did not return a download URL')
      }

      // Step 2: Download the file
      const outputPath = flags.output || `release-${releaseId}.tar.gz`
      const resolvedPath = path.resolve(outputPath)

      const downloadResponse = await fetch(exportLink.src)

      if (!downloadResponse.ok) {
        this.error(
          `Failed to download release: ${downloadResponse.status} ${downloadResponse.statusText}`,
        )
      }

      if (!downloadResponse.body) {
        this.error('Download response has no body')
      }

      const fileStream = fs.createWriteStream(resolvedPath)
      const reader = downloadResponse.body.getReader()

      let totalBytes = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const {done, value} = await reader.read()
        if (done) break
        fileStream.write(value)
        totalBytes += value.length
      }

      fileStream.end()
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve)
        fileStream.on('error', reject)
      })

      if (flags.format === 'json') {
        this.log(JSON.stringify({bytes: totalBytes, file: resolvedPath, release_id: releaseId}, null, 2))
      } else {
        const sizeMb = (totalBytes / 1024 / 1024).toFixed(2)
        this.log(`Downloaded release #${releaseId} to ${resolvedPath} (${sizeMb} MB)`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to export release: ${error.message}`)
      } else {
        this.error(`Failed to export release: ${String(error)}`)
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
