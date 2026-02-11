import {Help as BaseHelp, Command, Interfaces} from '@oclif/core'
import {CommandHelp as BaseCommandHelp} from '@oclif/core/help'

/**
 * Custom CommandHelp class that extends the default to display environment variables
 * alongside flag descriptions
 */
class CustomCommandHelp extends BaseCommandHelp {
  /**
   * Override flagHelpLabel to include environment variable information
   * when a flag has an associated env variable configured
   */
  protected flagHelpLabel(flag: Command.Flag.Any, showOptions = false): string {
    const label = super.flagHelpLabel(flag, showOptions)

    // Add environment variable information if present
    if (flag.env) {
      return `${label.trimEnd()}  [env: ${flag.env}]`
    }

    return label
  }
}

/**
 * Custom Help class that uses CustomCommandHelp
 */
export default class Help extends BaseHelp {
  protected CommandHelpClass = CustomCommandHelp
}
