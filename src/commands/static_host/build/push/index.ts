import {Args, Flags, ux} from '@oclif/core'
import archiver from 'archiver'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'
import {generateBuildName} from '../create/index.js'

interface BuildCreateResponse {
  [key: string]: any
  id: number
  name: string
  status?: string
}

export default class StaticHostBuildPush extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
  static description = 'Push a directory or zip file as a new static host build'
  static examples = [
    `$ xano static_host build push default -d ./dist -n "v1.0.0"
Pushed 15 files as build "v1.0.0"
ID: 123
`,
    `$ xano static_host build push default
Pushed 8 files as build "20260531-143022"
`,
    `$ xano static_host build push default -f ./build.zip -n "v1.0.0"
Pushed build.zip as build "v1.0.0"
ID: 124
`,
    `$ xano static_host build push myhost -n "production" --description "Production build" -w 40
Pushed 22 files as build "production"
ID: 125
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      description: 'Build description',
      required: false,
    }),
    directory: Flags.string({
      char: 'd',
      description: 'Directory to push (defaults to current directory)',
      exclusive: ['file'],
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to a zip file to upload (alternative to -d)',
      exclusive: ['directory'],
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Build name (auto-generated from the current timestamp if omitted)',
      required: false,
    }),
    'no-wait': Flags.boolean({
      default: false,
      description: 'Return immediately after upload instead of waiting for the build to finish',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostBuildPush)

    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano static_host build push <static_host> -n <name> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const animate = Boolean(process.stdout.isTTY) && flags.output !== 'json' && !flags.verbose
    const buildName = flags.name ?? generateBuildName()

    let zipBuffer: Buffer
    let fileCount = 0
    let fileName: string | undefined

    if (flags.file) {
      const filePath = path.resolve(flags.file)
      if (!fs.existsSync(filePath)) {
        this.error(`File not found: ${filePath}`)
      }

      const fileStats = fs.statSync(filePath)
      if (!fileStats.isFile()) {
        this.error(`Path is not a file: ${filePath}`)
      }

      fileName = path.basename(filePath)
      if (animate) ux.action.start('Uploading', fileName)
      zipBuffer = fs.readFileSync(filePath) as unknown as Buffer
    } else {
      const sourceDir = path.resolve(flags.directory ?? '.')
      if (!fs.existsSync(sourceDir)) {
        this.error(`Directory not found: ${sourceDir}`)
      }

      const dirStats = fs.statSync(sourceDir)
      if (!dirStats.isDirectory()) {
        this.error(`Path is not a directory: ${sourceDir}`)
      }

      fileCount = this.countFiles(sourceDir)
      if (animate) ux.action.start('Packaging', `${fileCount} files`)
      zipBuffer = await this.createZipBuffer(sourceDir)
      if (animate) {
        ux.action.stop(`${fileCount} files (${(zipBuffer.length / (1024 * 1024)).toFixed(1)} MB)`)
        ux.action.start('Uploading')
      }
    }

    const sizeMB = (zipBuffer.length / (1024 * 1024)).toFixed(1)

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build`

    const formData = new (globalThis as any).FormData()
    const blob = new Blob([new Uint8Array(zipBuffer)], {type: 'application/zip'})
    formData.append('file', blob, fileName ?? 'build.zip')
    formData.append('name', buildName)

    if (flags.description) {
      formData.append('description', flags.description)
    }

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: formData,
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (animate) {
        ux.action.stop('done')
      }

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const result = await response.json() as BuildCreateResponse

      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(fileName
          ? `Pushed ${fileName} as build "${buildName}" (${sizeMB} MB)`
          : `Pushed ${fileCount} files as build "${buildName}" (${sizeMB} MB)`,
        )
        this.log(`ID: ${result.id}`)

        if (result.status) {
          this.log(`Status: ${result.status}`)
        }
      }

      // Async (package.json) builds keep running after upload. Unless --no-wait,
      // poll until the build finishes so the CLI mirrors the UI's progress.
      const inProgress = result.status !== undefined && !['error', 'ok'].includes(result.status)
      if (inProgress && !flags['no-wait']) {
        const finalStatus = await this.waitForBuild({
          buildId: result.id,
          profile,
          quiet: flags.output === 'json',
          staticHost: args.static_host,
          verbose: flags.verbose,
          workspaceId,
        })
        if (finalStatus === 'error') {
          this.error(`Build ${result.id} failed (status: error). Check the build log with: xano static_host build get ${args.static_host} --build_id ${result.id}`)
        }
      }

      if (flags.output !== 'json') {
        await this.logStaticHostUrls({profile, staticHost: args.static_host, verbose: flags.verbose, workspaceId})
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to push build: ${error.message}`)
      } else {
        this.error(`Failed to push build: ${String(error)}`)
      }
    }
  }

  private countFiles(dir: string): number {
    let count = 0
    const entries = fs.readdirSync(dir, {withFileTypes: true})
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += this.countFiles(path.join(dir, entry.name))
      } else if (entry.isFile()) {
        count++
      }
    }

    return count
  }

  private async createZipBuffer(sourceDir: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const archive = archiver('zip', {zlib: {level: 9}})

      archive.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      archive.on('end', () => {
        resolve(Buffer.concat(chunks))
      })

      archive.on('error', (err: Error) => {
        reject(err)
      })

      archive.directory(sourceDir, false)
      archive.finalize()
    })
  }

}
