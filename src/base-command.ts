import {Command, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

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

  async init(): Promise<void> {
    await super.init()
    this.applyInsecureFromProfile()
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
