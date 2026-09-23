import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

const source = 'policy AUTH-001 { title = "Auth" }'
const actions = ['catalogue', 'list', 'parse', 'publish', 'evaluate', 'status']
const results = [
  {check_id: 'R1', checked: 0, policy_key: 'AUTH-001', status: 'fail'},
  {check_id: 'R2', checked: 0, message: 'unknown check query.removed', policy_key: 'AUTH-001', status: 'error'},
  {check_id: 'R3', checked: 0, message: 'inventory unavailable', policy_key: 'AUTH-001', status: 'error'},
]
const saved = {id: 7, key: 'AUTH-001', unchanged: false, version: 1}

describe('policy failure contracts', () => {
  const fixture = policyFixture()

  function run(action: string, flags: string[] = []) {
    return runCommand(['policy', action, ...(['parse', 'publish'].includes(action)
      ? ['--file', path.join(fixture.directory, 'policy.xs')] : []), ...flags], fixture.config)
  }

  function expectOperationalError(result: Awaited<ReturnType<typeof run>>): void {
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.stdout).not.to.contain('Published')
  }

  for (const action of actions) {
    it(`${action}: a server error exits 1`, async () => {
      fixture.route(() => json({message: 'Unavailable'}, 503))
      const result = await run(action)
      expectOperationalError(result)
      expect(result.error?.message).to.contain('request failed (503): Unavailable')
    })
  }

  it('missing credentials exit 1 before any request', async () => {
    process.env.XANO_CONFIG = path.join(fixture.directory, 'missing.yaml')
    fixture.route(() => { throw new Error('unexpected request') })
    expectOperationalError(await run('list'))
    expect(fixture.calls).to.have.length(0)
  })

  for (const status of [400, 401, 403, 500]) {
    it(`HTTP ${status} exits 1, redacted, with guidance only where a permission answered`, async () => {
      fixture.route(() => json({message: 'Access Denied test-token'}, status))
      const result = await run('list')
      expectOperationalError(result)
      expect(result.error?.message).to.contain('[REDACTED]').and.not.to.contain('test-token')
      if (status === 403) {
        expect(result.error?.message).to.contain('`workspace:policy` permission')
          .and.to.contain('Instance settings → Metadata API & MCP Server → Manage Access Tokens')
      } else if (status === 401) {
        expect(result.error?.message).to.contain('missing, expired or revoked')
      } else {
        expect(result.error?.message).not.to.contain('Reissue')
      }
    })
  }

  it('a refused policy change is not blamed on the token', async () => {
    fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
      : method === 'GET' ? json({items: []}) : json({message: 'Policy changes require the workspace:policy permission.'}, 403))
    const result = await run('publish')
    expectOperationalError(result)
    expect(result.error?.message).to.contain('Policy changes require the workspace:policy permission.')
      .and.to.contain('reissuing it will not help')
      .and.not.to.contain('Manage Access Tokens')
      .and.not.to.contain('admin role')
  })

  it('the feature being off is not blamed on the token', async () => {
    fixture.route(() => json({message: 'Policies are not enabled on this instance.'}, 403))
    const result = await run('list')
    expectOperationalError(result)
    expect(result.error?.message).to.contain('turned off for this instance').and.not.to.contain('Manage Access Tokens')
  })

  it('transport failures exit 1', async () => {
    fixture.route(() => { throw new Error('connection refused') })
    const result = await run('list')
    expectOperationalError(result)
    expect(result.error?.message).to.contain('connection refused')
  })

  it('a body that is not JSON exits 1', async () => {
    fixture.route(() => new Response('<html>Maintenance</html>'))
    expectOperationalError(await run('list'))
  })

  it('unreadable source exits 1 before a request', async () => {
    fixture.route(() => { throw new Error('unexpected request') })
    const result = await runCommand(['policy', 'publish', '--file', path.join(fixture.directory, 'missing.xs')], fixture.config)
    expectOperationalError(result)
    expect(fixture.calls).to.have.length(0)
  })

  it('evaluate -o json reports a failure as JSON on stdout', async () => {
    fixture.route(() => json({message: 'Unavailable'}, 503))
    const result = await run('evaluate', ['-v', '-o', 'json'])
    expectOperationalError(result)
    expect(JSON.parse(result.stdout).error).to.include({exit: 1})
    expect(result.stderr).to.contain('→ POST')
  })

  for (const [verbose, check, code] of [['flag', {blocking: false, status: 'pass'}, 0], ['env', {blocking: true, status: 'fail'}, 2]] as const) {
    it(`evaluate JSON stays a single document with verbose ${verbose} and exit ${code}`, async () => {
      fixture.route(() => json({policy_check: check}))
      if (verbose === 'env') process.env.XANO_VERBOSE = 'true'
      const result = await run('evaluate', ['-o', 'json', ...(verbose === 'flag' ? ['-v'] : [])])
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout)).to.deep.equal({policy_check: check})
      expect(result.stderr).to.contain('→ POST').and.to.contain('← 200')
      expect(process.exitCode ?? 0).to.equal(code)
    })
  }

  it('publish refuses a save the platform did not return', async () => {
    fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
      : method === 'GET' ? json({items: []}) : json({}))
    const result = await run('publish')
    expectOperationalError(result)
    expect(result.error?.message).to.contain('did not return the saved policy')
  })

  function statusRoute(): void {
    fixture.route(url => url.pathname.endsWith('/run') ? json({items: [{results}]})
      : json({items: [{enforcement: 'mandatory', id: 7, key: 'AUTH-001', lifecycle: 'active', rules: results.map(result => ({id: result.check_id})), version: 1}]}))
  }

  it('status gives errors precedence over failed rules', async () => {
    statusRoute()
    const result = await run('status', ['-o', 'json'])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).status[0].status).to.equal('error')
  })

  for (const action of ['evaluate', 'status', 'push']) {
    it(`${action} summary prints every rule error before zero-object coverage`, async () => {
      if (action === 'status') statusRoute()
      else fixture.route(() => json({policy_check: {blocking: false, results, status: 'error'}}))
      const result = action === 'push'
        ? await runCommand(['workspace', 'push', '-d', fixture.directory, '--force', '--no-guids'], fixture.config)
        : await run(action)
      expect(result.error).to.equal(undefined)
      const coverage = result.stdout.indexOf('No objects checked;')
      for (const rule of results.filter(result => result.status === 'error')) {
        const error = result.stdout.indexOf(`${rule.check_id}`)
        expect(error).to.be.at.least(0)
        expect(result.stdout).to.contain(rule.message)
        expect(coverage).to.be.greaterThan(error)
      }

      if (action !== 'status') expect(result.stderr).to.contain('Policy check error: no message returned.')
      expect(process.exitCode ?? 0).to.equal(0)
    })
  }

  for (const flags of [['-b', '""'], ['--branch=']]) {
    it(`explicit empty branch ${flags.join(' ')} selects live throughout publish`, async () => {
      fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET' ? json({items: []}) : json(saved))
      const result = await run('publish', flags)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.length(3)
      expect(fixture.calls.every(call => call.url.searchParams.get('branch') === '')).to.equal(true)
    })
  }

  it('omitted branch still selects the profile branch', async () => {
    fixture.route(() => json({items: []}))
    expect((await run('list')).error).to.equal(undefined)
    expect(fixture.calls[0].url.searchParams.get('branch')).to.equal('feature')
  })
})
