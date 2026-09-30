import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import BaseCommand from '../../../base-command.js'
import {type DebugResultPayload, isUuid, renderDebugGetSummary} from '../../../utils/debug-run.js'

export default class DebugGet extends BaseCommand {
  static override args = {
    // eslint-disable-next-line camelcase -- CLI arg names use underscores (repo convention)
    debug_id: Args.string({
      description: 'Debug id returned by `xano debug run` (uuid)',
      required: true,
    }),
  }
  static override description =
    'Fetch the full stored debugger payload (per-statement stack + value store) for a previous `xano debug run` by its debug id. ' +
    'Stored results expire after about 7 days.'
  static override examples = [
    `$ xano debug get 018f3a6e-1111-4222-8333-444455556666`,
    `$ xano debug get 018f3a6e-1111-4222-8333-444455556666 --out stack.json
# Summary on screen, full multi-MB payload written to stack.json`,
    `$ xano debug get 018f3a6e-1111-4222-8333-444455556666 -o json | jq '.stack | length'`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    out: Flags.string({
      description:
        'Write the full payload JSON to a file (combines with either output mode — summary on screen plus --out is the natural choice for multi-MB stacks)',
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
    const {args, flags} = await this.parse(DebugGet)
    const {profile, profileName} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano debug get <debug_id> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
        {exit: 2},
      )
    }

    const debugId = args.debug_id
    if (!isUuid(debugId)) {
      this.error(`debug_id must be a uuid (8-4-4-4-12 hex), got '${debugId}'`, {exit: 2})
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc/debug/${debugId}`

    const response = await this.verboseFetch(
      apiUrl,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      flags.verbose,
      profile.access_token,
    ).catch((error: unknown) =>
      this.error(`Failed to fetch debug result: ${error instanceof Error ? error.message : String(error)}`, {
        exit: 2,
      }),
    )

    if (response.status === 404) {
      // The server intentionally makes expired, foreign-workspace, and
      // never-existed ids indistinguishable — present them all the same way.
      this.error(
        `No stored debug result found for ${debugId}.\n` +
          `Stored results expire after about 7 days, and ids from other workspaces (or that never existed) look identical.\n` +
          `Re-run the debug to produce a fresh result: xano debug run --type <type> --name <name>`,
        {exit: 2},
      )
    }

    if (!response.ok) {
      const message = await this.parseApiError(response, 'Failed to fetch debug result')
      this.error(message, {exit: 2})
    }

    const rawText = await response.text()
    let payload: DebugResultPayload
    try {
      payload = JSON.parse(rawText) as DebugResultPayload
    } catch {
      this.error(`Server returned a non-JSON debug payload (${rawText.length} bytes)`, {exit: 2})
    }

    // `JSON.parse('null')` succeeds — reject empty/non-object payloads so the
    // summary renderers never dereference null (which would be an uncaught
    // TypeError → exit 1, colliding with the documented exception exit code).
    if (!payload || typeof payload !== 'object') {
      this.error('Server returned an empty or invalid debug payload', {exit: 2})
    }

    if (flags.out) {
      const outPath = resolve(flags.out)
      try {
        // 0600: the payload can contain sensitive resolved values from the run.
        // writeFileSync only applies `mode` when creating the file, so chmod
        // afterwards to enforce the claimed permission when overwriting too.
        fs.writeFileSync(outPath, rawText, {encoding: 'utf8', mode: 0o600})
        fs.chmodSync(outPath, 0o600)
      } catch (error) {
        this.error(
          `Failed to write ${outPath}: ${error instanceof Error ? error.message : String(error)}`,
          {exit: 2},
        )
      }

      const note = `Wrote full debug payload to ${outPath} (mode 0600 — it may contain sensitive resolved values).`
      if (flags.output === 'json') {
        // Keep stdout pipeable (`-o json | jq ...`): the note goes to stderr.
        this.warn(note)
      } else {
        this.log(note)
      }
    }

    if (flags.output === 'json') {
      this.log(JSON.stringify(payload, null, 2))
    } else {
      for (const line of renderDebugGetSummary(payload)) {
        this.log(line)
      }
    }
  }
}
