/* eslint-disable unicorn/filename-case -- Repository filename convention. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy_fixture.js'

const source = 'policy AUTH-001 { title = "Auth" }'
const catalogue = [{
  description: 'Find forbidden statements at any nesting depth.',
  id: 'stack.statement_forbidden',
  label: 'Stacks exclude listed statements',
  object_kinds: ['query', 'function'],
  params: {scope: {required: false, type: 'object'}, statements: {required: true, type: 'string[]'}},
}, {description: 'Check authentication tables.', fix_hint: 'Enable auth.', id: 'table.auth_table_rules', label: 'Endpoints use the single auth table', object_kinds: ['table'], params: []}]
const backendError = {
  code: 'ERROR_CODE_SYNTAX_ERROR',
  message: 'Invalid block: enforcement',
  payload: {col: 2, error_snippet: 'enforcement = "advisory"', line: 21, stack: ['/internal/nested.php']},
  stack: '#0 /internal/Stack.php',
  trace: ['file: /internal/Schema.php(444)', 'credential test-token'],
  traceId: 'private-trace-id',
}
const policy = {enforcement: 'mandatory', id: 7, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}], updated_at: 1000}
const snapshot = [{
  key: 'AUTH-001',
  rules: [{check: 'query.auth_required', id: 'R1', label: 'Endpoints require authentication', params: {api_groups: ['lab'], except_tags: ['public']}, title: ''}],
  statement: 'Every endpoint requires authentication unless it is tagged public.',
}]
const run = {
  findings: [{policy_key: 'AUTH-001'}],
  results: [{check_id: 'R1', checked: 10, message: '', policy_key: 'AUTH-001', status: 'fail'}],
  started_at: 2000,
}
const detailRun = {...run, id: 1129, policies: snapshot, trigger: 'manual'}
// A run stored before the platform recorded descriptions and settings.
const oldRun = {...detailRun, id: 1075, policies: [{key: 'AUTH-001', rules: [{check: 'query.auth_required', id: 'R1', title: ''}]}]}

function statusRoute(current = policy, latest: null | typeof oldRun | typeof run = run): void {
  globalThis.fetch = async input => String(input).includes('/run?')
    ? json({items: latest ? [latest] : []}) : json([current])
}

describe('policy reporting regressions', () => {
  const fixture = policyFixture({branch: 'profile-branch', source, workspace: '3'})

  function command(action: string, flags: string[] = []) {
    const args = action.split(' ')
    if (['parse', 'publish'].includes(args[1])) args.push('-f', path.join(fixture.directory, 'policy.xs'))
    if (args[0] === 'workspace') args.push('-d', fixture.directory)
    if (action === 'workspace push') args.push('--force', '--no-guids')
    return runCommand([...args, ...flags], fixture.config)
  }

  for (const flags of [[], ['-o', 'summary']]) {
    it(`catalogue renders readable columns with ${JSON.stringify(flags)}`, async () => {
      globalThis.fetch = async () => json(catalogue)
      const result = await command('policy catalogue', flags)
      expect(result.error).to.equal(undefined)
      for (const text of ['Check ID', 'Description', 'Object kinds', 'Required params', 'stack.statement_forbidden', 'query, function', 'statements: string[]', 'Check authentication tables.', 'Fix hint: Enable auth.'])
        expect(result.stdout).to.contain(text)
      expect(result.stdout).not.to.contain('"required":')
      expect(result.stdout).not.to.contain('scope: object')
    })
  }

  it('catalogue names each check by its label beside the id', async () => {
    globalThis.fetch = async () => json(catalogue)
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('Label / Description')
    for (const [id, label] of [['stack.statement_forbidden', 'Stacks exclude listed statements'], ['table.auth_table_rules', 'Endpoints use the single auth table']]) {
      expect(result.stdout.split('\n').find(line => line.startsWith(id))).to.contain(label)
    }
  })

  it('catalogue falls back to a title when an older instance sends no label', async () => {
    globalThis.fetch = async () => json([{...catalogue[0], label: undefined, title: 'Stacks exclude listed statements'}])
    const result = await command('policy catalogue')
    expect(result.stdout).to.contain('Stacks exclude listed statements').and.to.contain('Find forbidden statements')
  })

  it('catalogue JSON retains the complete native schemas', async () => {
    globalThis.fetch = async () => json(catalogue)
    const result = await command('policy catalogue', ['-o', 'json'])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal(catalogue)
  })

  it('catalogue --check narrows both output modes to the one check', async () => {
    globalThis.fetch = async () => json(catalogue)
    const summary = await command('policy catalogue', ['--check', 'table.auth_table_rules'])
    expect(summary.error).to.equal(undefined)
    expect(summary.stdout).to.contain('table.auth_table_rules').and.not.to.contain('stack.statement_forbidden')
    globalThis.fetch = async () => json(catalogue)
    const asJson = await command('policy catalogue', ['--check', 'table.auth_table_rules', '-o', 'json'])
    expect(JSON.parse(asJson.stdout)).to.deep.equal([catalogue[1]])
  })

  it('catalogue --check names the near miss instead of reprinting the catalogue', async () => {
    globalThis.fetch = async () => json(catalogue)
    const result = await command('policy catalogue', ['--check', 'table.auth_table_rule'])
    expect(result.error?.message).to.contain('is not a policy check')
      .and.to.contain('Did you mean table.auth_table_rules?')
    expect(result.stdout).to.equal('')
  })

  it('catalogue --check says where the list is when nothing is close', async () => {
    globalThis.fetch = async () => json(catalogue)
    const result = await command('policy catalogue', ['--check', 'totally.unrelated'])
    expect(result.error?.message).to.contain('Run `xano policy catalogue` for the full list.')
  })

  it('list prints the version beside the lifecycle', async () => {
    globalThis.fetch = async () => json([{id: 7, key: 'AUTH-001', lifecycle: 'active', title: 'Auth', version: 5}])
    const result = await command('policy list')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('AUTH-001  active  Auth (ID: 7, Version 5)')
  })

  it('list omits the version an older instance does not send', async () => {
    globalThis.fetch = async () => json([{id: 7, key: 'AUTH-001', lifecycle: 'active', title: 'Auth'}])
    const result = await command('policy list')
    expect(result.stdout).to.contain('(ID: 7)').and.not.to.contain('Version')
  })

  it('evaluate --run-detail reports what the run it just produced recorded', async () => {
    globalThis.fetch = async () => json({...detailRun, policy_check: {blocking: false, findings: [], status: 'pass'}})
    const result = await command('policy evaluate', ['--run-detail'])
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
      .and.to.contain('R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]')
  })

  it('evaluate omits run detail unless asked', async () => {
    globalThis.fetch = async () => json({...detailRun, policy_check: {blocking: false, findings: [], status: 'pass'}})
    const result = await command('policy evaluate')
    expect(result.stdout).not.to.contain('as recorded').and.not.to.contain('settings:')
  })

  it('catalogue wraps long descriptions and lists instead of truncating them', async () => {
    globalThis.fetch = async () => json([{...catalogue[0], description: 'Inspect every nested statement. '.repeat(8)}])
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    expect(result.stdout.match(/Inspect/g)).to.have.length(8)
    expect(result.stdout.match(/statement\./g)).to.have.length(8)
    expect(result.stdout.split('\n').every(line => line.length <= 144)).to.equal(true)
  })

  for (const action of ['policy parse', 'policy publish']) {
    it(`${action} reports a named rule with the platform's sentence and where the name is`, async () => {
      // Only `rule {` is legal: the backend refuses `rule foo {` at parse time, pointing at the name.
      const message = 'rule[1]: A rule cannot be named. Write "rule {" — rules are identified by position (KEY.R1, KEY.R2…).'
      globalThis.fetch = async () => json({
        code: 'ERROR_CODE_BAD_REQUEST',
        message,
        payload: {char: 61, col: 7, error_line: '  rule foo {', error_snippet: 'foo {', line: 4},
      }, 400)
      const result = await command(action, [])
      expect(result.error?.message).to.contain(message).and.to.contain('at line 5, col 8:   rule foo {')
    })
  }

  for (const action of ['policy parse', 'policy publish']) {
    for (const verbose of [false, true]) {
      for (const output of ['summary', 'json']) {
        it(`${action} folds traces in ${output}, verbose=${verbose}`, async () => {
          globalThis.fetch = async () => json(backendError, 400)
          const result = await command(action, ['-o', output, ...(verbose ? ['-v'] : [])])
          expect(result.error).to.exist
          expect(result.error?.message).to.contain('ERROR_CODE_SYNTAX_ERROR').and.to.contain('Invalid block: enforcement')
          // Summary counts like an editor (payload line 21, col 2 -> line 22, col 3); -o json keeps the payload as sent.
          expect(result.error?.message).to.contain(output === 'json' ? '"line":21' : 'at line 22, col 3: enforcement = "advisory"')
          if (output === 'json') expect(result.error?.message).to.contain('"col":2').and.to.contain('advisory')
          else expect(result.error?.message).not.to.contain('payload:')
          expect(result.error?.message).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
          expect(result.stdout).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
          if (verbose) expect(result.stderr).to.contain('/internal/Schema.php').and.to.contain('private-trace-id')
          else expect(result.stderr).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
          expect(result.stderr).not.to.contain('test-token')
        })
      }
    }
  }

  for (const action of ['policy catalogue', 'policy list', 'policy parse', 'policy publish', 'policy evaluate', 'policy status']) {
    for (const explicit of [false, true]) {
      it(`${action} names missing ${explicit ? 'flag' : 'profile'} branch`, async () => {
        globalThis.fetch = async () => json({code: 'ERROR_CODE_NOT_FOUND', message: ''}, 404)
        const result = await command(action, explicit ? ['-b', 'missing-branch', '-w', '9'] : [])
        expect(result.error?.message).to.contain(`Branch "${explicit ? 'missing-branch' : 'profile-branch'}" was not found in workspace ${explicit ? '9' : '3'}.`)
      })
    }
  }

  it('preserves a nonempty 404 explanation', async () => {
    globalThis.fetch = async () => json({code: 'ERROR_CODE_NOT_FOUND', message: 'Policy was deleted.'}, 404)
    const result = await command('policy list', ['-b', 'missing'])
    expect(result.error?.message).to.contain('Policy was deleted.').and.not.to.contain('Branch "')
  })

  it('does not fold, redact or synthesize errors for non-policy commands', async () => {
    globalThis.fetch = async () => json({code: 'ERROR_CODE_NOT_FOUND', message: ''}, 404)
    const result = await command('workspace pull', ['-b', 'missing', '-v'])
    expect(result.error?.message).to.contain('API request failed (404)').and.not.to.contain('Branch "')
    expect(result.stderr).not.to.contain('ERROR_CODE_NOT_FOUND')
  })

  it('folds publish save errors after a successful parse and lookup', async () => {
    globalThis.fetch = async (input, options) => String(input).includes('/parse?')
      ? json({policy: {key: 'AUTH-001'}, source})
      : options?.method === 'GET' ? json([]) : json(backendError, 500)
    const result = await command('policy publish', ['-v', '-o', 'json'])
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.contain('ERROR_CODE_SYNTAX_ERROR').and.not.to.contain('/internal/')
    expect(result.stdout).to.equal('')
    expect(result.stderr).to.contain('/internal/Schema.php')
  })

  it('XANO_VERBOSE exposes traces only on stderr', async () => {
    process.env.XANO_VERBOSE = 'true'
    globalThis.fetch = async () => json(backendError, 400)
    const result = await command('policy parse', ['-o', 'json'])
    expect(result.stdout).to.equal('')
    expect(result.stderr).to.contain('/internal/Schema.php')
    expect(result.error?.message).not.to.contain('/internal/')
  })

  it('draft status hides historical counts and diagnostics', async () => {
    statusRoute({...policy, lifecycle: 'draft', updated_at: 3000}, {...run, results: [{...run.results[0], message: 'OLD ERROR', status: 'error'}]})
    const result = await command('policy status')
    expect(result.error).to.equal(undefined)
    // A draft is never evaluated, so there is no count to print — `0 findings` would read as "clean".
    expect(result.stdout).to.contain('draft; not evaluated  — findings').and.not.to.contain('OLD ERROR')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('status --run-detail reports the description and settings the run recorded', async () => {
    statusRoute(policy, detailRun)
    const result = await command('policy status', ['--run-detail'])
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
      .and.to.contain('AUTH-001  Every endpoint requires authentication unless it is tagged public.')
      .and.to.contain('R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]')
  })

  it('status omits run detail unless asked, and JSON stays a passthrough of the native run', async () => {
    statusRoute(policy, detailRun)
    const summary = await command('policy status')
    expect(summary.stdout).not.to.contain('as recorded').and.not.to.contain('settings:')
    statusRoute(policy, detailRun)
    const result = await command('policy status', ['--run-detail', '-o', 'json'])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).run).to.deep.equal(detailRun)
    expect(result.stdout).not.to.contain('as recorded')
  })

  it('status --run-detail says so when the retained run predates the recorded fields', async () => {
    statusRoute(policy, oldRun)
    const result = await command('policy status', ['--run-detail'])
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('Run 1075 predates recorded descriptions and settings')
      .and.not.to.contain('as recorded').and.not.to.contain('settings:')
  })

  it('evaluate names an unnamed rule by the label its own run snapshot recorded', async () => {
    const check = {blocking: true, findings: [{message: 'No auth', object: {name: 'orders', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'R1', rule_title: ''}], status: 'fail'}
    globalThis.fetch = async () => json({...detailRun, policy_check: check})
    const result = await command('policy evaluate')
    expect(result.stdout).to.contain('Endpoints require authentication (AUTH-001)')
    expect(process.exitCode).to.equal(2)
  })

  for (const [current, latest, stale, label] of [
    [policy, run, false, 'fail'],
    [{...policy, updated_at: 3000}, run, true, 'outdated; evaluate again'],
    [{...policy, lifecycle: 'draft', updated_at: 3000}, run, true, 'draft; not evaluated'],
    [policy, null, true, 'not evaluated'],
    [{...policy, lifecycle: 'draft'}, null, false, 'draft; not evaluated'],
  ] as const) {
    it(`status JSON carries freshness and timestamps for ${label} stale=${stale}`, async () => {
      statusRoute(current, latest)
      const result = await command('policy status', ['-o', 'json'])
      expect(result.error).to.equal(undefined)
      const row = JSON.parse(result.stdout).status[0]
      expect(row).to.include({policy_updated_at: current.updated_at, run_started_at: latest?.started_at ?? null, stale, status: label})
      if (current.lifecycle === 'draft') expect(row).to.include({checked: 0, findings: 0})
      expect(process.exitCode ?? 0).to.equal(0)
    })
  }

  for (const [current, latest, code] of [
    [policy, run, 2],
    [{...policy, enforcement: 'advisory'}, run, 0],
    [{...policy, updated_at: 3000}, run, 1],
    [policy, null, 1],
    [{...policy, lifecycle: 'draft', updated_at: 3000}, run, 1],
    [{...policy, lifecycle: 'draft'}, null, 0],
    [policy, {...run, findings: [], results: [{...run.results[0], status: 'pass'}]}, 0],
    [policy, {...run, findings: [], results: [{...run.results[0], status: 'error'}]}, 1],
    [policy, {...run, findings: [], results: []}, 1],
    [{...policy, lifecycle: 'draft'}, {...run, findings: [], results: [{...run.results[0], status: 'skip'}]}, 0],
  ] as const) {
    it(`status CI exits ${code} for ${JSON.stringify({current, latest})}`, async () => {
      statusRoute(current, latest as null | typeof run)
      const result = await command('policy status', ['--fail-on-findings', '-o', 'json'])
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).status).to.have.length(1)
      expect(process.exitCode ?? 0).to.equal(code)
    })
  }

  for (const action of ['policy evaluate', 'workspace push']) {
    it(`${action} labels advisory findings without changing JSON or exit status`, async () => {
      const check = {blocking: false, findings: [{message: 'Review auth'}], status: 'fail'}
      globalThis.fetch = async () => json({policy_check: check})
      const summary = await command(action)
      expect(summary.error).to.equal(undefined)
      expect(summary.stdout).to.contain('Policy check: advisory findings (not blocking)')
      const result = await command(action, ['-o', 'json'])
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).policy_check).to.deep.equal(check)
      expect(process.exitCode ?? 0).to.equal(0)
    })
  }
})
