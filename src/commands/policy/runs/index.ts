import {Args, Flags, Interfaces} from '@oclif/core'

import type {PolicyFindingsPage, PolicyRunHead, PolicyRunSummary} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {quoted} from '../../../utils/policy/gate.js'
import {releasePolicyRunLines, type ReleaseRunHead, releaseRunLines} from '../../../utils/policy/release.js'
import {listItems, type PolicyQuery, type PolicyRequest} from '../../../utils/policy/request.js'
import {policyRunSummary, policyRunTable} from '../../../utils/policy/runs.js'

/** A branch retains this many runs, and the run list serves at most this many. */
const RUNS_RETAINED = 20
/** How many findings a run read prints unless `--limit` says otherwise, and the most a page holds. */
const FINDINGS_LIMIT = 100
const FINDINGS_MAX = 500
/** The findings route's list filters, each a repeatable flag of the same name. */
const LIST_FILTERS = ['policy', 'rule', 'severity', 'kind', 'object', 'tag'] as const
/** The flags that page or filter one run's findings, so a run list refuses them. */
const FINDING_FLAGS = ['offset', 'all', 'advisory', 'blocking', ...LIST_FILTERS, 'search'] as const
/** How many releases a lookup by name reads a request, and the most requests it makes. */
const RELEASES_PAGE = 100
const RELEASE_PAGES = 50

export default class PolicyRuns extends PolicyCommand {
  static override args = {
    run_id: Args.string({
      description: 'Run ID to read; omit to list the retained runs, newest first',
      required: false,
    }),
  }
  static override description =
    "List the stored policy check runs, or read one of them a page of findings at a time. --release reads a release's check instead: the run stored when the release was cut, evaluated on what it ships against the policies it ships"
  static override examples = [
    '$ xano policy runs',
    '$ xano policy runs --limit 5',
    '$ xano policy runs 1674 --run-detail',
    '$ xano policy runs 1674 --offset 100 --limit 100',
    '$ xano policy runs 1674 --all -o json',
    '$ xano policy runs 1674 --blocking --policy AUTH-001 --severity critical --severity high',
    '$ xano policy runs 1674 -o json',
    '$ xano policy runs --release v1.2',
    '$ xano policy runs --release v1.2 --blocking --all -o json',
    '$ xano policy runs --release v1.2 --recheck',
    '$ xano policy runs --release-id 12',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    advisory: Flags.boolean({
      default: false,
      description: 'With a run ID, only the advisory findings',
      exclusive: ['blocking'],
    }),
    all: Flags.boolean({
      default: false,
      description: 'With a run ID, read every page and print every finding that matches, instead of one page',
      exclusive: ['offset', 'limit'],
    }),
    blocking: Flags.boolean({
      default: false,
      description: "With a run ID, only the blocking findings (an active blocking policy's)",
      exclusive: ['advisory'],
    }),
    kind: Flags.string({
      description: 'With a run ID, only findings on this object kind (query, function, table, ...); repeatable',
      multiple: true,
    }),
    limit: Flags.integer({
      description: `How many runs to list, newest first (1-${RUNS_RETAINED}, default ${RUNS_RETAINED}: a branch retains at most ${RUNS_RETAINED}); with a run ID, how many findings to print (1-${FINDINGS_MAX}, default ${FINDINGS_LIMIT})`,
      min: 1,
    }),
    object: Flags.string({
      description: 'With a run ID, only findings on this object, written type:id as a finding names it (query:18); repeatable',
      multiple: true,
    }),
    offset: Flags.integer({
      description: "With a run ID, how many findings to skip, in the platform's order (blocking first)",
      min: 0,
    }),
    policy: Flags.string({
      description: 'With a run ID, only findings of this policy key; repeatable',
      multiple: true,
    }),
    recheck: Flags.boolean({
      default: false,
      description: "With --release, check the release again from its archive and store the new run, then read it (a read-only credential is refused)",
    }),
    release: Flags.string({
      description: "Read this release's policy check (by release name) instead of a branch's run; the finding flags page and filter it as they do a run's",
      exclusive: ['branch', 'release-id'],
    }),
    'release-id': Flags.integer({
      description: 'Read a release policy check by release ID, without looking up its name',
      exclusive: ['branch', 'release'],
      min: 1,
    }),
    rule: Flags.string({
      description: 'With a run ID, only findings of this rule ID (AUTH-001.R1); repeatable',
      multiple: true,
    }),
    'run-detail': Flags.boolean({
      default: false,
      description: 'With a run ID, also print the policy descriptions and rule settings that run recorded',
    }),
    search: Flags.string({
      description: 'With a run ID, only findings whose policy key or title, rule title, object name or message contains this text',
    }),
    severity: Flags.string({
      description: 'With a run ID, only findings of this severity (critical, high, medium, low); repeatable',
      multiple: true,
    }),
    tag: Flags.string({
      description: 'With a run ID, only findings whose policy or object carries this tag; repeatable',
      multiple: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyRuns)
    if (flags.release !== undefined || flags['release-id'] !== undefined) return this.readRelease(flags, args.run_id)
    if (flags.recheck) this.error('--recheck checks a release again: `xano policy runs --release <name> --recheck`.')
    const {request} = this.policyTarget(flags)
    const wanted = args.run_id?.trim() ?? ''
    if (wanted === '') return this.listRuns(request, flags)
    // Runs older than the one `policy status` reads are reachable here by id.
    if (!/^\d+$/.test(wanted)) this.error(`"${wanted}" is not a run ID. Run \`xano policy runs\` for the retained runs.`)
    const limit = findingsLimit(this, flags)
    // The run's summary and its findings a page at a time: neither reads the whole run, which can hold tens of thousands.
    const head = (await request(`/run/${wanted}/summary`)) as PolicyRunHead
    await this.reportRun({flags, head, limit, path: `/run/${wanted}/findings`, reading: `run ${wanted}`, request})
  }

  /**
   * `--all`: every finding that matches, read a page of 500 at a time in the platform's order, as
   * one page. A run of many pages says on stderr what it is reading.
   */
  private async everyFinding(request: PolicyRequest, path: string, reading: string, query: PolicyQuery): Promise<PolicyFindingsPage> {
    const items: PolicyFindingsPage['items'] = []
    let total = Number.POSITIVE_INFINITY
    while (items.length < total) {
      // eslint-disable-next-line no-await-in-loop -- one page at a time, each starting where the last ended
      const page = (await request(path, 'GET', undefined, {...query, limit: String(FINDINGS_MAX), offset: String(items.length)})) as PolicyFindingsPage
      if (items.length === 0 && page.total > FINDINGS_MAX)
        this.logToStderr(`Reading ${page.total} findings of ${reading}, ${FINDINGS_MAX} a request (${Math.ceil(page.total / FINDINGS_MAX)} requests)...`)
      total = page.total ?? 0
      if ((page.items ?? []).length === 0) break
      items.push(...page.items)
    }

    return {items, limit: items.length, offset: 0, total: Number.isFinite(total) ? total : items.length}
  }

  /** The retained runs, newest first; the flags that read one run's findings are refused. */
  private async listRuns(request: PolicyRequest, flags: RunsFlags): Promise<void> {
    if (flags['run-detail']) this.error('--run-detail reads one run: `xano policy runs <id> --run-detail`.')
    const paging = FINDING_FLAGS.find(name => flags[name] !== undefined && flags[name] !== false)
    if (paging) this.error(`--${paging} pages one run's findings: \`xano policy runs <id> --${paging} ...\`.`)
    const limit = flags.limit ?? RUNS_RETAINED
    if (limit > RUNS_RETAINED) this.error(`--limit lists at most ${RUNS_RETAINED} runs: a branch retains only its newest ${RUNS_RETAINED}.`)
    const result = await request('/run', 'GET', undefined, {limit: String(limit)})
    if (flags.output === 'json') {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const runs = listItems<PolicyRunSummary>(result)
    if (runs.length === 0) {
      this.log('No policy runs retained on this branch.')
      return
    }

    for (const line of policyRunTable(runs)) this.log(line)
    this.log('Only the most recent runs are retained per branch. Read one with `xano policy runs <id> --run-detail`.')
  }

  /**
   * `--release <name>`: the release's stored check (`GET release/{id}/policy_run`) and a page of its
   * findings, as a run is read. `--recheck` checks the release again from its archive first. A
   * release with no check says so; under `-o json` it is `{run: null}`.
   */
  private async readRelease(flags: RunsFlags, runId?: string): Promise<void> {
    if (runId?.trim()) this.error('Read one run by its ID, or a release\'s check with --release, not both.')
    const name = flags.release?.trim() ?? String(flags['release-id'] ?? '')
    if (!name) this.error('--release needs a release name.')
    const limit = findingsLimit(this, flags)
    const {request} = this.policyTarget(flags, {label: 'Release policy check', path: ''})
    const releaseId = flags['release-id'] ?? await this.releaseId(request, name)
    const route = `/release/${releaseId}/policy_run`
    const answer = (flags.recheck ? await request(route, 'POST', {}) : await request(route)) as {check?: unknown; run?: null | ReleaseRunHead}
    const check = flags.recheck ? {check: answer.check ?? null} : {}
    // The recheck's outcome in a line: recorded with its verdict, or why nothing was recorded.
    const rechecked = flags.recheck ? releasePolicyRunLines(answer.check, name).slice(0, 1).map(line => `Rechecked. ${line.trim()}`) : []
    const head = answer.run ?? null
    if (!head) {
      if (flags.output === 'json') {
        this.log(JSON.stringify({...check, run: null}, null, 2))
        return
      }

      for (const line of rechecked) this.log(line)
      this.log(`Release ${name} has no policy check.${flags.recheck ? '' : ' `--recheck` checks it now from its archive.'}`)
      return
    }

    await this.reportRun({
      check,
      flags,
      head,
      limit,
      next: flags['release-id'] ? `xano policy runs --release-id ${releaseId}` : `xano policy runs --release ${quoted(name)}`,
      path: `${route}/findings`,
      preface: [...rechecked, ...releaseRunLines(name, releaseId, head)],
      reading: `release ${name}`,
      request,
    })
  }

  /** The release's ID from its name, reading the workspace's releases a page at a time until it is found. */
  private async releaseId(request: PolicyRequest, name: string): Promise<number> {
    for (let page = 1; page <= RELEASE_PAGES; page++) {
      // eslint-disable-next-line no-await-in-loop -- pages in order, stopping at the release
      const data = await request('/release', 'GET', undefined, {page: String(page), per_page: String(RELEASES_PAGE)})
      const releases: Array<{id: number; name?: string}> = Array.isArray(data) ? data : listItems(data)
      const match = releases.find(release => release.name === name)
      if (match) return match.id
      if (releases.length < RELEASES_PAGE) break
    }

    return this.error(`Release '${name}' not found. \`xano release list\` lists the workspace's releases.`)
  }

  /**
   * One run's summary and a page of its findings (`path`), or under `-o json` the summary with
   * `findings` and `findings_page`, plus what `extra` adds to it.
   */
  private async reportRun(opts: {
    check?: Record<string, unknown>
    flags: RunsFlags
    head: PolicyRunHead
    limit: number
    next?: string
    path: string
    preface?: string[]
    reading: string
    request: PolicyRequest
  }): Promise<void> {
    const {flags, head, limit, path, request} = opts
    const query = findingsQuery(flags, limit)
    const page = flags.all
      ? await this.everyFinding(request, path, opts.reading, query)
      : (await request(path, 'GET', undefined, query)) as PolicyFindingsPage
    const items = page.items ?? []
    const offset = page.offset ?? 0
    const total = page.total ?? items.length
    if (flags.output === 'json') {
      const next = offset + items.length < total && items.length > 0 ? offset + items.length : null
      const findingsPage = {limit: page.limit ?? limit, next_offset: next, offset, total}
      this.log(JSON.stringify({...head, ...opts.check, findings: items, findings_page: findingsPage}, null, 2))
      return
    }

    for (const line of opts.preface ?? []) this.log(line)
    const filtered = Object.keys(query).some(name => !['limit', 'offset'].includes(name))
    for (const line of policyRunSummary({...head, findings: items}, {filtered, next: opts.next, offset, total})) this.log(line)
    if (flags['run-detail']) this.logRunDetail(head)
  }
}

type RunsFlags = Interfaces.InferredFlags<typeof PolicyRuns.flags>

/** How many findings a page prints: `--limit`, at most 500. */
function findingsLimit(command: {error(message: string): never}, flags: RunsFlags): number {
  const limit = flags.limit ?? FINDINGS_LIMIT
  if (limit > FINDINGS_MAX) command.error(`--limit prints at most ${FINDINGS_MAX} findings a page; page on with --offset.`)
  return limit
}

/** The findings route's query for one page: `blocking` true or false, and each list filter given. */
function findingsQuery(flags: RunsFlags, limit: number): PolicyQuery {
  const query: PolicyQuery = {limit: String(limit), offset: String(flags.offset ?? 0)}
  if (flags.blocking || flags.advisory) query.blocking = String(flags.blocking)
  for (const name of LIST_FILTERS) if (flags[name]?.length) query[name] = flags[name]
  if (flags.search?.trim()) query.q = flags.search
  return query
}
