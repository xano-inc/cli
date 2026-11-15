import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import path from 'node:path'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'
import {normalizeListResponse} from '../../../utils/paging.js'
import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
  AUDIT_OPS,
  AUDIT_PLAN_REQUIRED_MESSAGE,
  type AuditEvent,
  auditEventsToCsv,
  type AuditTrailPage,
  buildAuditQuery,
  normalizeAuditPage,
} from '../../../utils/table-audit.js'

interface TableListItem {
  id: number
  name: string
}

interface ApiContext {
  profile: ProfileConfig
  verbose: boolean
  workspaceId: string
}

/** True when the raw argv names an output file, so the data is not what stdout carries. */
export function argvWritesFile(argv: string[]): boolean {
  return argv.some((arg) => arg === '-f' || arg === '--file' || arg.startsWith('--file=') || arg.startsWith('-f='))
}

export default class TableAudit extends BaseCommand {
  static override args = {
    table: Args.string({
      description: 'Table name or ID',
      required: true,
    }),
  }
  static override description =
    "Export a table's audit trail (read-only), newest first. Auditing itself is turned on and off in the table's XanoScript `audit` block and goes through push/pull."
  static override examples = [
    `$ xano table audit users
# The 50 newest events of the users table, as JSON`,
    `$ xano table audit users --all -o csv -f users_audit.csv
Saved 1234 events to /path/to/users_audit.csv`,
    `$ xano table audit 42 --record 17 --op update --all
# Every update of record 17 in table 42`,
    `$ xano table audit users --limit 100 --before 98765
# The page after the one whose next cursor was 98765`,
    `$ xano table audit users --datasource test --all -o csv
# The trail recorded on the 'test' data source`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    all: Flags.boolean({
      default: false,
      description: 'Follow the next cursor until every matching event is fetched',
      required: false,
    }),
    before: Flags.integer({
      description: 'Start after this cursor (the `next` value of a previous page)',
      min: 1,
      required: false,
    }),
    datasource: Flags.string({
      description: 'Data source whose trail to read, e.g. test (defaults to live)',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Write the export to this file instead of stdout',
      required: false,
    }),
    limit: Flags.integer({
      default: AUDIT_DEFAULT_LIMIT,
      description: `Events per request (page size), 1-${AUDIT_MAX_LIMIT}. Without --all this is the number of events returned`,
      max: AUDIT_MAX_LIMIT,
      min: 1,
      required: false,
    }),
    op: Flags.string({
      description: 'Only events of this operation',
      options: [...AUDIT_OPS],
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'json',
      description: 'Output format: json (the trail as the API returns it) or csv (one row per event)',
      options: ['json', 'csv'],
      required: false,
    }),
    record: Flags.string({
      description: 'Only the events of this record ID',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  /** stdout carries the export unless it goes to a file: keep banners and verbose logs off it. */
  protected override isJsonOutput(): boolean {
    return !argvWritesFile(this.argv)
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableAudit)
    const {profile, profileName} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano table audit <table> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    const api: ApiContext = {profile, verbose: flags.verbose, workspaceId}
    const tableId = await this.resolveTableId(api, args.table)
    const dataSource = flags.datasource?.trim()

    const items: AuditEvent[] = []
    let first: AuditTrailPage | undefined
    let {before} = flags
    let next: null | number = null

    /* eslint-disable no-await-in-loop -- each page's cursor comes from the page before */
    while (true) {
      const page = await this.fetchPage(api, tableId, {
        before,
        dataSource,
        limit: flags.limit,
        op: flags.op,
        record: flags.record,
      })
      first ??= page
      items.push(...page.items)
      next = page.next ?? null

      // a cursor that does not move would loop forever; stop rather than refetch the same page
      if (!flags.all || next === null || next === before) break
      before = next
    }
    /* eslint-enable no-await-in-loop */

    const trail: AuditTrailPage = {...first, items, next: flags.all ? null : next}
    this.explainState(trail, args.table)

    const content = flags.output === 'csv' ? auditEventsToCsv(items) : `${JSON.stringify(trail, null, 2)}\n`

    if (flags.file) {
      const filePath = path.resolve(flags.file)
      try {
        fs.writeFileSync(filePath, content, 'utf8')
      } catch (error) {
        this.error(`Failed to write ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      }

      this.log(`Saved ${items.length} event${items.length === 1 ? '' : 's'} to ${filePath}`)
    } else {
      this.log(content.replace(/\n$/, ''))
    }

    if (!flags.all && next !== null) {
      this.logToStderr(`More events: rerun with --before ${next}, or with --all for every event.`)
    }
  }

  /** Say on stderr when the table is not being audited, so an empty export is not a mystery. */
  private explainState(trail: AuditTrailPage, table: string): void {
    if (trail.enabled !== false) return
    const plan = trail.available === false ? ` ${AUDIT_PLAN_REQUIRED_MESSAGE}` : ''
    this.warn(
      `Auditing is off for table '${table}'; any events listed were recorded while it was on. ` +
        `Turn it on with the table's XanoScript audit block.${plan}`,
    )
  }

  private async fetchPage(
    api: ApiContext,
    tableId: number,
    query: {before?: number; dataSource?: string; limit: number; op?: string; record?: string},
  ): Promise<AuditTrailPage> {
    const params = buildAuditQuery(query)
    const url = `${api.profile.instance_origin}/api:meta/workspace/${api.workspaceId}/table/${tableId}/audit?${params.toString()}`

    const headers: Record<string, string> = {
      accept: 'application/json',
      Authorization: `Bearer ${api.profile.access_token}`,
    }
    // The route reads the trail recorded on the data source named by X-Data-Source (default live).
    if (query.dataSource) headers['X-Data-Source'] = query.dataSource

    const response = await this.verboseFetch(url, {headers, method: 'GET'}, api.verbose, api.profile.access_token)
    if (!response.ok) {
      this.error(await this.parseApiError(response, 'Failed to fetch the audit trail'))
    }

    return normalizeAuditPage(await response.json())
  }

  /**
   * A table ID as given, or the ID of the table with exactly this name (falling back to a single
   * case-insensitive match). An all-digit argument is always an ID.
   */
  private async resolveTableId(api: ApiContext, table: string): Promise<number> {
    const trimmed = table.trim()
    if (/^\d+$/.test(trimmed)) return Number(trimmed)

    const params = new URLSearchParams({page: '1', per_page: '10000', search: trimmed})
    const url = `${api.profile.instance_origin}/api:meta/workspace/${api.workspaceId}/table?${params.toString()}`
    const response = await this.verboseFetch(
      url,
      {headers: {accept: 'application/json', Authorization: `Bearer ${api.profile.access_token}`}, method: 'GET'},
      api.verbose,
      api.profile.access_token,
    )

    if (!response.ok) {
      this.error(await this.parseApiError(response, 'Failed to look up the table'))
    }

    const {items} = normalizeListResponse<TableListItem>(await response.json())
    const exact = items.filter((item) => item.name === trimmed)
    const matches = exact.length > 0 ? exact : items.filter((item) => item.name?.toLowerCase() === trimmed.toLowerCase())

    if (matches.length === 0) {
      this.error(`Table '${trimmed}' not found in workspace ${api.workspaceId}.`)
    }

    if (matches.length > 1) {
      const ids = matches.map((item) => item.id).join(', ')
      this.error(`More than one table matches '${trimmed}' (IDs ${ids}). Pass the table ID instead.`)
    }

    return matches[0].id
  }
}
