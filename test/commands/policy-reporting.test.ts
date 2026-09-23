import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

const source = 'policy AUTH-001 { title = "Auth" }'
const checks = [{
  description: 'Find forbidden statements at any nesting depth.',
  id: 'stack.statement_forbidden',
  label: 'Stacks exclude listed statements',
  object_kinds: ['query', 'function'],
  params: {scope: {required: false, type: 'object'}, statements: {required: true, type: 'string[]'}},
}, {description: 'Check authentication tables.', fix_hint: 'Enable auth.', id: 'table.auth_table_rules', label: 'Endpoints use the single auth table', object_kinds: ['table'], params: []}]
const catalogue = {goals: [], items: checks}
const backendError = {
  code: 'ERROR_CODE_SYNTAX_ERROR',
  message: 'Invalid block: enforcement',
  payload: {col: 3, error_snippet: 'enforcement = "advisory"', line: 22, stack: ['/internal/nested.php']},
  stack: '#0 /internal/Stack.php',
  trace: ['file: /internal/Schema.php(444)', 'credential test-token'],
  traceId: 'private-trace-id',
}
const coverage = (overrides: Record<string, unknown> = {}) =>
  ({enforcement: 'mandatory', included: true, run_id: 1129, stale: false, version: 1, ...overrides})
const policy = {enforcement: 'mandatory', id: 7, key: 'AUTH-001', latest_run: coverage(), lifecycle: 'active', rules: [{id: 'R1'}], version: 1}
const staleCoverage = coverage({stale: true, version: 0})
const notInRun = coverage({enforcement: null, included: false, version: null})
const noRun = coverage({enforcement: null, included: false, run_id: 0, version: null})
const snapshot = [{
  key: 'AUTH-001',
  rules: [{check: 'query.auth_required', id: 'R1', label: 'Endpoints require authentication', params: {api_groups: ['lab'], except_tags: ['public']}, title: ''}],
  statement: 'Every endpoint requires authentication unless it is tagged public.',
}]
const run = {
  findings: [{policy_key: 'AUTH-001'}],
  id: 1129,
  results: [{check_id: 'R1', checked: 10, message: '', policy_key: 'AUTH-001', status: 'fail'}],
  started_at: 2000,
}
const detailRun = {...run, policies: snapshot, trigger: 'manual'}

describe('policy reporting', () => {
  const fixture = policyFixture({branch: 'profile-branch', source, workspace: '3'})

  /** The list serves `current`; the run its `latest_run` names is `latest`. */
  function statusRoute(current: Record<string, unknown> = policy, latest: Record<string, unknown> = run): void {
    fixture.route((url) => url.pathname.includes('/run/') ? json(latest) : json({items: [current]}))
  }

  function command(action: string, flags: string[] = []) {
    const args = action.split(' ')
    if (['parse', 'publish'].includes(args[1])) args.push('-f', path.join(fixture.directory, 'policy.xs'))
    if (args[0] === 'workspace') args.push('-d', fixture.directory)
    if (action === 'workspace push') args.push('--force', '--no-guids')
    return runCommand([...args, ...flags], fixture.config)
  }

  it('catalogue renders readable columns, each check named by its label', async () => {
    fixture.route(() => json(catalogue))
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    for (const text of ['Check ID', 'Label / Description', 'Object kinds', 'Required params', 'query, function', 'statements: string[]', 'Check authentication tables.', 'Fix hint: Enable auth.'])
      expect(result.stdout).to.contain(text)
    for (const check of checks) expect(result.stdout.split('\n').find(line => line.startsWith(check.id))).to.contain(check.label)
    expect(result.stdout).not.to.contain('"required":').and.not.to.contain('scope: object')
  })

  it('catalogue names the params a rule must set one of', async () => {
    fixture.route(() => json({goals: [], items: [{
      description: 'Bound a param.', id: 'statement.param_bound', label: 'Statement params stay in bounds', object_kinds: ['query'],
      params: {max: {type: 'number'}, min: {type: 'number'}}, requires_one_of: ['min', 'max'],
    }]}))
    const result = await command('policy catalogue')
    expect(result.stdout.split('\n').find(line => line.startsWith('statement.param_bound'))).to.contain('one of: min | max')
    expect(result.stdout).not.to.contain('  none')
  })

  it('catalogue JSON is the native body', async () => {
    fixture.route(() => json(catalogue))
    const result = await command('policy catalogue', ['-o', 'json'])
    expect(JSON.parse(result.stdout)).to.deep.equal(catalogue)
  })

  it('catalogue --check narrows both output modes to the one check', async () => {
    fixture.route(() => json(catalogue))
    const summary = await command('policy catalogue', ['--check', 'table.auth_table_rules'])
    expect(summary.stdout).to.contain('table.auth_table_rules').and.not.to.contain('stack.statement_forbidden')
    const asJson = await command('policy catalogue', ['--check', 'table.auth_table_rules', '-o', 'json'])
    expect(JSON.parse(asJson.stdout)).to.deep.equal([checks[1]])
  })

  it('catalogue --check names the near miss, or where the list is', async () => {
    fixture.route(() => json(catalogue))
    const near = await command('policy catalogue', ['--check', 'table.auth_table_rule'])
    expect(near.error?.message).to.contain('Did you mean table.auth_table_rules?')
    expect(near.stdout).to.equal('')
    const far = await command('policy catalogue', ['--check', 'totally.unrelated'])
    expect(far.error?.message).to.contain('Run `xano policy catalogue` for the full list.')
  })

  it('catalogue wraps long descriptions instead of truncating them', async () => {
    fixture.route(() => json({goals: [], items: [{...checks[0], description: 'Inspect every nested statement. '.repeat(8)}]}))
    const result = await command('policy catalogue')
    expect(result.stdout.match(/Inspect/g)).to.have.length(8)
    expect(result.stdout.split('\n').every(line => line.length <= 144)).to.equal(true)
  })

  it('list prints the version beside the lifecycle, and JSON is the native body', async () => {
    const body = {curPage: 1, items: [{...policy, title: 'Auth', version: 5}], nextPage: null, prevPage: null}
    fixture.route(() => json(body))
    const result = await command('policy list')
    expect(result.stdout).to.contain('AUTH-001  active  Auth (ID: 7, Version 5)')
    expect(JSON.parse((await command('policy list', ['-o', 'json'])).stdout)).to.deep.equal(body)
  })

  it('runs JSON is the native body, like list', async () => {
    const body = {curPage: 1, items: [{counts: {blocking: 1, errors: 0, findings: 1}, id: 1129, objects_checked: 10, started_at: 2000, status: 'fail', trigger: 'manual'}], nextPage: null, prevPage: null}
    fixture.route(() => json(body))
    expect(JSON.parse((await command('policy runs', ['-o', 'json'])).stdout)).to.deep.equal(body)
  })

  it('runs --run-detail without a run id is refused', async () => {
    fixture.route(() => json({items: []}))
    const result = await command('policy runs', ['--run-detail'])
    expect(result.error?.message).to.contain('`xano policy runs <id> --run-detail`')
    expect(fixture.calls).to.have.length(0)
  })

  it('evaluate --run-detail reports what the run it just produced recorded, and only when asked', async () => {
    fixture.route(() => json({...detailRun, policy_check: {blocking: false, findings: [], status: 'pass'}}))
    const detail = await command('policy evaluate', ['--run-detail'])
    expect(detail.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
      .and.to.contain('R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]')
    const plain = await command('policy evaluate')
    expect(plain.stdout).not.to.contain('as recorded').and.not.to.contain('settings:')
  })

  it('names a rule refused for its name with the platform sentence and where the name is', async () => {
    const message = 'rule[1]: A rule cannot be named. Write "rule {" — rules are identified by position (KEY.R1, KEY.R2…).'
    fixture.route(() => json({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {char: 61, col: 8, error_line: '  rule foo {', error_snippet: 'foo {', line: 5}}, 400))
    const result = await command('policy parse')
    expect(result.error?.message).to.contain(message).and.to.contain('at line 5, col 8:   rule foo {')
  })

  for (const verbose of [false, true]) {
    it(`folds backend traces, verbose=${verbose}`, async () => {
      fixture.route(() => json(backendError, 400))
      const result = await command('policy parse', ['-o', 'json', ...(verbose ? ['-v'] : [])])
      expect(result.error?.message).to.contain('ERROR_CODE_SYNTAX_ERROR: Invalid block: enforcement')
        .and.to.contain('at line 22, col 3: enforcement = "advisory"')
      expect(`${result.error?.message}${result.stdout}`).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
      expect(JSON.parse(result.stdout).error.message).to.equal(result.error?.message)
      if (verbose) expect(result.stderr).to.contain('/internal/Schema.php').and.to.contain('private-trace-id')
      else expect(result.stderr).not.to.contain('/internal/')
      expect(result.stderr).not.to.contain('test-token')
    })
  }

  for (const explicit of [false, true]) {
    it(`names the missing ${explicit ? 'flag' : 'profile'} branch`, async () => {
      fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: ''}, 404))
      const result = await command('policy list', explicit ? ['-b', 'missing-branch', '-w', '9'] : [])
      expect(result.error?.message).to.contain(`Branch "${explicit ? 'missing-branch' : 'profile-branch'}" was not found in workspace ${explicit ? '9' : '3'}.`)
    })
  }

  it('preserves a nonempty 404 explanation', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: 'Policy was deleted.'}, 404))
    const result = await command('policy list', ['-b', 'missing'])
    expect(result.error?.message).to.contain('Policy was deleted.').and.not.to.contain('Branch "')
  })

  it('does not fold, redact or synthesize errors for non-policy commands', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: ''}, 404))
    const result = await command('workspace pull', ['-b', 'missing', '-v'])
    expect(result.error?.message).to.contain('API request failed with status 404').and.not.to.contain('Branch "')
    expect(result.stderr).not.to.contain('ERROR_CODE_NOT_FOUND')
  })

  it('folds publish save errors after a successful parse and lookup', async () => {
    fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
      : method === 'GET' ? json({items: []}) : json(backendError, 500))
    const result = await command('policy publish', ['-v', '-o', 'json'])
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(JSON.parse(result.stdout).error.message).to.contain('ERROR_CODE_SYNTAX_ERROR')
    expect(result.stdout).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
    expect(result.stderr).to.contain('/internal/Schema.php')
  })

  it('XANO_VERBOSE exposes traces only on stderr', async () => {
    process.env.XANO_VERBOSE = 'true'
    fixture.route(() => json(backendError, 400))
    const result = await command('policy parse', ['-o', 'json'])
    expect(result.stdout).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
    expect(result.stderr).to.contain('/internal/Schema.php')
  })

  it('draft status hides historical counts and diagnostics, and never calls a draft blocking', async () => {
    statusRoute({...policy, latest_run: staleCoverage, lifecycle: 'draft'}, {...run, results: [{...run.results[0], message: 'OLD ERROR', status: 'error'}]})
    const result = await command('policy status')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('draft; not evaluated  Mandatory  — findings').and.not.to.contain('OLD ERROR')
    expect(result.stdout).not.to.contain('Blocking')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('status labels only an active mandatory policy Blocking', async () => {
    statusRoute(policy, run)
    expect((await command('policy status')).stdout).to.contain('AUTH-001  fail  Blocking  1 findings')
    statusRoute({...policy, enforcement: 'advisory'}, run)
    expect((await command('policy status')).stdout).to.contain('AUTH-001  fail  Advisory  1 findings')
  })

  it('status --run-detail reports the description, settings and coverage the run recorded', async () => {
    statusRoute(policy, detailRun)
    const result = await command('policy status', ['--run-detail'])
    expect(result.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
      .and.to.contain('AUTH-001  Every endpoint requires authentication unless it is tagged public.')
      .and.to.contain('R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]  checked 10')
    statusRoute(policy, {...detailRun, results: [{...detailRun.results[0], checked: 0, status: 'pass'}]})
    const empty = await command('policy status', ['--run-detail'])
    expect(empty.stdout).to.contain('except_tags=[public]  no objects checked')
  })

  it('status --run-detail says so when the run evaluated no policy', async () => {
    statusRoute({...policy, latest_run: coverage({included: false, run_id: 1075})}, {...detailRun, id: 1075, policies: []})
    const result = await command('policy status', ['--run-detail'])
    expect(result.stdout).to.contain('Run 1075 evaluated no policies.').and.not.to.contain('as recorded')
  })

  it('status names the rules that checked nothing while others passed', async () => {
    const results = [
      {check_id: 'R1', checked: 9, message: '', policy_key: 'AUTH-001', status: 'pass'},
      {check_id: 'R2', checked: 0, message: '', policy_key: 'AUTH-001', status: 'pass'},
    ]
    statusRoute({...policy, rules: [{id: 'R1'}, {id: 'R2'}]}, {...run, findings: [], results})
    const result = await command('policy status')
    expect(result.stdout).to.contain('AUTH-001  pass; 1 rule no objects checked  Blocking  0 findings')
    expect(result.stdout).to.contain('No objects checked (proves nothing about coverage):\n  AUTH-001 R2: no objects checked')
    const asJson = await command('policy status', ['-o', 'json'])
    expect(JSON.parse(asJson.stdout).status[0]).to.include({rules_unchecked: 1, status: 'pass'})
  })

  it('--fail-on-findings says in one line why it failed, and says it in JSON too', async () => {
    statusRoute(policy, run)
    const blocked = await command('policy status', ['--fail-on-findings'])
    expect(blocked.stdout).to.contain('Merge blocked by policy: 1 blocking finding on mandatory policies (AUTH-001).')
    expect(process.exitCode).to.equal(2)

    statusRoute({...policy, latest_run: staleCoverage}, run)
    const stale = await command('policy status', ['--fail-on-findings'])
    expect(stale.stdout).to.contain('Evaluation evidence is stale, missing or errored (AUTH-001 outdated; evaluate again); exit 1.')
    expect(process.exitCode).to.equal(1)

    statusRoute(policy, run)
    const asJson = JSON.parse((await command('policy status', ['--fail-on-findings', '-o', 'json'])).stdout)
    expect(asJson.status[0]).to.include({counted: true, enforcement: 'mandatory', lifecycle: 'active'})
    expect(asJson.fail_on_findings).to.deep.equal({exit: 2, reason: 'Merge blocked by policy: 1 blocking finding on mandatory policies (AUTH-001).'})
    expect(process.exitCode).to.equal(2)
  })

  it('status JSON stays a passthrough of the native run and omits the exit block without the flag', async () => {
    statusRoute(policy, detailRun)
    const result = JSON.parse((await command('policy status', ['--run-detail', '-o', 'json'])).stdout)
    expect(result.run).to.deep.equal(detailRun)
    expect(result).not.to.have.property('fail_on_findings')
  })

  it('evaluate names an unnamed rule by the label its own run snapshot recorded', async () => {
    const finding = {id: 'F1', message: 'No auth', object: {name: 'orders', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'R1', rule_title: ''}
    fixture.route(() => json({...detailRun, findings: [finding], policy_check: {blocking: true, blocking_finding_ids: ['F1'], status: 'fail'}}))
    const result = await command('policy evaluate')
    expect(result.stdout).to.contain('Endpoints require authentication (AUTH-001)')
    expect(process.exitCode).to.equal(2)
  })

  for (const [current, stale, status] of [
    [policy, false, 'fail'],
    [{...policy, latest_run: staleCoverage}, true, 'stale'],
    [{...policy, latest_run: notInRun}, false, 'not_evaluated'],
    [{...policy, latest_run: noRun}, false, 'not_evaluated'],
    [{...policy, latest_run: staleCoverage, lifecycle: 'draft'}, true, 'draft'],
    [{...policy, latest_run: noRun, lifecycle: 'draft'}, false, 'draft'],
  ] as const) {
    it(`status JSON carries the served freshness for ${status} stale=${stale}`, async () => {
      statusRoute(current, run)
      const result = await command('policy status', ['-o', 'json'])
      const row = JSON.parse(result.stdout).status[0]
      expect(row).to.include({stale, status})
      if (status !== 'fail') expect(row).to.include({checked: 0, counted: false, findings: 0})
    })
  }

  for (const [current, latest, code] of [
    [policy, run, 2],
    [{...policy, enforcement: 'advisory'}, run, 0],
    [{...policy, latest_run: staleCoverage}, run, 1],
    [{...policy, latest_run: notInRun}, run, 1],
    [{...policy, latest_run: noRun}, run, 1],
    [{...policy, latest_run: staleCoverage, lifecycle: 'draft'}, run, 0],
    [{...policy, latest_run: noRun, lifecycle: 'draft'}, run, 0],
    [policy, {...run, findings: [], results: [{...run.results[0], status: 'pass'}]}, 0],
    [policy, {...run, findings: [], results: [{...run.results[0], status: 'error'}]}, 1],
    [policy, {...run, findings: [], results: []}, 1],
  ] as const) {
    it(`status CI exits ${code} for ${JSON.stringify({current, latest})}`, async () => {
      statusRoute(current, latest)
      const result = await command('policy status', ['--fail-on-findings', '-o', 'json'])
      expect(result.error).to.equal(undefined)
      expect(process.exitCode ?? 0).to.equal(code)
    })
  }

  for (const action of ['policy evaluate', 'workspace push']) {
    it(`${action} labels advisory findings without changing JSON or exit status`, async () => {
      const check = {blocking: false, findings: [{message: 'Review auth'}], status: 'fail'}
      fixture.route(() => json({policy_check: check}))
      const summary = await command(action)
      expect(summary.stdout).to.contain('Policy check: advisory findings (not blocking)')
      const result = await command(action, ['-o', 'json'])
      expect(JSON.parse(result.stdout).policy_check).to.deep.equal(check)
      expect(process.exitCode ?? 0).to.equal(0)
    })
  }
})
