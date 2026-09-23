/* eslint-disable unicorn/filename-case -- CLAUDE.md requires underscore filenames. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy_fixture.js'

const source = 'policy AUTH-001 { title = "Auth" }'
const actions = ['catalogue', 'list', 'parse', 'publish', 'evaluate', 'status']
const results = [
  {check_id: 'R1', checked: 0, policy_key: 'AUTH-001', status: 'fail'},
  {check_id: 'R2', checked: 0, message: 'unknown check query.removed', policy_key: 'AUTH-001', status: 'error'},
  {check_id: 'R3', checked: 0, message: 'inventory unavailable', policy_key: 'AUTH-001', status: 'error'},
]

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

  const transports: Array<[{body?: string; status?: number; transport?: boolean}, number]> = [
    [{body: '{"message":"Access Denied"}', status: 403}, 1],
    [{body: '{"message":"Unavailable"}', status: 503}, 1],
    [{transport: true}, 1],
    [{body: '<html>Maintenance</html>'}, 1],
    [{body: '{"policy_check":{"blocking":true,"status":"fail"}}'}, 2],
    [{body: '{"policy_check":{"blocking":false,"status":"fail"}}'}, 0],
  ]
  for (const [transport, code] of transports) {
    it(`evaluate exits ${code} for ${JSON.stringify(transport)}`, async () => {
      fixture.route(() => {
        if (transport.transport) throw new Error('connection refused')
        return new Response(transport.body, {status: transport.status ?? 200})
      })
      const result = await run('evaluate', ['-v', '-o', 'json'])
      if (code === 1) {
        expectOperationalError(result)
        // `-o json` keeps its promise on the way out too: the failure is an object, not silence.
        expect(JSON.parse(result.stdout).error).to.include({exit: 1})
        expect(JSON.parse(result.stdout).error.message).to.be.a('string').and.not.to.equal('')
      } else {
        expect(result.error).to.equal(undefined)
        expect(JSON.parse(result.stdout)).to.have.property('policy_check')
        expect(process.exitCode ?? 0).to.equal(code)
      }

      expect(result.stderr).to.contain('→ POST')
    })
  }

  for (const action of actions) {
    it(`${action}: missing credentials exit 1`, async () => {
      process.env.XANO_CONFIG = path.join(fixture.directory, 'missing.yaml')
      fixture.route(() => { throw new Error('unexpected request') })
      expectOperationalError(await run(action))
      expect(fixture.calls).to.have.length(0)
    })
    for (const status of [400, 401, 403, 500, 503]) {
      it(`${action}: HTTP ${status} exits 1, redacted, with guidance only where a permission answered`, async () => {
        fixture.route(() => json({message: 'Access Denied test-token'}, status))
        const result = await run(action)
        expectOperationalError(result)
        expect(result.error?.message).to.contain('[REDACTED]')
        expect(result.error?.message).not.to.contain('test-token')
        if (status === 403) {
          // The generic refusal is the scope gate (token scope or the role's permission).
          expect(result.error?.message).to.contain('workspace:policy')
          expect(result.error?.message).to.contain('Reissue')
          expect(result.error?.message).to.contain('Instance settings → Metadata API & MCP Server → Manage Access Tokens')
          expect(result.error?.message).to.contain('Workspace Policies')
        } else if (status === 401) {
          expect(result.error?.message).to.contain('missing, expired or revoked')
        } else {
          expect(result.error?.message).not.to.contain('Reissue')
        }
      })
    }

    it(`${action}: a role refusal is not blamed on the token`, async () => {
      fixture.route(() => json({message: 'Policy changes require the admin role.'}, 403))
      const result = await run(action)
      expectOperationalError(result)
      expect(result.error?.message).to.contain('Policy changes require the admin role.')
      expect(result.error?.message).to.contain('requires the admin role on the instance')
      expect(result.error?.message).to.contain('reissuing it will not help')
      expect(result.error?.message).not.to.contain('Manage Access Tokens')
    })
    it(`${action}: the feature being off is not blamed on the token or the role`, async () => {
      fixture.route(() => json({message: 'Policies are not enabled on this instance.'}, 403))
      const result = await run(action)
      expectOperationalError(result)
      expect(result.error?.message).to.contain('Policies are not enabled on this instance.')
      expect(result.error?.message).to.contain('turned off for this instance')
      expect(result.error?.message).not.to.contain('Manage Access Tokens')
      expect(result.error?.message).not.to.contain('admin role')
    })

    it(`${action}: transport failures exit 1`, async () => {
      fixture.route(() => { throw new Error('connection refused') })
      const result = await run(action)
      expectOperationalError(result)
      expect(result.error?.message).to.contain('connection refused')
    })
    it(`${action}: invalid JSON exits 1`, async () => {
      fixture.route(() => new Response('<html>Maintenance</html>'))
      expectOperationalError(await run(action))
    })
  }

  for (const action of ['parse', 'publish']) {
    it(`${action}: unreadable source exits 1 before a request`, async () => {
      fixture.route(() => { throw new Error('unexpected request') })
      const result = await runCommand(['policy', action, '--file', path.join(fixture.directory, 'missing.xs')], fixture.config)
      expectOperationalError(result)
      expect(fixture.calls).to.have.length(0)
    })
  }

  for (const verbose of ['flag', 'env']) {
    for (const [check, code] of [[{blocking: false, status: 'pass'}, 0], [{blocking: true, status: 'fail'}, 2]] as const) {
      it(`JSON stays a single document with verbose ${verbose} and exit ${code}`, async () => {
        fixture.route(() => json({policy_check: check}))
        if (verbose === 'env') process.env.XANO_VERBOSE = 'true'
        const result = await run('evaluate', ['-o', 'json', ...(verbose === 'flag' ? ['-v'] : [])])
        expect(result.error).to.equal(undefined)
        expect(JSON.parse(result.stdout)).to.deep.equal({policy_check: check})
        expect(result.stderr).to.contain('→ POST').and.to.contain('← 200')
        expect(process.exitCode ?? 0).to.equal(code)
      })
    }
  }

  for (const saved of [null, {}, {success: true}, {key: 'AUTH-001'}, {id: 7}, {id: 0, key: 'AUTH-001'}]) {
    for (const output of ['summary', 'json']) {
      it(`publish rejects an indeterminate save ${JSON.stringify(saved)} in ${output}`, async () => {
        fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
          : method === 'GET' ? json([]) : json(saved))
        const result = await run('publish', ['-o', output])
        expectOperationalError(result)
        expect(result.error?.message).to.contain('indeterminate')
        expect(fixture.calls).to.have.length(3)
      })
    }
  }

  it('publish confirms a saved policy with an id and key', async () => {
    fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
      : method === 'GET' ? json([]) : json({id: 7, key: 'AUTH-001'}))
    const result = await run('publish')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('Published AUTH-001')
  })

  function statusRoute(): void {
    fixture.route(url => url.pathname.endsWith('/run') ? json({items: [{results}]})
      : json([{id: 7, key: 'AUTH-001', lifecycle: 'active', rules: results.map(result => ({id: result.check_id}))}]))
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
        : method === 'GET' ? json([]) : json({id: 7, key: 'AUTH-001'}))
      const result = await run('publish', flags)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.length(3)
      expect(fixture.calls.every(call => call.url.searchParams.get('branch') === '')).to.equal(true)
    })
  }

  it('omitted branch still selects the profile branch', async () => {
    fixture.route(() => json([]))
    expect((await run('list')).error).to.equal(undefined)
    expect(fixture.calls[0].url.searchParams.get('branch')).to.equal('feature')
  })
})
