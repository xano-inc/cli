import {Args, Flags, Interfaces} from '@oclif/core'

import type {PolicyFindingsPage, PolicyRunHead, PolicyRunListPage} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {quoted} from '../../../utils/policy/gate.js'
import {releasePolicyRunLines, type ReleaseRunHead, releaseRunLines} from '../../../utils/policy/release.js'
import {listItems, type PolicyQuery, type PolicyRequest} from '../../../utils/policy/request.js'
import {policyRunListFooter, policyRunSummary, policyRunTable} from '../../../utils/policy/runs.js'

/** How many runs a page of the run list holds unless `--per-page` says otherwise, and the most it may. */
const RUNS_PER_PAGE = 25
const RUNS_PER_PAGE_MAX = 100
/** The run list's filters and order, as the platform takes them. */
const RUN_TRIGGERS = ['manual', 'push', 'merge', 'set_live', 'install', 'release', 'deploy', 'publish'] as const
const RUN_OUTCOMES = ['allowed', 'blocked', 'allowed_with_override', 'none'] as const
const RUN_SORTS = ['date', 'check', 'source', 'trigger', 'run_by', 'scope', 'result', 'outcome'] as const
/** The flags that page, filter or order the run list, so reading one run refuses them. */
const LIST_FLAGS = ['page', 'per-page', 'trigger', 'outcome', 'scope', 'sort', 'order', 'latest-only'] as const
/** How many findings a run read prints unless `--limit` says otherwise, and the most a page holds. */
const FINDINGS_LIMIT = 100
const FINDINGS_MAX = 500
/** The findings route's list filters, each a repeatable flag of the same name. */
const LIST_FILTERS = ['policy', 'rule', 'severity', 'kind', 'object', 'tag'] as const
/** The flags that page or filter one run's findings, so a run list refuses them. */
const FINDING_FLAGS = ['offset', 'all', 'warn', 'block', ...LIST_FILTERS] as const
/** How many releases a lookup by name reads a request, and the most requests it makes. */
const RELEASES_PAGE = 100
const RELEASE_PAGES = 50

export default class PolicyRuns extends PolicyCommand {
  static override args = {
    run_id: Args.string({
      description: 'Run ID to read; omit to list the stored runs, newest first, a page at a time',
      required: false,
    }),
  }
  static override description =
    "List the stored policy check runs a page at a time (gated checks with their outcome: allowed, blocked or allowed with override), or read one of them a page of findings at a time. --release reads a release's check instead: the run stored when the release was cut, evaluated on what it ships against the policies it ships"
  static override examples = [
    '$ xano policy runs',
    '$ xano policy runs --page 2 --per-page 50',
    '$ xano policy runs --trigger merge --trigger set_live --outcome blocked',
    '$ xano policy runs --scope partial --sort outcome --search visits',
    '$ xano policy runs --latest-only --per-page 1 -o json',
    '$ xano policy runs 1674 --run-detail',
    '$ xano policy runs 1674 --offset 100 --limit 100',
    '$ xano policy runs 1674 --all -o json',
    '$ xano policy runs 1674 --block --policy AUTH-001 --severity critical --severity high',
    '$ xano policy runs 1674 -o json',
    '$ xano policy runs --release v1.2',
    '$ xano policy runs --release v1.2 --block --all -o json',
    '$ xano policy runs --release v1.2 --recheck',
    '$ xano policy runs --release-id 12',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    all: Flags.boolean({
      default: false,
      description: 'With a run ID, read every page and print every finding that matches, instead of one page',
      exclusive: ['offset', 'limit'],
    }),
    block: Flags.boolean({
      default: false,
      description: 'With a run ID, only the findings of Block policies',
      exclusive: ['warn'],
    }),
    kind: Flags.string({
      description: 'With a run ID, only findings on this object kind (query, function, table, ...); repeatable',
      multiple: true,
    }),
    'latest-only': Flags.boolean({
      default: false,
      description: "Only the runs that can describe the branch: no publish runs and no blocked gated checks (what `policy status` reads)",
    }),
    limit: Flags.integer({
      description: `With a run ID, how many findings to print (1-${FINDINGS_MAX}, default ${FINDINGS_LIMIT}); without one, the same as --per-page`,
      exclusive: ['per-page'],
      min: 1,
    }),
    object: Flags.string({
      description: 'With a run ID, only findings on this object, written type:id as a finding names it (query:18); repeatable',
      multiple: true,
    }),
    offset: Flags.integer({
      description: "With a run ID, how many findings to skip, in the platform's order (Block first)",
      min: 0,
    }),
    order: Flags.string({
      description: 'The run list\'s order for --sort (default desc: newest, or last, first)',
      options: ['asc', 'desc'],
    }),
    outcome: Flags.string({
      description: 'Only runs with this outcome; none is a check that gated nothing; repeatable',
      multiple: true,
      options: [...RUN_OUTCOMES],
    }),
    page: Flags.integer({
      description: 'Which page of the run list to print (default 1)',
      min: 1,
    }),
    'per-page': Flags.integer({
      description: `How many runs a page of the list holds (1-${RUNS_PER_PAGE_MAX}, default ${RUNS_PER_PAGE})`,
      exclusive: ['limit'],
      max: RUNS_PER_PAGE_MAX,
      min: 1,
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
    scope: Flags.string({
      description: 'Only runs over the whole branch (workspace) or over the objects a publish carried (partial)',
      options: ['workspace', 'partial'],
    }),
    search: Flags.string({
      description: 'With a run ID, only findings whose policy key or title, rule title, object name, reason or message contains this text; without one, only runs whose trigger, branch, who ran it, tenant, release or objects contain it',
    }),
    severity: Flags.string({
      description: 'With a run ID, only findings of this severity (critical, high, medium, low); repeatable',
      multiple: true,
    }),
    sort: Flags.string({
      description: 'The run list\'s order: date (default), check, source, trigger, run_by, scope, result (failing policies) or outcome',
      options: [...RUN_SORTS],
    }),
    tag: Flags.string({
      description: 'With a run ID, only findings whose policy or object carries this tag; repeatable',
      multiple: true,
    }),
    trigger: Flags.string({
      description: 'Only runs started this way; repeatable',
      multiple: true,
      options: [...RUN_TRIGGERS],
    }),
    warn: Flags.boolean({
      default: false,
      description: 'With a run ID, only the findings of Warn policies',
      exclusive: ['block'],
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
    if (!/^\d+$/.test(wanted)) this.error(`"${wanted}" is not a run ID. Run \`xano policy runs\` for the stored runs.`)
    this.refuseListFlags(flags, `run ${wanted}`)
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

  /**
   * One page of the stored runs, newest first unless `--sort`/`--order` say otherwise, filtered as the
   * flags say; the flags that read one run's findings are refused.
   */
  private async listRuns(request: PolicyRequest, flags: RunsFlags): Promise<void> {
    if (flags['run-detail']) this.error('--run-detail reads one run: `xano policy runs <id> --run-detail`.')
    const paging = FINDING_FLAGS.find(name => flags[name] !== undefined && flags[name] !== false)
    if (paging) this.error(`--${paging} pages one run's findings: \`xano policy runs <id> --${paging} ...\`.`)
    const perPage = flags['per-page'] ?? flags.limit ?? RUNS_PER_PAGE
    if (perPage > RUNS_PER_PAGE_MAX) {
      // Name the flag the user passed: --per-page wins over its alias --limit.
      const flag = flags['per-page'] === undefined ? '--limit' : '--per-page'
      this.error(`${flag} lists at most ${RUNS_PER_PAGE_MAX} runs a page; page on with --page.`)
    }
    const query = runListQuery(flags, perPage)
    const result = await request('/run', 'GET', undefined, query)
    if (flags.output === 'json') {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const page = result as PolicyRunListPage
    const runs = listItems<PolicyRunListPage['items'][number]>(result)
    const filtered = Object.keys(query).some(name => !['order', 'page', 'per_page', 'sort'].includes(name))
    if (runs.length === 0) {
      this.log(filtered ? 'No policy runs match.' : (flags.page ?? 1) > 1 ? `No policy runs on page ${flags.page}.` : 'No policy runs stored on this branch.')
      return
    }

    for (const line of policyRunTable(runs)) this.log(line)
    for (const line of policyRunListFooter(page, {filtered, next: runListNext(flags)})) this.log(line)
  }

  /**
   * `--release <name>`: the release's stored check (`GET release/{id}/policy_run`) and a page of its
   * findings, as a run is read. `--recheck` checks the release again from its archive first. A
   * release with no check says so; under `-o json` it is `{run: null}`.
   */
  private async readRelease(flags: RunsFlags, runId?: string): Promise<void> {
    if (runId?.trim()) this.error('Read one run by its ID, or a release\'s check with --release, not both.')
    this.refuseListFlags(flags, 'a release\'s check')
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

  /** Reading one run refuses the run list's flags. */
  private refuseListFlags(flags: RunsFlags, reading: string): void {
    const listing = LIST_FLAGS.find(name => flags[name] !== undefined && flags[name] !== false)
    if (listing) this.error(`--${listing} pages or filters the run list, not ${reading}: \`xano policy runs --${listing} ...\`.`)
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

/** The findings route's query for one page: `block` true or false, and each list filter given. */
function findingsQuery(flags: RunsFlags, limit: number): PolicyQuery {
  const query: PolicyQuery = {limit: String(limit), offset: String(flags.offset ?? 0)}
  if (flags.block || flags.warn) query.block = String(flags.block)
  for (const name of LIST_FILTERS) if (flags[name]?.length) query[name] = flags[name]
  if (flags.search?.trim()) query.q = flags.search
  return query
}

/** The run list's query for one page: the page, its size, each filter given and the order. */
function runListQuery(flags: RunsFlags, perPage: number): PolicyQuery {
  const query: PolicyQuery = {page: String(flags.page ?? 1), per_page: String(perPage)}
  if (flags.trigger?.length) query.trigger = flags.trigger
  if (flags.outcome?.length) query.outcome = flags.outcome
  if (flags.scope) query.scope = flags.scope
  if (flags.search?.trim()) query.q = flags.search.trim()
  if (flags.sort) query.sort = flags.sort
  if (flags.order) query.order = flags.order
  if (flags['latest-only']) query.latest_only = 'true'
  return query
}

/** The command that lists the next page: this one's list flags, without `--page`. */
function runListNext(flags: RunsFlags): string {
  const parts = ['xano policy runs']
  if (flags.branch !== undefined) parts.push(`-b ${quoted(flags.branch)}`)
  const perPage = flags['per-page'] ?? flags.limit
  if (perPage !== undefined) parts.push(`--per-page ${perPage}`)
  for (const trigger of flags.trigger ?? []) parts.push(`--trigger ${trigger}`)
  for (const outcome of flags.outcome ?? []) parts.push(`--outcome ${outcome}`)
  if (flags.scope) parts.push(`--scope ${flags.scope}`)
  if (flags.search?.trim()) parts.push(`--search ${quoted(flags.search.trim())}`)
  if (flags.sort) parts.push(`--sort ${flags.sort}`)
  if (flags.order) parts.push(`--order ${flags.order}`)
  if (flags['latest-only']) parts.push('--latest-only')
  return parts.join(' ')
}
