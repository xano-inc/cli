/* eslint-disable camelcase, n/no-unsupported-features/node-builtins -- Preserve native API field names; native fetch is available on the supported Node 20 runtime. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy_fixture.js'

const source = 'policy AUTH-001 {\n title = "Auth"\n}\n'

describe('official policy commands and workspace carriage', () => {
  const fixture = policyFixture({profile: 'default', source})
  let policyFile: string

  before(() => {
    fs.mkdirSync(path.join(fixture.directory, 'policies'))
    policyFile = path.join(fixture.directory, 'policies', 'AUTH-001.xs')
    fs.writeFileSync(policyFile, source)
  })

  it('parses source only through the native platform endpoint', async () => {
    fixture.route(() => json({policy: {key: 'AUTH-001'}, source}))
    const result = await runCommand(['policy', 'parse', '--file', policyFile, '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).source).to.equal(source)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/policy/parse')
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({source})
  })

  it('publishes source without mixing parsed structured fields into the save', async () => {
    fixture.route((url, method) =>
      url.pathname.endsWith('/parse')
        ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET'
          ? json([{id: 7, key: 'AUTH-001'}])
          : json({id: 7, key: 'AUTH-001'}),
    )
    const result = await runCommand(['policy', 'publish', '--file', policyFile, '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[2].method).to.equal('PUT')
    expect(fixture.calls[2].url.searchParams.get('branch')).to.equal('feature')
    expect(JSON.parse(fixture.calls[2].body!)).to.deep.equal({data: {source}})
  })

  it('does not save when native validation rejects source', async () => {
    fixture.route(() => json({message: 'unknown check'}, 400))
    const result = await runCommand(['policy', 'publish', '--file', policyFile], fixture.config)
    expect(result.error).to.exist
    expect(fixture.calls).to.have.length(1)
  })
  for (const [check, code] of [
    [{blocking: true, status: 'fail'}, 2],
    [{blocking: false, status: 'fail'}, 0],
    [undefined, 1],
  ] as const) {
    it(`evaluate retains JSON and uses exit ${code} for ${JSON.stringify(check)}`, async () => {
      fixture.route(() => json({findings: [], id: 12, policy_check: check}))
      const result = await runCommand(['policy', 'evaluate', '-o', 'json'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).id).to.equal(12)
      expect(process.exitCode ?? 0).to.equal(code)
    })
  }

  it('pull writes exported policies to stable filenames', async () => {
    fixture.route((url) => (url.pathname.endsWith('/knowledge/sync') ? json([]) : new Response(source)))
    const output = path.join(fixture.directory, 'pull')
    const result = await runCommand(['workspace', 'pull', '-d', output], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fs.readFileSync(path.join(output, 'policies', 'AUTH-001.xs'), 'utf8')).to.contain('policy AUTH-001')
  })

  it('push keeps gate JSON and exit2 after import without inserting policy GUIDs', async () => {
    const policyCheck = {blocking: true, findings: [{message: 'Missing auth', rule_id: 'R1'}], status: 'fail'}
    fixture.route(() => json({guid_map: [{guid: 'server-guid', name: 'AUTH-001', type: 'policy'}], policy_check: policyCheck}))
    const result = await runCommand(
      ['workspace', 'push', '-d', path.join(fixture.directory, 'policies'), '--force', '--guids', '-o', 'json'],
      fixture.config,
    )
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).policy_check).to.deep.equal(policyCheck)
    expect(JSON.parse(result.stdout).imported).to.equal(true)
    expect(process.exitCode).to.equal(2)
    expect(fixture.calls[0].body).to.contain('policy AUTH-001')
    expect(fs.readFileSync(policyFile, 'utf8')).to.equal(source)
  })
  for (const [results, expected] of [[[], 'not evaluated'], [[{check_id: 'R1', checked: 0, policy_key: 'AUTH-001', status: 'pass'}], 'no objects checked']] as const) {
    it(`status reports ${expected} without presenting coverage`, async () => {
      fixture.route(url => url.pathname.endsWith('/run') ? json({curPage: 1, items: [{results}], nextPage: null, prevPage: null}) : json([{id: 1, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}]}]))
      const result = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).status[0].status).to.equal(expected)
      expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
      expect(fixture.calls[1].url.searchParams.get('limit')).to.equal('1')
    })
  }

  it('status treats an edit during evaluation as outdated', async () => {
    fixture.route(url => url.pathname.endsWith('/run')
      ? json({items: [{finished_at: 3000, results: [{check_id: 'R1', checked: 1, policy_key: 'AUTH-001', status: 'pass'}], started_at: 1000}]})
      : json({items: [{id: 1, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}], updated_at: 2000}]}))
    const result = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout).status[0].status).to.equal('outdated; evaluate again')
  })

  it('redacts the active credential if an API error reflects it', async () => {
    fixture.route(() => json({message: 'Invalid credential test-token'}, 403))
    const result = await runCommand(['policy', 'list'], fixture.config)
    expect(result.error?.message).to.contain('[REDACTED]')
    expect(result.error?.message).not.to.contain('test-token')
  })
})
