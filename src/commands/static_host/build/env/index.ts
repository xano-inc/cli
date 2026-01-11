import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class StaticHostBuildEnv extends BaseCommand {
  static override description = 'Update static hosting environment variables for a build'

  static override examples = [
    `$ xano static_host build env default 52 -w 40 --set KEY=value
Environment updated successfully!
`,
    `$ xano static_host build env default 52 -w 40 --file .env
Environment updated from .env file
`,
    `$ xano static_host build env default 52 -w 40 -o json
{
  ...build data...
}
`,
  ]

  static override args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
    build_id: Args.string({
      description: 'Build ID',
      required: true,
    }),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    set: Flags.string({
      char: 's',
      description: 'Set environment variable (KEY=value format)',
      required: false,
      multiple: true,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Load environment variables from file (.env format)',
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

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostBuildEnv)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Parse environment variables
      const envVars: Record<string, string> = {}

      // From --set flags
      if (flags.set) {
        for (const pair of flags.set) {
          const eqIndex = pair.indexOf('=')
          if (eqIndex === -1) {
            this.error(`Invalid format for --set: ${pair}. Use KEY=value format.`)
          }
          const key = pair.substring(0, eqIndex)
          const value = pair.substring(eqIndex + 1)
          envVars[key] = value
        }
      }

      // From --file flag
      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#')) continue

          const eqIndex = trimmed.indexOf('=')
          if (eqIndex !== -1) {
            const key = trimmed.substring(0, eqIndex).trim()
            let value = trimmed.substring(eqIndex + 1).trim()
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1)
            }
            envVars[key] = value
          }
        }
      }

      if (Object.keys(envVars).length === 0) {
        this.error('Either --set or --file must be provided with environment variables')
      }

      const result = await client.updateStaticHostBuildEnv(
        workspaceId,
        args.static_host,
        args.build_id,
        envVars,
      )

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Environment updated successfully!')
        this.log(`Variables set: ${Object.keys(envVars).join(', ')}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
