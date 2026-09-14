/* eslint-disable camelcase, n/no-unsupported-features/node-builtins, unicorn/filename-case -- Preserve native API fields; fetch is supported by the CLI runtime; CLAUDE.md requires underscore filenames. */
import {Config} from '@oclif/core'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {spawnSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

const source = 'policy AUTH-001 { title = "Auth" }'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status})
const actions = ['catalogue', 'list', 'parse', 'publish', 'evaluate', 'status']
const results = [
  {check_id: 'R1', checked: 0, policy_key: 'AUTH-001', status: 'fail'},
  {check_id: 'R2', checked: 0, message: 'unknown check query.removed', policy_key: 'AUTH-001', status: 'error'},
  {check_id: 'R3', checked: 0, message: 'inventory unavailable', policy_key: 'AUTH-001', status: 'error'},
]

describe('policy failure contracts', () => {
  let directory: string
  let config: Config
  let originalFetch: typeof globalThis.fetch
  let environment: NodeJS.ProcessEnv
  let calls: URL[]

  before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-policy-failures-'))
    fs.writeFileSync(path.join(directory, 'policy.xs'), source)
    fs.writeFileSync(path.join(directory, 'credentials.yaml'),
      'profiles:\n  fixture:\n    instance_origin: https://test.example.com\n    access_token: test-token\n    workspace: 1\n    branch: feature\ndefault: fixture\n')
    config = await Config.load({root: process.cwd()})
    // Skip the npm update check: this suite is entirely offline.
    config.version = '1.2.0-beta.test'
    fs.writeFileSync(path.join(directory, 'transport.mjs'), `
      globalThis.fetch = async () => {
        const fixture = JSON.parse(process.env.F2_RESPONSE);
        if (fixture.transport) throw new Error('connection refused');
        return new Response(fixture.body, {status: fixture.status ?? 200});
      };
    `)
  })

  after(() => fs.rmSync(directory, {force: true, recursive: true}))

  beforeEach(() => {
    environment = {...process.env}
    originalFetch = globalThis.fetch
    process.env.XANO_CONFIG = path.join(directory, 'credentials.yaml')
    process.env.XANO_PROFILE = 'fixture'
    delete process.env.XANO_VERBOSE
    delete process.env.XANO_FORCE_UPDATE_CHECK
    calls = []
  })

  afterEach(() => {
    process.env = environment
    globalThis.fetch = originalFetch
    process.exitCode = undefined
  })

  function route(handler: (url: URL, method: string) => Response): void {
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input))
      calls.push(url)
      return handler(url, options?.method ?? 'GET')
    }
  }

  function run(action: string, flags: string[] = []) {
    return runCommand(['policy', action, ...(['parse', 'publish'].includes(action)
      ? ['--file', path.join(directory, 'policy.xs')] : []), ...flags], config)
  }

  function expectOperationalError(result: Awaited<ReturnType<typeof run>>): void {
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.stdout).not.to.contain('Published')
  }

  for (const [fixture, code] of [
    [{body: '{"message":"Access Denied"}', status: 403}, 1],
    [{body: '{"message":"Unavailable"}', status: 503}, 1],
    [{transport: true}, 1],
    [{body: '<html>Maintenance</html>'}, 1],
    [{body: '{"policy_check":{"blocking":true,"status":"fail"}}'}, 2],
    [{body: '{"policy_check":{"blocking":false,"status":"fail"}}'}, 0],
  ] as const) {
    it(`CLI process exits ${code} for ${JSON.stringify(fixture)}`, () => {
      const result = spawnSync(process.execPath,
        ['--import', path.join(directory, 'transport.mjs'), 'bin/run.js', 'policy', 'evaluate', '-v', '-o', 'json'], {
          encoding: 'utf8',
          env: {...process.env, F2_RESPONSE: JSON.stringify(fixture), npm_config_offline: 'true'},
          timeout: 10_000,
        })
      expect(result.error).to.equal(undefined)
      expect(result.status).to.equal(code)
      if (code === 1) {expect(result.stdout).to.equal('')}
      else {expect(JSON.parse(result.stdout)).to.have.property('policy_check')}

      expect(result.stderr).to.contain('→ POST')
    })
  }

  for (const action of actions) {
    it(`${action}: missing credentials exit 1`, async () => {
      process.env.XANO_CONFIG = path.join(directory, 'missing.yaml')
      route(() => { throw new Error('unexpected request') })
      expectOperationalError(await run(action))
      expect(calls).to.have.length(0)
    })
    for (const status of [400, 401, 403, 500, 503]) {
      it(`${action}: HTTP ${status} exits 1 with actionable policy scope guidance for 403`, async () => {
        route(() => json({message: 'Access Denied test-token'}, status))
        const result = await run(action)
        expectOperationalError(result)
        expect(result.error?.message).to.contain('[REDACTED]')
        expect(result.error?.message).not.to.contain('test-token')
        if (status === 403) {
          expect(result.error?.message).to.contain('workspace:policy')
          expect(result.error?.message).to.contain('Reissue')
          expect(result.error?.message).to.contain('Instance settings → Metadata API & MCP Server → Manage Access Tokens')
        }
      })
    }

    it(`${action}: transport failures exit 1`, async () => {
      route(() => { throw new Error('connection refused') })
      const result = await run(action)
      expectOperationalError(result)
      expect(result.error?.message).to.contain('connection refused')
    })
    it(`${action}: invalid JSON exits 1`, async () => {
      route(() => new Response('<html>Maintenance</html>'))
      expectOperationalError(await run(action))
    })
  }

  for (const action of ['parse', 'publish']) {
    it(`${action}: unreadable source exits 1 before a request`, async () => {
      route(() => { throw new Error('unexpected request') })
      const result = await runCommand(['policy', action, '--file', path.join(directory, 'missing.xs')], config)
      expectOperationalError(result)
      expect(calls).to.have.length(0)
    })
  }

  for (const verbose of ['flag', 'env']) {
    for (const [check, code] of [[{blocking: false, status: 'pass'}, 0], [{blocking: true, status: 'fail'}, 2]] as const) {
      it(`JSON stays a single document with verbose ${verbose} and exit ${code}`, async () => {
        route(() => json({policy_check: check}))
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
        route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
          : method === 'GET' ? json([]) : json(saved))
        const result = await run('publish', ['-o', output])
        expectOperationalError(result)
        expect(result.error?.message).to.contain('indeterminate')
        expect(calls).to.have.length(3)
      })
    }
  }

  it('publish confirms a saved policy with an id and key', async () => {
    route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
      : method === 'GET' ? json([]) : json({id: 7, key: 'AUTH-001'}))
    const result = await run('publish')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('Published AUTH-001')
  })

  function statusRoute(): void {
    route(url => url.pathname.endsWith('/run') ? json({items: [{results}]})
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
      else route(() => json({policy_check: {blocking: false, results, status: 'error'}}))
      const result = action === 'push'
        ? await runCommand(['workspace', 'push', '-d', directory, '--force', '--no-guids'], config)
        : await run(action)
      expect(result.error).to.equal(undefined)
      const coverage = result.stdout.indexOf('No objects checked;')
      for (const rule of results.filter(result => result.status === 'error')) {
        const error = result.stdout.indexOf(`${rule.check_id}`)
        expect(error).to.be.at.least(0)
        expect(result.stdout).to.contain(rule.message)
        expect(coverage).to.be.greaterThan(error)
      }

      expect(process.exitCode ?? 0).to.equal(action === 'status' ? 0 : 1)
    })
  }

  for (const flags of [['-b', '""'], ['--branch=']]) {
    it(`explicit empty branch ${flags.join(' ')} selects live throughout publish`, async () => {
      route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET' ? json([]) : json({id: 7, key: 'AUTH-001'}))
      const result = await run('publish', flags)
      expect(result.error).to.equal(undefined)
      expect(calls).to.have.length(3)
      expect(calls.every(url => url.searchParams.get('branch') === '')).to.equal(true)
    })
  }

  it('omitted branch still selects the profile branch', async () => {
    route(() => json([]))
    expect((await run('list')).error).to.equal(undefined)
    expect(calls[0].searchParams.get('branch')).to.equal('feature')
  })
})
