import {Command, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {checkForUpdate} from './update-check.js'
import {
  applyLocalOverrides,
  findLocalProfilePath,
  formatLocalProfileBanner,
  type LocalProfileConfig,
  parseLocalProfile,
  resolveProfileSelection,
} from './utils/local-config.js'

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

/**
 * Resolve the credentials file path from flag, env var, or default.
 * Checks (in order): explicit configPath arg, XANO_CONFIG env var, ~/.xano/credentials.yaml
 */
export function resolveCredentialsPath(configPath?: string): string {
  const explicit = configPath || process.env.XANO_CONFIG
  if (explicit) {
    return path.resolve(explicit)
  }

  return path.join(os.homedir(), '.xano', 'credentials.yaml')
}

/**
 * Detect whether an explicit profile was requested via -p/--profile or the
 * XANO_PROFILE env var. Used at init() time, before flags are parsed, to decide
 * whether the project-local profile.yaml should be ignored (explicit wins).
 */
export function argvHasProfileFlag(argv: string[], env: NodeJS.ProcessEnv): boolean {
  // XANO_PROFILE is checked directly (not via oclif's flag env binding) because
  // this runs in init(), before flags are parsed and available on the command.
  if (env.XANO_PROFILE) {
    return true
  }

  // Scan the raw argv so we catch any token form the user might type
  // (`-p prod`, `--profile prod`, `--profile=prod`, `-p=prod`) regardless of
  // how oclif ultimately parses it.
  for (const arg of argv) {
    if (arg === '-p' || arg === '--profile' || arg.startsWith('--profile=') || arg.startsWith('-p=')) {
      return true
    }
  }

  return false
}

export default abstract class BaseCommand extends Command {
  static baseFlags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to credentials file (default: ~/.xano/credentials.yaml)',
      env: 'XANO_CONFIG',
      required: false,
    }),
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

  // Resolved project-local profile.yaml, set once in init() before run().
  // Null when none was found or when an explicit -p/XANO_PROFILE overrides it.
  protected localProfile: null | {config: LocalProfileConfig; path: string} = null
  protected updateNotice: string | null = null

  async init(): Promise<void> {
    await super.init()
    this.localProfile = this.loadLocalProfile()
    this.applyInsecureFromProfile()
    this.maybePrintLocalProfileBanner()

    const forceUpdateCheck = process.env.XANO_FORCE_UPDATE_CHECK === '1'
    this.updateNotice = checkForUpdate(this.config.version, forceUpdateCheck)
  }

  /**
   * Find and parse the nearest project-local profile.yaml, unless an explicit
   * -p/XANO_PROFILE was given (in which case the local file is ignored).
   */
  private loadLocalProfile(): null | {config: LocalProfileConfig; path: string} {
    if (argvHasProfileFlag(process.argv, process.env)) {
      return null
    }

    // Walks up to the filesystem root (git-style). parseLocalProfile returns
    // null for a profile.yaml with no recognized keys, so an unrelated file
    // belonging to another tool is ignored rather than hijacked.
    const filePath = findLocalProfilePath(process.cwd())
    if (!filePath) {
      return null
    }

    let config: LocalProfileConfig | null
    try {
      config = parseLocalProfile(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      this.error(`${filePath}: ${(error as Error).message}`)
    }

    if (!config) {
      this.warn(`Ignoring ${filePath}: no recognized profile keys found.`)
      return null
    }

    return {config, path: filePath}
  }

  /** Print the one-line target banner when a local profile.yaml is in effect. */
  private maybePrintLocalProfileBanner(): void {
    if (!this.localProfile || this.isJsonOutput()) {
      return
    }

    // Credential-management commands (the `profile` topic) operate on the
    // credentials store directly and intentionally ignore the project-local
    // pin, so the banner would be misleading for them.
    if (this.id?.startsWith('profile')) {
      return
    }

    const {config, path: filePath} = this.localProfile
    const profileName = config.profile ?? this.getDefaultProfile()
    const relativePath = path.relative(process.cwd(), filePath) || path.basename(filePath)
    this.log(formatLocalProfileBanner(profileName, config.workspace, relativePath))
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
      const profileName =
        (this as any).flags?.profile || this.localProfile?.config.profile || this.getDefaultProfile()
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
   * Get the resolved credentials file path, respecting --config flag and XANO_CONFIG env var.
   * Reads -c/--config from process.argv directly because oclif doesn't set this.flags
   * from parsed results — the static flags property is the flag definition, not parsed values.
   */
  protected getCredentialsPath(): string {
    const args = process.argv
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) return resolveCredentialsPath(args[i + 1])
      if (args[i]?.startsWith('--config=')) return resolveCredentialsPath(args[i].slice('--config='.length))
    }

    return resolveCredentialsPath()
  }

  protected loadCredentialsFile(): CredentialsFile | null {
    const credentialsPath = this.getCredentialsPath()

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
      const message = await this.parseApiError(response, 'Failed to get sandbox environment')
      this.error(message)
    }

    return (await response.json()) as SandboxTenant
  }

  /**
   * Resolve the profile from flags and any project-local profile.yaml,
   * validating instance_origin and access_token exist.
   * Precedence: -p/XANO_PROFILE > profile.yaml > credentials default.
   */
  protected resolveProfile(flags: {profile?: string}): {profile: ProfileConfig; profileName: string} {
    const credentials = this.loadCredentialsFile()
    const {applyLocal, profileName} = resolveProfileSelection({
      defaultProfile: this.getDefaultProfile(),
      explicitProfile: flags.profile,
      hasLocal: Boolean(this.localProfile),
      localProfileName: this.localProfile?.config.profile,
    })

    if (!credentials) {
      this.error(
        `Credentials file not found at ${this.getCredentialsPath()}.\n` +
          `Create a profile using 'xano profile create'`,
      )
    }

    if (!(profileName in credentials.profiles)) {
      const available = Object.keys(credentials.profiles).join(', ') || '(none)'
      this.error(`Profile '${profileName}' not found. Available profiles: ${available}`)
    }

    let profile = credentials.profiles[profileName]

    if (applyLocal && this.localProfile) {
      profile = applyLocalOverrides(profile, this.localProfile.config)
    }

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    return {profile, profileName}
  }

  /**
   * Parse an API error response and return a clean error message.
   * Extracts the message from JSON responses and adds context for common errors.
   */
  protected async parseApiError(response: Response, fallbackPrefix: string): Promise<string> {
    const errorText = await response.text()
    let message = `${fallbackPrefix} (${response.status})`

    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.message) {
        message = errorJson.message
      }
    } catch {
      if (errorText) {
        message += `\n${errorText}`
      }
    }

    // Provide guidance when sandbox access is denied (free plan restriction)
    if (response.status === 500 && message === 'Access Denied.') {
      message = 'Sandbox is not available on the Free plan. Upgrade your plan to use sandbox features.'
    }

    return message
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
