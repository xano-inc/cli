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
  params: {object_kinds: {required: false, type: 'string[]'}, statements: {required: true, type: 'string[]'}},
}, {description: 'Check authentication tables.', fix_hint: 'Enable auth.', id: 'table.auth_table_rules', label: 'Endpoints use the single auth table', object_kinds: ['table'], params: []}]
const catalogue = {items: checks, templates: []}
const backendError = {
  code: 'ERROR_CODE_SYNTAX_ERROR',
  message: 'Invalid block: enforcement',
  payload: {col: 3, error_snippet: 'enforcement = "advisory"', line: 22, stack: ['/internal/nested.php']},
  stack: '#0 /internal/Stack.php',
  trace: ['file: /internal/Schema.php(444)', 'credential test-token'],
  traceId: 'private-trace-id',
}
const coverage = (overrides: Record<string, unknown> = {}) =>
  ({enforcement: 'blocking', included: true, run_id: 1129, stale: false, version: 1, ...overrides})
const policy = {active: true, enforcement: 'blocking', id: 7, key: 'AUTH-001', latest_run: coverage(), rules: [{id: 'R1'}], version: 1}
const staleCoverage = coverage({stale: true, version: 0})
const notInRun = coverage({enforcement: null, included: false, version: null})
const noRun = coverage({enforcement: null, included: false, run_id: 0, version: null})
const snapshot = [{
  key: 'AUTH-001',
  rules: [{check: 'object.auth_required', id: 'R1', label: 'Endpoints require authentication', params: {api_groups: ['lab'], except_tags: ['public']}, title: ''}],
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
    expect(result.stdout).not.to.contain('"required":').and.not.to.contain('object_kinds: string[]')
  })

  it('catalogue names the params a rule must set one of', async () => {
    fixture.route(() => json({items: [{
      description: 'Bound a param.', id: 'statement.param_bound', label: 'Statement params stay in bounds', object_kinds: ['query'],
      params: {max: {type: 'number'}, min: {type: 'number'}}, requires_one_of: ['min', 'max'],
    }], templates: []}))
    const result = await command('policy catalogue')
    expect(result.stdout.split('\n').find(line => line.startsWith('statement.param_bound'))).to.contain('one of: min | max')
    expect(result.stdout).not.to.contain('  none')
  })

  it('catalogue lists the templates under their category labels, in the order the catalogue lists the categories', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    fixture.route(() => json({items: checks, template_categories: [
      {id: 'access_control', label: 'Access control'}, {id: 'secrets', label: 'Secrets'}, {id: 'testing', label: 'Testing'},
    ], templates: [
      {category: 'testing', id: 'endpoints_have_tests', key: 'CHG-001', rules: [rule, rule], severity: 'low', summary: '', title: 'Endpoints are tested'},
      {category: 'access_control', id: 'endpoints_need_login', key: 'AUTH-010', rules: [rule], severity: 'critical', summary: '', title: 'Endpoints require login'},
      {category: 'access_control', id: 'one_auth_table', key: 'AUTH-050', rules: [rule], severity: 'medium', summary: '', title: 'Users sign in through one auth table'},
      {category: 'future_group', id: 'newer', key: 'N-001', rules: [rule], severity: 'low', summary: '', title: 'From a newer instance'},
      {id: 'uncategorized', key: 'X-001', rules: [rule], severity: 'low', summary: '', title: 'From an older instance'},
    ]}))
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    const lines = result.stdout.split('\n')
    const at = (text: string) => lines.findIndex(line => line.includes(text))
    expect(at('Templates (xano policy create --template <id>):')).to.be.greaterThan(at('stack.statement_forbidden'))
    expect(lines.filter(line => line === 'Access control')).to.have.length(1)
    expect(lines).not.to.include('Secrets')
    expect(at('Access control')).to.be.lessThan(at('endpoints_need_login'))
    expect(at('endpoints_need_login')).to.be.lessThan(at('one_auth_table'))
    expect(at('one_auth_table')).to.be.lessThan(lines.indexOf('Testing'))
    expect(lines[at('endpoints_have_tests')]).to.contain('Endpoints are tested (CHG-001, low, 2 rules)')
    expect(at('newer')).to.be.greaterThan(lines.indexOf('future_group'))
    expect(at('uncategorized')).to.be.greaterThan(lines.indexOf('Other'))
  })

  it('catalogue tags templates with their framework labels and prints the served note once, under the heading', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    const note = 'Framework tags point to templates on related topics. They don\'t make a workspace compliant, and Xano doesn\'t track changes to these frameworks.'
    fixture.route(() => json({items: checks, template_categories: [{id: 'access_control', label: 'Access control'}], template_frameworks: [
      {id: 'soc2', label: 'SOC 2'}, {id: 'hipaa', label: 'HIPAA'},
    ], template_frameworks_note: note, templates: [
      {category: 'access_control', frameworks: ['soc2', 'hipaa'], id: 'endpoints_need_login', key: 'AUTH-010', rules: [rule], severity: 'critical', summary: '', title: 'Endpoints require login'},
      {category: 'access_control', frameworks: [], id: 'one_auth_table', key: 'AUTH-050', rules: [rule], severity: 'medium', summary: '', title: 'Users sign in through one auth table'},
      {category: 'access_control', frameworks: ['newer'], id: 'tagged_later', key: 'N-001', rules: [rule], severity: 'low', summary: '', title: 'Tagged by a newer instance'},
    ]}))
    const lines = (await command('policy catalogue')).stdout.split('\n')
    const heading = lines.indexOf('Templates (xano policy create --template <id>):')
    expect(lines[heading + 1]).to.equal(note)
    expect(lines.filter(line => line === note)).to.have.length(1)
    expect(lines.find(line => line.includes('endpoints_need_login'))).to.match(/\(AUTH-010, critical, 1 rule\) \[SOC 2, HIPAA\]$/)
    expect(lines.find(line => line.includes('one_auth_table'))).to.match(/\(AUTH-050, medium, 1 rule\)$/)
    expect(lines.find(line => line.includes('tagged_later'))).to.match(/\[newer\]$/)
  })

  it('catalogue prints no framework note when no template carries a tag', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    fixture.route(() => json({items: checks, template_frameworks: [{id: 'soc2', label: 'SOC 2'}], template_frameworks_note: 'A note.', templates: [
      {category: 'access_control', frameworks: [], id: 'one_auth_table', key: 'AUTH-050', rules: [rule], severity: 'medium', summary: '', title: 'Users sign in through one auth table'},
    ]}))
    expect((await command('policy catalogue')).stdout).not.to.contain('A note.')
  })

  it('catalogue shows no framework tags when the instance serves no note to show with them', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    fixture.route(() => json({items: checks, template_frameworks: [{id: 'soc2', label: 'SOC 2'}], templates: [
      {category: 'access_control', frameworks: ['soc2'], id: 'endpoints_need_login', key: 'AUTH-010', rules: [rule], severity: 'critical', summary: '', title: 'Endpoints require login'},
    ]}))
    const {stdout} = await command('policy catalogue')
    expect(stdout.split('\n').find(line => line.includes('endpoints_need_login'))).to.match(/\(AUTH-010, critical, 1 rule\)$/)
    expect(stdout).not.to.contain('SOC 2')
  })

  it('catalogue prints no template section when the instance serves none', async () => {
    fixture.route(() => json(catalogue))
    expect((await command('policy catalogue')).stdout).not.to.contain('Templates')
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
    fixture.route(() => json({items: [{...checks[0], description: 'Inspect every nested statement. '.repeat(8)}], templates: []}))
    const result = await command('policy catalogue')
    expect(result.stdout.match(/Inspect/g)).to.have.length(8)
    expect(result.stdout.split('\n').every(line => line.length <= 144)).to.equal(true)
  })

  it('list prints the version beside its activation state, and JSON is the native body', async () => {
    const body = {curPage: 1, items: [{...policy, title: 'Auth', version: 5}], nextPage: null, prevPage: null}
    fixture.route(() => json(body))
    const result = await command('policy list')
    expect(result.stdout).to.contain('AUTH-001  Active, Blocking  Auth (ID: 7, Version 5)')
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

  it('evaluate --summary asks for the summary answer and says which run has the findings it leaves out', async () => {
    const findings = Array.from({length: 50}, (_, n) => ({id: `F${n}`, message: 'No auth', object: {name: `GET /x${n}`, type: 'query'}, policy_key: 'AUTH-001', rule_id: 'R1'}))
    const answer = {
      ...detailRun, counts: {advisory: 70, blocking: 0, errors: 0, findings: 70}, findings,
      policy_check: {blocking: false, blocking_finding_ids: [], blocking_total: 0, message: 'Active policies reported findings.', run_id: 1129, status: 'fail'},
      stored: true, total: 70, truncated: true,
    }
    fixture.route(() => json(answer))
    const result = await command('policy evaluate', ['--summary', '--run-detail'])
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({answer: 'summary'})
    expect(result.stdout).to.contain('Policy check: advisory findings (not blocking)\nActive policies reported findings.\nFindings: 70 (0 blocking, 70 advisory)')
    expect(result.stdout).to.contain('Listed: the first 50 of 70; `xano policy runs 1129` has them all.')
    // The summary carries the snapshot, so --run-detail still reports what the run recorded.
    expect(result.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
    expect(JSON.parse((await command('policy evaluate', ['--summary', '-o', 'json'])).stdout)).to.deep.equal(answer)

    // A credential that may read but not write: nothing was stored to read the rest from.
    fixture.route(() => json({...answer, id: 0, policy_check: {...answer.policy_check, run_id: 0}, stored: false}))
    const unstored = await command('policy evaluate', ['--summary'])
    expect(unstored.stdout).to.contain('Listed: the first 50 of 70; this evaluation was not stored, so the rest cannot be listed.')

    // Without the flag an evaluation sends no body and answers the whole run, as before.
    fixture.route(() => json({...detailRun, policy_check: {blocking: false, status: 'pass'}}))
    await command('policy evaluate')
    expect(fixture.calls.at(-1)?.body).to.equal(undefined)
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

  it('inactive status hides historical counts and diagnostics, and never calls an inactive policy blocking', async () => {
    statusRoute({...policy, active: false, latest_run: staleCoverage}, {...run, results: [{...run.results[0], message: 'OLD ERROR', status: 'error'}]})
    const result = await command('policy status')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('inactive; not evaluated  Inactive  not checked  ').and.not.to.contain('OLD ERROR')
    expect(result.stdout).not.to.contain('— findings')
    expect(result.stdout).not.to.contain('Blocking')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('status words enforcement as Studio does, and marks only findings the run judged blocking', async () => {
    statusRoute(policy, run)
    expect((await command('policy status')).stdout).to.contain('AUTH-001  fail  Blocking  1 findings (blocking)')
    statusRoute({...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}, run)
    const advisory = await command('policy status', ['-o', 'json'])
    expect(JSON.parse(advisory.stdout).status[0]).to.include({blocking: false, findings: 1})
    statusRoute({...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}, run)
    expect((await command('policy status')).stdout).to.contain('AUTH-001  fail  Advisory  1 findings  ').and.not.to.contain('(blocking)')
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
    expect(blocked.stdout).to.contain('The latest run has 1 blocking finding (AUTH-001); the merge gate evaluates the branch again before a merge.')
    expect(process.exitCode).to.equal(2)

    statusRoute({...policy, latest_run: staleCoverage}, run)
    const stale = await command('policy status', ['--fail-on-findings'])
    expect(stale.stdout).to.contain('Evaluation evidence is stale, missing or errored (AUTH-001 outdated; evaluate again); exit 1.')
    expect(process.exitCode).to.equal(1)

    statusRoute(policy, run)
    const asJson = JSON.parse((await command('policy status', ['--fail-on-findings', '-o', 'json'])).stdout)
    expect(asJson.status[0]).to.include({active: true, blocking: true, counted: true, enforcement: 'blocking'})
    expect(asJson.fail_on_findings).to.deep.equal({exit: 2, reason: 'The latest run has 1 blocking finding (AUTH-001); the merge gate evaluates the branch again before a merge.'})
    expect(process.exitCode).to.equal(2)
  })

  it('--fail-on-findings exits 2 for a blocking finding beside a stale policy', async () => {
    const stale = {...policy, id: 8, key: 'SEC-100', latest_run: staleCoverage}
    fixture.route((url) => url.pathname.includes('/run/') ? json(run) : json({items: [policy, stale]}))
    const result = await command('policy status', ['--fail-on-findings', '-o', 'json'])
    expect(JSON.parse(result.stdout).fail_on_findings.exit).to.equal(2)
    expect(JSON.parse(result.stdout).fail_on_findings.reason).to.contain('1 blocking finding (AUTH-001)')
      .and.to.contain('Evidence is also stale, missing or errored (SEC-100 outdated; evaluate again).')
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
    [{...policy, active: false, latest_run: staleCoverage}, true, 'inactive'],
    [{...policy, active: false, latest_run: noRun}, false, 'inactive'],
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
    [{...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}, run, 0],
    [{...policy, latest_run: staleCoverage}, run, 1],
    [{...policy, latest_run: notInRun}, run, 1],
    [{...policy, latest_run: noRun}, run, 1],
    [{...policy, active: false, latest_run: staleCoverage}, run, 0],
    [{...policy, active: false, latest_run: noRun}, run, 0],
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
