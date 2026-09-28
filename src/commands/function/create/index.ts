import {Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {BLANK_POLICY_OVERRIDE, blankPolicyOverride, gateRefusal, type GateRefused, publishRefusal, quoted} from '../../../utils/policy/gate.js'

interface CreateFunctionResponse {
  [key: string]: any
  id: number
  name: string
}

export default class FunctionCreate extends BaseCommand {
  static args = {}
static description = 'Create a new function in a workspace'
static examples = [
    `$ xano function:create -w 40 -f function.xs
Function created successfully!
ID: 123
Name: my_function
`,
    `$ xano function:create -f function.xs
Function created successfully!
ID: 123
Name: my_function
`,
    `$ xano function:create -w 40 -f function.xs --edit
# Opens function.xs in $EDITOR, then creates function with edited content
Function created successfully!
ID: 123
Name: my_function
`,
    `$ cat function.xs | xano function:create -w 40 --stdin
Function created successfully!
ID: 123
Name: my_function
`,
    `$ xano function:create -w 40 -f function.xs -o json
{
  "id": 123,
  "name": "my_function",
  ...
}
`,
    `$ xano function:create -f function.xs --policy-override "Exception approved; finding tracked in JIRA-12"`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    edit: Flags.boolean({
      char: 'e',
      default: false,
      dependsOn: ['file'],
      description: 'Open file in editor before creating function (requires --file)',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing XanoScript code',
      exclusive: ['stdin'],
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'policy-override': Flags.string({description: 'Create the function past a blocking live-branch publish policy gate with an audited reason (requires workspace:policy update)'}),
    stdin: Flags.boolean({
      char: 's',
      default: false,
      description: 'Read XanoScript code from stdin',
      exclusive: ['file'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }
/** Set once the publish policy gate refuses, the one failure that exits 2. */
  private refusedByPolicyGate = false

  /** Exit 2 is the publish gate's refusal; every other failure, flag errors included, exits 1. */
  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if (this.refusedByPolicyGate) return super.catch(error)
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(FunctionCreate)
    if (blankPolicyOverride(flags['policy-override'])) this.error(BLANK_POLICY_OVERRIDE)

    const {profile, profileName} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano function:create -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Read XanoScript content
    let xanoscript: string
    if (flags.file) {
      // Read from file
      let fileToRead = flags.file

      // If edit flag is set, copy to temp file and open in editor
      if (flags.edit) {
        fileToRead = await this.editFile(flags.file)
      }

      try {
        xanoscript = fs.readFileSync(fileToRead, 'utf8')

        // Clean up temp file if it was created
        if (flags.edit && fileToRead !== flags.file) {
          try {
            fs.unlinkSync(fileToRead)
          } catch {
            // Ignore cleanup errors
          }
        }
      } catch (error) {
        this.error(`Failed to read file '${fileToRead}': ${error}`)
      }
    } else if (flags.stdin) {
      // Read from stdin
      try {
        xanoscript = await this.readStdin()
      } catch (error) {
        this.error(`Failed to read from stdin: ${error}`)
      }
    } else {
      this.error('Either --file or --stdin must be specified to provide XanoScript code')
    }

    // Validate xanoscript is not empty
    if (!xanoscript || xanoscript.trim().length === 0) {
      this.error('XanoScript content is empty')
    }

    // Construct the API URL
    const queryParams = new URLSearchParams({
      include_xanoscript: 'false',
    })
    // A reason from someone with workspace:policy update saves past a blocking publish gate.
    const overrideReason = flags['policy-override']?.trim()
    if (overrideReason) queryParams.set('override_reason', overrideReason)
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function?${queryParams.toString()}`

    // Create function via API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: xanoscript,
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'text/x-xanoscript',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const refused = await gateRefusal(response)
        if (refused) this.refusePublish(refused, flags)
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const result = await response.json() as CreateFunctionResponse

      // Validate response
      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        // summary format
        this.log('Function created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
      }
    } catch (error) {
      if (this.refusedByPolicyGate) throw error
      if (error instanceof Error) {
        this.error(`Failed to create function: ${error.message}`)
      } else {
        this.error(`Failed to create function: ${String(error)}`)
      }
    }
  }

  private async editFile(filePath: string): Promise<string> {
    // Get the EDITOR environment variable
    const editor = process.env.EDITOR || process.env.VISUAL

    if (!editor) {
      this.error(
        'No editor configured. Please set the EDITOR or VISUAL environment variable.\n' +
        'Example: export EDITOR=vim',
      )
    }

    // Validate editor executable exists
    try {
      execSync(`which ${editor.split(' ')[0]}`, {stdio: 'ignore'})
    } catch {
      this.error(
        `Editor '${editor}' not found. Please set EDITOR to a valid editor.\n` +
        'Example: export EDITOR=vim',
      )
    }

    // Read the original file
    let originalContent: string
    try {
      originalContent = fs.readFileSync(filePath, 'utf8')
    } catch (error) {
      this.error(`Failed to read file '${filePath}': ${error}`)
    }

    // Create a temporary file with the same extension
    const ext = path.extname(filePath)
    const tmpFile = path.join(os.tmpdir(), `xano-edit-${Date.now()}${ext}`)

    // Copy content to temp file
    try {
      fs.writeFileSync(tmpFile, originalContent, 'utf8')
    } catch (error) {
      this.error(`Failed to create temporary file: ${error}`)
    }

    // Open the editor
    try {
      execSync(`${editor} ${tmpFile}`, {stdio: 'inherit'})
    } catch (error) {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // Ignore cleanup errors
      }

      this.error(`Editor exited with an error: ${error}`)
    }

    return tmpFile
  }

  private async readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      process.stdin.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      process.stdin.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'))
      })

      process.stdin.on('error', (error: Error) => {
        reject(error)
      })

      // Resume stdin if it was paused
      process.stdin.resume()
    })
  }

  /**
   * The live-branch publish gate refused the new function: the verdict on stdout (under `-o json`,
   * `{created: false, message, policy_gate}`), then the platform's message and how to proceed,
   * exiting 2.
   */
  private refusePublish(refused: GateRefused, flags: {file?: string; output: string; workspace?: string}): never {
    const workspace = flags.workspace ? ` -w ${quoted(flags.workspace)}` : ''
    const source = flags.file ? ` -f ${quoted(flags.file)}` : ' --stdin'
    const {lines, message} = publishRefusal(refused, {
      json: flags.output === 'json',
      outcome: 'created',
      rerun: `xano function create${workspace}${source} --policy-override "<why>"`,
    })
    for (const line of lines) this.log(line)
    this.refusedByPolicyGate = true
    this.error(message, {exit: 2})
  }
}
