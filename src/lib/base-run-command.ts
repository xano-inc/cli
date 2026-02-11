/**
 * Base command for all run commands
 */

import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../base-command.js'
import {DEFAULT_RUN_BASE_URL, RunHttpClient} from './run-http-client.js'

export interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  project?: string
  run_base_url?: string
  workspace?: string
}

export interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
}

export default abstract class BaseRunCommand extends BaseCommand {
  protected httpClient!: RunHttpClient
  protected profile!: ProfileConfig
  protected profileName!: string

  /**
   * Initialize the run command with profile and HTTP client
   */
  protected async initRunCommand(profileFlag?: string, verbose?: boolean): Promise<void> {
    this.profileName = profileFlag || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(this.profileName in credentials.profiles)) {
      this.error(
        `Profile '${this.profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    this.profile = credentials.profiles[this.profileName]

    if (!this.profile.access_token) {
      this.error(`Profile '${this.profileName}' is missing access_token`)
    }

    const baseUrl = this.profile.run_base_url || DEFAULT_RUN_BASE_URL

    this.httpClient = new RunHttpClient({
      authToken: this.profile.access_token,
      baseUrl,
      logger: (msg: string) => this.log(msg),
      projectId: this.profile.project,
      verbose,
    })
  }

  /**
   * Initialize with project required
   */
  protected async initRunCommandWithProject(profileFlag?: string, verbose?: boolean): Promise<void> {
    await this.initRunCommand(profileFlag, verbose)

    if (!this.profile.project) {
      this.error(
        `Profile '${this.profileName}' is missing project. ` +
        `Run 'xano profile:wizard' to set up your profile or use 'xano profile:edit --project <project-id>'`,
      )
    }
  }

  /**
   * Load credentials from file
   */
  protected loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile:create'`,
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

  /**
   * Format a response for JSON output
   */
  protected outputJson(data: unknown): void {
    this.log(JSON.stringify(data, null, 2))
  }
}
