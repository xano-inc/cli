import {Args, Command, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import {resolveCredentialsPath} from '../../../base-command.js'
import {LOCAL_PROFILE_FILENAME, type LocalProfileConfig} from '../../../utils/local-config.js'

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: unknown
  }
}

/**
 * Ensure `entry` exists as its own line in a .gitignore.
 * Returns the (possibly unchanged) content and whether a write is needed.
 */
export function ensureGitignoreEntry(
  existing: null | string,
  entry: string,
): {changed: boolean; content: string} {
  const lines = existing ? existing.split('\n').map((line) => line.trim()) : []
  if (lines.includes(entry)) {
    return {changed: false, content: existing ?? ''}
  }

  const base = existing && !existing.endsWith('\n') ? existing + '\n' : existing ?? ''
  return {changed: true, content: `${base}${entry}\n`}
}

export default class ProfileUse extends Command {
  static args = {
    name: Args.string({
      description: 'Profile name (from credentials.yaml) to pin for this project',
      required: true,
    }),
  }
  static description =
    'Pin a profile for the current project by writing a local profile.yaml. ' +
    'When present, the CLI uses this profile (and any overrides) instead of the default, ' +
    'unless -p/--profile or XANO_PROFILE is set.'
  static examples = [
    `$ xano profile use brice-dev
Wrote profile.yaml pinning profile 'brice-dev'
`,
    `$ xano profile use brice-dev -w 110
Wrote profile.yaml pinning profile 'brice-dev' (workspace 110)
`,
    `$ xano profile use brice-dev -w 110 --gitignore
Wrote profile.yaml pinning profile 'brice-dev' (workspace 110)
Added profile.yaml to .gitignore
`,
  ]
  static override flags = {
    // eslint-disable-next-line camelcase
    account_origin: Flags.string({
      char: 'a',
      description: 'Override account origin for this project',
      required: false,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Override branch for this project',
      required: false,
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to credentials file (default: ~/.xano/credentials.yaml)',
      env: 'XANO_CONFIG',
      required: false,
    }),
    gitignore: Flags.boolean({
      allowNo: true,
      description: 'Add (or skip adding) profile.yaml to .gitignore without prompting',
      required: false,
    }),
    // eslint-disable-next-line camelcase
    instance_origin: Flags.string({
      char: 'i',
      description: 'Override instance origin for this project',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Override workspace for this project',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileUse)

    this.assertProfileExists(args.name, flags.config)

    const config: LocalProfileConfig = {profile: args.name}
    if (flags.workspace) config.workspace = flags.workspace
    // eslint-disable-next-line camelcase
    if (flags.instance_origin) config.instance_origin = flags.instance_origin
    // eslint-disable-next-line camelcase
    if (flags.account_origin) config.account_origin = flags.account_origin
    if (flags.branch) config.branch = flags.branch

    const filePath = resolve(process.cwd(), LOCAL_PROFILE_FILENAME)
    if (fs.existsSync(filePath)) {
      this.warn(`Overwriting existing ${LOCAL_PROFILE_FILENAME}`)
    }

    try {
      fs.writeFileSync(filePath, yaml.dump(config, {indent: 2, lineWidth: -1, noRefs: true}), 'utf8')
    } catch (error) {
      this.error(`Failed to write ${LOCAL_PROFILE_FILENAME}: ${error}`)
    }

    const workspaceNote = flags.workspace ? ` (workspace ${flags.workspace})` : ''
    this.log(`Wrote ${LOCAL_PROFILE_FILENAME} pinning profile '${args.name}'${workspaceNote}`)

    await this.handleGitignore(flags.gitignore)
  }

  private assertProfileExists(name: string, configPath?: string): void {
    const credentialsPath = resolveCredentialsPath(configPath)
    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}. Create a profile first using 'xano auth'.`,
      )
    }

    let parsed: CredentialsFile
    try {
      parsed = yaml.load(fs.readFileSync(credentialsPath, 'utf8')) as CredentialsFile
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }

    if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
      this.error('Credentials file has invalid format.')
    }

    if (!(name in parsed.profiles)) {
      this.error(
        `Profile '${name}' not found. Available profiles: ${Object.keys(parsed.profiles).join(', ')}`,
      )
    }
  }

  private async handleGitignore(flag: boolean | undefined): Promise<void> {
    let shouldAdd = flag
    if (shouldAdd === undefined) {
      const {add} = await inquirer.prompt([
        {
          default: false,
          message: `Add ${LOCAL_PROFILE_FILENAME} to .gitignore?`,
          name: 'add',
          type: 'confirm',
        },
      ])
      shouldAdd = add
    }

    if (!shouldAdd) {
      return
    }

    const gitignorePath = resolve(process.cwd(), '.gitignore')
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : null
    const {changed, content} = ensureGitignoreEntry(existing, LOCAL_PROFILE_FILENAME)
    if (changed) {
      fs.writeFileSync(gitignorePath, content, 'utf8')
      this.log(`Added ${LOCAL_PROFILE_FILENAME} to .gitignore`)
    } else {
      this.log(`${LOCAL_PROFILE_FILENAME} is already in .gitignore`)
    }
  }
}
