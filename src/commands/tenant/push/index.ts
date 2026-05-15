import {Command} from '@oclif/core'

export default class Push extends Command {
  static override description =
    '[IMPORTANT] ALWAYS run --dry-run first and show the user the output before pushing to a tenant. Direct tenant push is not supported — deploy through a release or use the sandbox (xano sandbox push).'

  async run(): Promise<void> {
    this.error(
      'Direct tenant push is not supported.\n' +
        'To deploy changes, use one of the following:\n' +
        '  - Create a release through the standard deployment workflow\n' +
        '  - Use the sandbox: xano sandbox push <directory>',
    )
  }
}
