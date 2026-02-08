/**
 * Base command for all run commands
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import BaseCommand from '../base-command.js'
import {DEFAULT_RUN_BASE_URL, RunHttpClient} from './run-http-client.js'

export interface ProfileConfig {
  account_origin?: string
  instance_origin: string
  access_token: string
  workspace?: string
  branch?: string
  project?: string
  run_project?: string
  run_base_url?: string
}

export interface CredentialsFile {
  profiles: {
    [key: string]: ProfileConfig
  }
  default?: string
}

export default abstract class BaseRunCommand extends BaseCommand {
  protected httpClient!: RunHttpClient
  protected profile!: ProfileConfig
  protected profileName!: string

  /**
   * Initialize the run command with profile and HTTP client
   */
  protected async initRunCommand(profileFlag?: string): Promise<void> {
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

    // Use run_project if available, fall back to project for backward compatibility
    const projectId = this.profile.run_project || this.profile.project

    this.httpClient = new RunHttpClient({
      baseUrl,
      authToken: this.profile.access_token,
      projectId,
    })
  }

  /**
   * Initialize with project required
   */
  protected async initRunCommandWithProject(profileFlag?: string): Promise<void> {
    await this.initRunCommand(profileFlag)

    if (!this.profile.run_project && !this.profile.project) {
      this.error(
        `Profile '${this.profileName}' is missing run_project. ` +
        `Run 'xano profile:wizard' to set up your profile or use 'xano profile:edit --run-project <project-id>'`,
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
