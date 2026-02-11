import {Command, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: unknown
  }
}

export default abstract class BaseCommand extends Command {
  static baseFlags = {
    profile: Flags.string({
      char: 'p',
      description: 'Profile to use for this command',
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

  // Helper method to get the default profile from credentials file
  protected getDefaultProfile(): string {
    try {
      const configDir = path.join(os.homedir(), '.xano')
      const credentialsPath = path.join(configDir, 'credentials.yaml')

      if (!fs.existsSync(credentialsPath)) {
        return 'default'
      }

      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (parsed && typeof parsed === 'object' && 'default' in parsed && parsed.default) {
        return parsed.default
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
}
