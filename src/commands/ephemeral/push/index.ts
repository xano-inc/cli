import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {findFilesWithGuid} from '../../../utils/document-parser.js'

import * as fs from 'node:fs'
import * as path from 'node:path'

export default class EphemeralPush extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Directory containing documents to push (as produced by ephemeral pull or workspace pull)',
      required: true,
    }),
  }
  static override description = 'Push local documents to an ephemeral tenant via multidoc import'
  static override examples = [
    `$ xano ephemeral push ./my-workspace -t my-tenant
Pushed 42 documents to ephemeral tenant my-tenant from ./my-workspace
`,
    `$ xano ephemeral push ./backup -t my-tenant --records --env`,
    `$ xano ephemeral push ./my-workspace -t my-tenant --truncate`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    env: Flags.boolean({
      default: false,
      description: 'Include environment variables in import',
      required: false,
    }),
    records: Flags.boolean({
      default: false,
      description: 'Include records in import',
      required: false,
    }),
    tenant: Flags.string({
      char: 't',
      description: 'Ephemeral tenant name to push to',
      required: true,
    }),
    transaction: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Wrap import in a database transaction (use --no-transaction for debugging purposes)',
      required: false,
    }),
    truncate: Flags.boolean({
      default: false,
      description: 'Truncate all table records before importing',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralPush)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const tenantName = flags.tenant

    const inputDir = path.resolve(args.directory)

    if (!fs.existsSync(inputDir)) {
      this.error(`Directory not found: ${inputDir}`)
    }

    if (!fs.statSync(inputDir).isDirectory()) {
      this.error(`Not a directory: ${inputDir}`)
    }

    const files = this.collectFiles(inputDir)

    if (files.length === 0) {
      this.error(`No .xs files found in ${args.directory}`)
    }

    const documentEntries: Array<{content: string; filePath: string}> = []
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8').trim()
      if (content) {
        documentEntries.push({content, filePath})
      }
    }

    if (documentEntries.length === 0) {
      this.error(`All .xs files in ${args.directory} are empty`)
    }

    const multidoc = documentEntries.map((d) => d.content).join('\n---\n')

    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      records: flags.records.toString(),
      transaction: flags.transaction.toString(),
      truncate: flags.truncate.toString(),
    })
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}/multidoc?${queryParams.toString()}`

    const startTime = Date.now()

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: multidoc,
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'text/x-xanoscript',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Push failed (${response.status})`

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage += `: ${errorJson.message}`
          if (errorJson.payload?.param) {
            errorMessage += `\n  Parameter: ${errorJson.payload.param}`
          }
        } catch {
          errorMessage += `\n${errorText}`
        }

        const guidMatch = errorMessage.match(/Duplicate \w+ guid: (\S+)/)
        if (guidMatch) {
          const dupeFiles = findFilesWithGuid(documentEntries, guidMatch[1])
          if (dupeFiles.length > 0) {
            const relPaths = dupeFiles.map((f) => path.relative(inputDir, f))
            errorMessage += `\n  Local files with this GUID:\n${relPaths.map((f) => `    ${f}`).join('\n')}`
          }
        }

        this.error(errorMessage)
      }

      const responseText = await response.text()
      if (responseText && responseText !== 'null' && flags.verbose) {
        this.log(responseText)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to push multidoc: ${error.message}`)
      } else {
        this.error(`Failed to push multidoc: ${String(error)}`)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    this.log(`Pushed ${documentEntries.length} documents to ephemeral tenant ${tenantName} from ${args.directory} in ${elapsed}s`)
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir, {withFileTypes: true})

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.collectFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.xs')) {
        files.push(fullPath)
      }
    }

    return files.sort()
  }
}
