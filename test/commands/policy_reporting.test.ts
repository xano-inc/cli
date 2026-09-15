/* eslint-disable unicorn/filename-case -- Repository filename convention. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy_fixture.js'

const source = 'policy AUTH-001 { title = "Auth" }'
const catalogue = [{
  description: 'Find forbidden statements at any nesting depth.',
  id: 'stack.statement_forbidden',
  object_kinds: ['query', 'function'],
  params: {scope: {required: false, type: 'object'}, statements: {required: true, type: 'string[]'}},
}, {description: 'Check authentication tables.', id: 'table.auth_table_rules', object_kinds: ['table'], params: []}]
const backendError = {
  code: 'ERROR_CODE_SYNTAX_ERROR',
  message: 'Invalid block: enforcement',
  payload: {col: 2, error_snippet: 'rule "R1" {', line: 21, stack: ['/internal/nested.php']},
  stack: '#0 /internal/Stack.php',
  trace: ['file: /internal/Schema.php(444)', 'credential test-token'],
  traceId: 'private-trace-id',
}
const policy = {enforcement: 'mandatory', id: 7, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}], updated_at: 1000}
const run = {
  findings: [{policy_key: 'AUTH-001'}],
  results: [{check_id: 'R1', checked: 10, message: '', policy_key: 'AUTH-001', status: 'fail'}],
  started_at: 2000,
}

function statusRoute(current = policy, latest: null | typeof run = run): void {
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
      for (const text of ['Check ID', 'Description', 'Object kinds', 'Required params', 'stack.statement_forbidden', 'query, function', 'statements: string[]', 'Check authentication tables.'])
        expect(result.stdout).to.contain(text)
      expect(result.stdout).not.to.contain('"required":')
      expect(result.stdout).not.to.contain('scope: object')
    })
  }

  it('catalogue JSON retains the complete native schemas', async () => {
    globalThis.fetch = async () => json(catalogue)
    const result = await command('policy catalogue', ['-o', 'json'])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal(catalogue)
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
    for (const verbose of [false, true]) {
      for (const output of ['summary', 'json']) {
        it(`${action} folds traces in ${output}, verbose=${verbose}`, async () => {
          globalThis.fetch = async () => json(backendError, 400)
          const result = await command(action, ['-o', output, ...(verbose ? ['-v'] : [])])
          expect(result.error).to.exist
          expect(result.error?.message).to.contain('ERROR_CODE_SYNTAX_ERROR').and.to.contain('Invalid block: enforcement')
          for (const text of ['21', '2', 'R1']) expect(result.error?.message).to.contain(text)
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
    expect(result.stdout).to.contain('draft; not evaluated  0 findings').and.not.to.contain('OLD ERROR')
    expect(process.exitCode ?? 0).to.equal(0)
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
