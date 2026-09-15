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

    // Check before IDs are mutated: root help has top-level commands (no colons)
    const isRootHelp = commands.some((c) => !c.id.includes(':'))

    const entries: Array<[string, string]> = commands
      .filter((c) => (this.opts.hideAliasesFromRoot ? !c.aliases?.includes(c.id) : true))
      .filter((c) => c.id !== 'plugins')
      .map((c) => {
        if (this.config.topicSeparator !== ':') c.id = c.id.replaceAll(':', this.config.topicSeparator)
        const summary = this.summary(c)
        // Strip ANSI colour codes from the summary so the help table aligns.
        // eslint-disable-next-line no-control-regex -- matching the escape char is the point
        return [c.id, summary ? summary.replaceAll(/\u001B\[\d+m/g, '') : ''] as [string, string]
      })

    // Only add promoted commands at the root level, not within a specific topic
    if (isRootHelp) {
      for (const promoted of PROMOTED_COMMANDS) {
        entries.push([promoted.label, promoted.description])
      }
    }

    entries.sort((a, b) => a[0].localeCompare(b[0]))

    const body = this.renderList(entries, {
      indentation: 2,
      spacer: '\n',
      stripAnsi: this.opts.stripAnsi,
    })

    return this.section('COMMANDS', body + `\n\n\u001B[2mSee xano <topic> --help for all commands in a topic.\u001B[0m`)
  }
}
