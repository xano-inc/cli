import {execSync} from 'node:child_process'

import BaseCommand from '../../base-command.js'

export default class Update extends BaseCommand {
  static override description = 'Update the Xano CLI to the latest version'

  static override examples = [
    `$ xano update`,
  ]

  async run(): Promise<void> {
    const currentVersion = this.config.version

    this.log(`Current version: ${currentVersion}`)
    this.log('Checking for updates...')

    try {
      const latest = execSync('npm view @xano/cli version', {encoding: 'utf8'}).trim()

      if (latest === currentVersion) {
        this.log(`Already up to date (${currentVersion})`)
        return
      }

      this.log(`Updating @xano/cli ${currentVersion} → ${latest}...`)
      execSync('npm install -g @xano/cli@latest', {stdio: 'inherit'})
      this.log(`Updated to ${latest}`)
    } catch (error) {
      this.error(`Failed to update: ${(error as Error).message}`)
    }
  }
}
