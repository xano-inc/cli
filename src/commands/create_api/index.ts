import {Args, Command, Flags} from '@oclif/core'

export default class CreateApi extends Command {
  static args = {
    // api_key: Args.string({
    //   env: 'XANO_API_KEY',
    //   description: 'API key for the service',
    //   required: true,
    // }),
  }

  static override flags = {
    // flag with no value (-f, --force)
    access_token: Flags.string({
      char: 't',
      env: 'XANO_ACCESS_TOKEN',
      description: 'Access token for the Xano Metadata API',
      required: true,
    }),
    // flag with a value (-n, --name=VALUE)
    // name: Flags.string({char: 'n', description: 'name to print'}),
  }

  static description = 'Create API with the provided key'

  static examples = [
    `hello this is an example
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateApi)

    this.log(flags.api_key)
  }
}
