/* eslint-disable camelcase, n/no-unsupported-features/node-builtins -- Native fetch is available on the supported Node 20 runtime; API field names are preserved. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

const source = 'policy AUTH-001 {\n title = "Auth"\n}\n'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status})

describe('official policy commands and workspace carriage', () => {
  let directory: string
  let config: string | undefined
  let profile: string | undefined
  let fetch: typeof globalThis.fetch
  let calls: Array<{body?: string; method: string; url: URL}>

  before(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-policy-cli-'))
    fs.writeFileSync(
      path.join(directory, 'credentials.yaml'),
      'profiles:\n  default:\n    instance_origin: https://test.example.com\n    access_token: test-token\n    workspace: 1\n    branch: feature\ndefault: default\n',
    )
    fs.mkdirSync(path.join(directory, 'policies'))
    fs.writeFileSync(path.join(directory, 'policies', 'AUTH-001.xs'), source)
    config = process.env.XANO_CONFIG
    profile = process.env.XANO_PROFILE
    process.env.XANO_CONFIG = path.join(directory, 'credentials.yaml')
    delete process.env.XANO_PROFILE
  })

  after(() => {
    if (config === undefined) delete process.env.XANO_CONFIG
    else process.env.XANO_CONFIG = config
    if (profile !== undefined) process.env.XANO_PROFILE = profile
    fs.rmSync(directory, {force: true, recursive: true})
  })

  beforeEach(() => {
    fetch = globalThis.fetch
    calls = []
  })

  afterEach(() => {
    globalThis.fetch = fetch
    process.exitCode = undefined
  })
  function route(handler: (url: URL, method: string, body?: string) => Response): void {
    globalThis.fetch = (async (input, options) => {
      const url = new URL(String(input))
      const method = options?.method ?? 'GET'
      const body = options?.body as string | undefined
      calls.push({body, method, url})
      return handler(url, method, body)
    }) as typeof globalThis.fetch
  }

  it('parses source only through the native platform endpoint', async () => {
    route(() => json({policy: {key: 'AUTH-001'}, source}))
    const result = await runCommand([
      'policy',
      'parse',
      '--file',
      path.join(directory, 'policies', 'AUTH-001.xs'),
      '-o',
      'json',
    ])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).source).to.equal(source)
    expect(calls[0].url.pathname).to.equal('/api:meta/workspace/1/policy/parse')
    expect(JSON.parse(calls[0].body!)).to.deep.equal({source})
  })

  it('publishes source without mixing parsed structured fields into the save', async () => {
    route((url, method) =>
      url.pathname.endsWith('/parse')
        ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET'
          ? json([{id: 7, key: 'AUTH-001'}])
          : json({id: 7, key: 'AUTH-001'}),
    )
    const result = await runCommand([
      'policy',
      'publish',
      '--file',
      path.join(directory, 'policies', 'AUTH-001.xs'),
      '-o',
      'json',
    ])
    expect(result.error).to.equal(undefined)
    expect(calls[2].method).to.equal('PUT')
    expect(calls[2].url.searchParams.get('branch')).to.equal('feature')
    expect(JSON.parse(calls[2].body!)).to.deep.equal({data: {source}})
  })

  it('does not save when native validation rejects source', async () => {
    route(() => json({message: 'guard is reserved'}, 400))
    const result = await runCommand(['policy', 'publish', '--file', path.join(directory, 'policies', 'AUTH-001.xs')])
    expect(result.error).to.exist
    expect(calls).to.have.length(1)
  })
  for (const [check, code] of [
    [{blocking: true, status: 'fail'}, 2],
    [{blocking: false, status: 'fail'}, 0],
    [undefined, 1],
  ] as const) {
    it(`evaluate retains JSON and uses exit ${code} for ${JSON.stringify(check)}`, async () => {
      route(() => json({findings: [], id: 12, policy_check: check}))
      const result = await runCommand(['policy', 'evaluate', '-o', 'json'])
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).id).to.equal(12)
      expect(process.exitCode ?? 0).to.equal(code)
    })
  }

  it('pull requests policies and preserves stable filenames', async () => {
    route((url) => (url.pathname.endsWith('/knowledge/sync') ? json([]) : new Response(source)))
    const output = path.join(directory, 'pull')
    const result = await runCommand(['workspace', 'pull', '-d', output])
    expect(result.error).to.equal(undefined)
    expect(calls[0].url.searchParams.get('policy')).to.equal('true')
    expect(fs.readFileSync(path.join(output, 'policies', 'AUTH-001.xs'), 'utf8')).to.contain('policy AUTH-001')
  })

  it('push keeps gate JSON and exit2 after import without inserting policy GUIDs', async () => {
    const policyCheck = {blocking: true, findings: [{message: 'Missing auth', rule_id: 'R1'}], status: 'fail'}
    route(() => json({guid_map: [{guid: 'server-guid', name: 'AUTH-001', type: 'policy'}], policy_check: policyCheck}))
    const result = await runCommand([
      'workspace',
      'push',
      '-d',
      path.join(directory, 'policies'),
      '--force',
      '--guids',
      '-o',
      'json',
    ])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).policy_check).to.deep.equal(policyCheck)
    expect(JSON.parse(result.stdout).imported).to.equal(true)
    expect(process.exitCode).to.equal(2)
    expect(calls[0].body).to.contain('policy AUTH-001')
    expect(fs.readFileSync(path.join(directory, 'policies', 'AUTH-001.xs'), 'utf8')).to.equal(source)
  })
  for (const [results, expected] of [[[], 'not evaluated'], [[{check_id: 'R1', checked: 0, policy_key: 'AUTH-001', status: 'pass'}], 'no objects checked']] as const) {
    it(`status reports ${expected} without presenting coverage`, async () => {
      route(url => url.pathname.endsWith('/run') ? json({curPage: 1, items: [{results}], nextPage: null, prevPage: null}) : json([{id: 1, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}]}]))
      const result = await runCommand(['policy', 'status', '-o', 'json'])
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).status[0].status).to.equal(expected)
      expect(calls.every(call => call.method === 'GET')).to.equal(true)
    })
  }

  it('status treats an edit during evaluation as outdated', async () => {
    route(url => url.pathname.endsWith('/run')
      ? json({items: [{finished_at: 3000, results: [{check_id: 'R1', checked: 1, policy_key: 'AUTH-001', status: 'pass'}], started_at: 1000}]})
      : json({items: [{id: 1, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}], updated_at: 2000}]}))
    const result = await runCommand(['policy', 'status', '-o', 'json'])
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).status[0].status).to.equal('outdated; evaluate again')
  })

  it('redacts the active credential if an API error reflects it', async () => {
    route(() => json({message: 'Invalid credential test-token'}, 403))
    const result = await runCommand(['policy', 'list'])
    expect(result.error?.message).to.contain('[REDACTED]')
    expect(result.error?.message).not.to.contain('test-token')
  })

})
