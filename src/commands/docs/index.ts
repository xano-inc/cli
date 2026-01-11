import {Args, Flags} from '@oclif/core'
import {Command} from '@oclif/core'

import {getDoc, listDocs, searchDocs} from '../../docs/index.js'

export default class Docs extends Command {
  static override args = {
    topic: Args.string({
      description: 'Documentation topic to display (e.g., addon, table, function)',
      required: false,
    }),
  }

  static override description = `View detailed documentation for CLI commands and XanoScript syntax.

Unlike --help which shows brief usage information, the docs command provides
comprehensive guides including:
- Conceptual explanations
- Full XanoScript syntax with examples
- Common errors and troubleshooting
- Best practices and tips

This is particularly useful for understanding complex topics like addon
creation, table schemas, or function definitions.`

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all available documentation topics',
    },
    {
      command: '<%= config.bin %> <%= command.id %> addon',
      description: 'View detailed addon documentation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> table',
      description: 'View table schema documentation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --search "db.query"',
      description: 'Search documentation for a term',
    },
    {
      command: '<%= config.bin %> <%= command.id %> getting-started',
      description: 'View the getting started guide',
    },
  ]

  static override flags = {
    list: Flags.boolean({
      char: 'l',
      default: false,
      description: 'List all available documentation topics',
    }),
    search: Flags.string({
      char: 's',
      description: 'Search documentation for a term',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Docs)

    // Search mode
    if (flags.search) {
      const results = searchDocs(flags.search)
      if (results.length === 0) {
        this.log(`No documentation found matching "${flags.search}"`)
        return
      }

      this.log(`Found ${results.length} topic(s) matching "${flags.search}":\n`)
      for (const doc of results) {
        this.log(`  ${doc.name.padEnd(20)} ${doc.description}`)
      }

      this.log(`\nRun 'xano docs <topic>' to view full documentation.`)
      return
    }

    // List mode or no topic specified
    if (flags.list || !args.topic) {
      this.printTopicList()
      return
    }

    // Show specific topic
    const doc = getDoc(args.topic)
    if (!doc) {
      this.log(`Documentation topic "${args.topic}" not found.\n`)
      this.printTopicList()
      return
    }

    this.printDoc(doc)
  }

  /**
   * Print the list of available documentation topics
   */
  private printTopicList(): void {
    const docs = listDocs()

    this.log('Available Documentation Topics\n')
    this.log('=' .repeat(50) + '\n')

    for (const doc of docs) {
      this.log(`  ${doc.name.padEnd(20)} ${doc.description}`)
    }

    this.log('\nUsage:')
    this.log('  xano docs <topic>        View documentation for a topic')
    this.log('  xano docs --search <q>   Search documentation')
    this.log('\nExamples:')
    this.log('  xano docs addon          Learn about addon creation')
    this.log('  xano docs table          Learn about table schemas')
    this.log('  xano docs getting-started   Quick start guide')
  }

  /**
   * Print documentation content with basic formatting
   */
  private printDoc(doc: {content: string; name: string; relatedTopics?: string[]; title: string}): void {
    // Print the content with some terminal formatting
    const content = doc.content
      // Add visual separators for headers
      .replaceAll(/^(#{1,2}\s.+)$/gm, '\n$1\n' + '─'.repeat(60))
      // Highlight code blocks
      .replaceAll(/```(\w+)?\n/g, '\n┌─ Code ─────────────────────────────────────────────────────\n')
      .replaceAll(/```\n?/g, '└────────────────────────────────────────────────────────────\n')

    this.log(content)

    // Show related topics
    if (doc.relatedTopics && doc.relatedTopics.length > 0) {
      this.log('\n' + '─'.repeat(60))
      this.log('Related Topics:')
      for (const topic of doc.relatedTopics) {
        this.log(`  xano docs ${topic}`)
      }
    }

    this.log('')
  }
}
