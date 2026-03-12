import {Flags} from '@oclif/core'
import {execSync} from 'node:child_process'

import BaseCommand from '../../base-command.js'
import {clearUpdateCache} from '../../update-check.js'

export default class Update extends BaseCommand {
  static override description = 'Update the Xano CLI to the latest version'

  static override examples = [`$ xano update`, `$ xano update --check`, `$ xano update --beta`]

  static override flags = {
    ...BaseCommand.flags,
    beta: Flags.boolean({
      description: 'Update to the latest beta version',
    }),
    check: Flags.boolean({
      description: 'Check for updates without installing',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Update)
    const currentVersion = this.config.version

    this.log(`Current version: ${currentVersion}`)
    this.log('Checking for updates...')

    const tag = flags.beta ? 'beta' : 'latest'

    try {
      const latest = execSync(`npm view @xano/cli dist-tags.${tag}`, {encoding: 'utf8'}).trim()

      if (latest === currentVersion) {
        this.log(`Already up to date (${currentVersion})`)
        return
      }

      if (flags.check) {
        this.log(`Update available: ${currentVersion} → ${latest}`)
        return
      }

      this.log(`Updating @xano/cli ${currentVersion} → ${latest}...`)
      execSync(`npm install -g @xano/cli@${tag} --no-fund`, {stdio: 'inherit'})
      clearUpdateCache()
      this.log(`Updated to ${latest}`)
    } catch (error) {
      this.error(`Failed to update: ${(error as Error).message}`)
    }
  }
}
