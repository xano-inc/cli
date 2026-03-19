import {Help as BaseHelp, Command} from '@oclif/core'
import {CommandHelp as BaseCommandHelp} from '@oclif/core/help'

/**
 * Extra commands to include in the top-level COMMANDS list.
 * These are nested commands promoted for discoverability.
 */
const PROMOTED_COMMANDS: Array<{description: string; label: string}> = [
  {description: 'Create a new workspace', label: 'workspace create'},
  {description: 'List workspaces', label: 'workspace list'},
  {description: 'Pull a workspace to local files', label: 'workspace pull'},
  {description: 'Push local documents to a workspace', label: 'workspace push'},
]

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
 * Custom Help class that injects promoted commands into the COMMANDS list
 */
export default class Help extends BaseHelp {
  protected CommandHelpClass = CustomCommandHelp

  formatCommands(commands: Command.Loadable[]): string {
    if (commands.length === 0 && PROMOTED_COMMANDS.length === 0) return ''

    const entries: Array<[string, string]> = commands
      .filter((c) => (this.opts.hideAliasesFromRoot ? !c.aliases?.includes(c.id) : true))
      .filter((c) => c.id !== 'plugins')
      .map((c) => {
        if (this.config.topicSeparator !== ':') c.id = c.id.replaceAll(':', this.config.topicSeparator)
        const summary = this.summary(c)
        return [c.id, summary ? summary.replace(/\u001B\[\d+m/g, '') : ''] as [string, string]
      })

    for (const promoted of PROMOTED_COMMANDS) {
      entries.push([promoted.label, promoted.description])
    }

    entries.sort((a, b) => a[0].localeCompare(b[0]))

    const body = this.renderList(entries, {
      indentation: 2,
      spacer: '\n',
      stripAnsi: this.opts.stripAnsi,
    })

    return this.section('COMMANDS', body + `\n\n\x1b[2mSee xano <topic> --help for all commands in a topic.\x1b[0m`)
  }
}
