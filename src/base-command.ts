import {Command, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {checkForUpdate} from './update-check.js'

export interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  insecure?: boolean
  instance_origin: string
  workspace?: string
}

export interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
}

export function buildUserAgent(version: string): string {
  return `xano-cli/${version} (${process.platform}; ${process.arch}) node/${process.version}`
}

export interface SandboxTenant {
  created_at?: string
  description?: string
  display?: string
  ephemeral?: boolean
  id: number
  name: string
  sandbox_expires_at?: string | number
  state?: string
  xano_domain?: string
}

export default abstract class BaseCommand extends Command {
  static baseFlags = {
    profile: Flags.string({
      char: 'p',
      description: 'Profile to use (uses default profile if not specified)',
      env: 'XANO_PROFILE',
      required: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Show detailed request/response information',
      env: 'XANO_VERBOSE',
      required: false,
    }),
  }
  // Override the flags property to include baseFlags
  static flags = BaseCommand.baseFlags

  protected updateNotice: string | null = null

  async init(): Promise<void> {
    await super.init()
    this.applyInsecureFromProfile()

    const forceUpdateCheck = process.env.XANO_FORCE_UPDATE_CHECK === '1'
    this.updateNotice = checkForUpdate(this.config.version, forceUpdateCheck)
  }

  async finally(_: Error | undefined): Promise<void> {
    if (this.updateNotice && !this.isJsonOutput()) {
      this.log(this.updateNotice)
    }

    await super.finally(_)
  }

  private isJsonOutput(): boolean {
    const args = process.argv
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--output' && args[i + 1] === 'json') return true
      if (args[i] === '-o' && args[i + 1] === 'json') return true
      if (args[i] === '--output=json' || args[i] === '-o=json') return true
    }

    return false
  }

  /**
   * Apply insecure TLS mode if the active profile has insecure: true.
   * Sets NODE_TLS_REJECT_UNAUTHORIZED=0 so all fetch() calls skip cert verification.
   */
  protected applyInsecureFromProfile(): void {
    try {
      const profileName = (this as any).flags?.profile || this.getDefaultProfile()
      const credentials = this.loadCredentialsFile()
      if (!credentials) return

      const profile = credentials.profiles[profileName]
      if (profile?.insecure) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        this.warn('TLS certificate verification is disabled for this profile (insecure mode)')
      }
    } catch {
      // Don't fail the command if we can't read the profile for insecure check
    }
  }

  // Helper method to get the default profile from credentials file
  protected getDefaultProfile(): string {
    try {
      const credentials = this.loadCredentialsFile()
      if (credentials?.default) {
        return credentials.default
      }

      return 'default'
    } catch {
      return 'default'
    }
  }

  // Helper method to get the profile flag value
  protected getProfile(): string | undefined {
    return (this as any).flags?.profile
  }

  /**
   * Load and parse the credentials file. Returns null if the file doesn't exist.
   */
  protected loadCredentialsFile(): CredentialsFile | null {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      return null
    }

    const fileContent = fs.readFileSync(credentialsPath, 'utf8')
    const parsed = yaml.load(fileContent) as CredentialsFile

    if (parsed && typeof parsed === 'object' && 'profiles' in parsed) {
      return parsed
    }

    return null
  }

  /**
   * Get or create the singleton sandbox environment for the authenticated user.
   * Returns the sandbox object (existing or newly created).
   */
  protected async getOrCreateSandbox(profile: ProfileConfig, verbose: boolean): Promise<SandboxTenant> {
    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/me`

    const response = await this.verboseFetch(
      apiUrl,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const errorText = await response.text()
      this.error(`Failed to get sandbox environment: ${response.status} ${response.statusText}\n${errorText}`)
    }

    return (await response.json()) as SandboxTenant
  }

  /**
   * Resolve profile from flags, validating instance_origin and access_token exist.
   */
  protected resolveProfile(flags: {profile?: string}): {profile: ProfileConfig; profileName: string} {
    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    return {profile, profileName}
  }

  /**
   * Make an HTTP request with optional verbose logging.
   * Use this for all Metadata API calls to support the --verbose flag.
   */
  protected async verboseFetch(
    url: string,
    options: RequestInit,
    verbose: boolean,
    authToken?: string,
  ): Promise<Response> {
    const method = options.method || 'GET'
    const headers: Record<string, string> = {
      'User-Agent': buildUserAgent(this.config.version),
      ...(options.headers as Record<string, string>),
    }
    const fetchOptions = {...options, headers}
    const contentType = headers['Content-Type'] || 'application/json'

    if (verbose) {
      this.log('')
      this.log('─'.repeat(60))
      this.log(`→ ${method} ${url}`)
      this.log(`  Content-Type: ${contentType}`)
      if (authToken) {
        this.log(`  Authorization: Bearer ${authToken.slice(0, 8)}...${authToken.slice(-4)}`)
      }

      if (options.body) {
        const bodyStr = typeof options.body === 'string' ? options.body : String(options.body)
        const bodyPreview = bodyStr.length > 500 ? bodyStr.slice(0, 500) + '...' : bodyStr
        this.log(`  Body: ${bodyPreview}`)
      }
    }

    const startTime = Date.now()
    const response = await fetch(url, fetchOptions)
    const elapsed = Date.now() - startTime

    if (verbose) {
      this.log(`← ${response.status} ${response.statusText} (${elapsed}ms)`)
      this.log('─'.repeat(60))
      this.log('')
    }

    return response
  }
}
