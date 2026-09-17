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

  it('sends -m as the version message and names the version it published', async () => {
    fixture.route((url, method) =>
      url.pathname.endsWith('/parse')
        ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET'
          ? json([{id: 7, key: 'AUTH-001'}])
          : json({id: 7, key: 'AUTH-001', unchanged: false, version: 10}),
    )
    const result = await runCommand(['policy', 'publish', '--file', policyFile, '-m', '"Tightened the scope"'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(fixture.calls[2].body!)).to.deep.equal({data: {source}, message: 'Tightened the scope'})
    expect(result.stdout).to.contain('Published AUTH-001 (Version 10) to workspace 1 (feature).')
  })

  it('reports a save the platform found identical as no change, and keeps JSON faithful', async () => {
    const stored = {id: 7, key: 'AUTH-001', unchanged: true, version: 9}
    fixture.route((url, method) =>
      url.pathname.endsWith('/parse')
        ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET'
          ? json([{id: 7, key: 'AUTH-001'}])
          : json(stored),
    )
    const summary = await runCommand(['policy', 'publish', '--file', policyFile], fixture.config)
    expect(summary.error).to.equal(undefined)
    expect(summary.stdout).to.contain('No changes to AUTH-001 (Version 9) in workspace 1 (feature).')
    // No `-m`, so nothing is sent; `unchanged` survives verbatim in JSON.
    expect(JSON.parse(fixture.calls[2].body!)).to.deep.equal({data: {source}})
    const asJson = await runCommand(['policy', 'publish', '--file', policyFile, '-o', 'json'], fixture.config)
    expect(JSON.parse(asJson.stdout)).to.deep.equal(stored)
  })

  it('still publishes against an instance that reports no version', async () => {
    fixture.route((url, method) =>
      url.pathname.endsWith('/parse')
        ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET'
          ? json([])
          : json({id: 7, key: 'AUTH-001'}),
    )
    const result = await runCommand(['policy', 'publish', '--file', policyFile], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[2].method).to.equal('POST')
    expect(result.stdout).to.contain('Published AUTH-001 to workspace 1 (feature).')
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

  it('status trusts the version the run recorded over the policy timestamp', async () => {
    const results = [{check_id: 'R1', checked: 1, policy_key: 'AUTH-001', status: 'pass'}]
    const policy = {id: 1, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}], updated_at: 2000, version: 4}
    // The policy row is newer than the run, but it is the same definition the run evaluated.
    fixture.route(url => (url.pathname.endsWith('/run')
      ? json({items: [{policies: [{key: 'AUTH-001', version: 4}], results, started_at: 1000}]})
      : json({items: [policy]})))
    const current = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
    expect(JSON.parse(current.stdout).status[0]).to.include({stale: false, status: 'pass'})

    fixture.route(url => (url.pathname.endsWith('/run')
      ? json({items: [{policies: [{key: 'AUTH-001', version: 3}], results, started_at: 1000}]})
      : json({items: [policy]})))
    const outdated = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
    expect(JSON.parse(outdated.stdout).status[0]).to.include({stale: true, status: 'outdated; evaluate again'})
  })

  it('delete resolves a key, confirms nothing with --force, and reports what it removed', async () => {
    fixture.route((url, method) =>
      method === 'DELETE' ? new Response(null, {status: 204}) : json([{id: 7, key: 'AUTH-001', version: 3}]))
    const result = await runCommand(['policy', 'delete', 'AUTH-001', '--force'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[1].method).to.equal('DELETE')
    expect(fixture.calls[1].url.pathname).to.equal('/api:meta/workspace/1/policy/7')
    expect(fixture.calls[1].url.searchParams.get('branch')).to.equal('feature')
    expect(result.stdout).to.contain('Deleted policy AUTH-001 (ID: 7) from workspace 1 (feature).')
  })

  it('delete accepts an ID and stays a faithful JSON passthrough', async () => {
    fixture.route((url, method) => (method === 'DELETE' ? json({}) : json([{id: 7, key: 'AUTH-001'}])))
    const result = await runCommand(['policy', 'delete', '7', '-f', '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal({deleted: true, id: 7, key: 'AUTH-001'})
  })

  it('delete names the branch contents instead of sending an unresolved key', async () => {
    fixture.route(() => json([{id: 7, key: 'AUTH-001'}, {id: 8, key: 'SEC-100'}]))
    const result = await runCommand(['policy', 'delete', 'AUTH-002', '--force'], fixture.config)
    expect(result.error?.message).to.contain('No policy "AUTH-002" on workspace 1 (feature).')
    expect(result.error?.message).to.contain('This branch has: AUTH-001, SEC-100.')
    // Nothing was deleted: only the list request went out.
    expect(fixture.calls.every((call) => call.method === 'GET')).to.equal(true)
  })

  const run = {
    findings: [{id: 'F1', message: 'no auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', policy_title: 'Auth', rule_id: 'AUTH-001.R1', severity: 'high'}],
    finished_at: '2026-09-17T22:42:00.980Z',
    id: 1674,
    objects_checked: 23,
    policies: [{key: 'AUTH-001', rules: [{check: 'query.auth_required', id: 'AUTH-001.R1', label: 'Endpoints declare authentication', params: {public_tag: 'public'}}], statement: 'Every endpoint declares auth.'}],
    results: [{check_id: 'AUTH-001.R1', checked: 23, policy_key: 'AUTH-001', status: 'fail'}],
    started_at: '2026-09-17T22:42:00.903Z',
    status: 'fail',
    trigger: 'push',
  }

  it('runs lists the retained runs newest first and says how to read one', async () => {
    fixture.route(() => json({items: [run, {...run, findings: [], id: 1673, status: 'pass', trigger: 'manual'}]}))
    const result = await runCommand(['policy', 'runs', '--limit', '5'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/policy/run')
    expect(fixture.calls[0].url.searchParams.get('limit')).to.equal('5')
    expect(result.stdout).to.contain('1674  fail    1 findings    23 objects  push     2026-09-17T22:42:00.903Z')
    expect(result.stdout).to.contain('1673  pass    0 findings    23 objects  manual   2026-09-17T22:42:00.903Z')
    expect(result.stdout).to.contain('xano policy runs <id> --run-detail')
  })

  it('runs reads one older run by id, with its findings and what it recorded', async () => {
    fixture.route(() => json(run))
    const result = await runCommand(['policy', 'runs', '1674', '--run-detail'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/policy/run/1674')
    expect(result.stdout).to.contain('Run 1674  fail  push  2026-09-17T22:42:00.903Z → 2026-09-17T22:42:00.980Z  23 objects checked')
    // The rule id leads the finding line, because a check label is shared by every rule using it.
    expect(result.stdout).to.contain('AUTH-001.R1  Endpoints declare authentication [high] (Auth)  query GET /x: no auth')
    expect(result.stdout).to.contain('Run 1674 as recorded')
    expect(result.stdout).to.contain('settings: public_tag=public')
  })

  it('runs refuses a non-numeric run id and keeps JSON faithful', async () => {
    fixture.route(() => json(run))
    const bad = await runCommand(['policy', 'runs', 'latest'], fixture.config)
    expect(bad.error?.message).to.contain('"latest" is not a run ID')
    expect(fixture.calls).to.have.length(0)
    fixture.route(() => json(run))
    const asJson = await runCommand(['policy', 'runs', '1674', '-o', 'json'], fixture.config)
    expect(JSON.parse(asJson.stdout).id).to.equal(1674)
  })

  it('push names the policy documents it sent, marks blocking findings and points at the next command', async () => {
    const findings = [
      {id: 'F1', message: 'no auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'SEC-100', rule_id: 'SEC-100.R1'},
      {id: 'F2', message: 'stale tag', object: {name: 'account', type: 'table'}, policy_key: 'SEC-100', rule_id: 'SEC-100.R2'},
    ]
    const policyCheck = {blocking: true, blocking_findings: [findings[0]], findings, status: 'fail'}
    fixture.route(() => json({guid_map: [], policy_check: policyCheck}))
    const result = await runCommand(
      ['workspace', 'push', '-d', path.join(fixture.directory, 'policies'), '--force'],
      fixture.config,
    )
    expect(result.error).to.equal(undefined)
    // `--force` skips the preview, so created-vs-updated is unknowable; naming them is not.
    expect(result.stdout).to.contain('Policy documents sent (1): AUTH-001')
    expect(result.stdout).to.contain('Blocking findings (1) — these stop the merge:')
    expect(result.stdout).to.contain('SEC-100.R1 (SEC-100)  query GET /x: no auth')
    expect(result.stdout).to.contain('Advisory findings (1) — reported, not blocking:')
    expect(result.stdout).to.contain('SEC-100.R2 (SEC-100)  table account: stale tag')
    expect(result.stdout).to.contain('Next: `xano policy status --run-detail`')
    expect(process.exitCode).to.equal(2)
  })

  it('redacts the active credential if an API error reflects it', async () => {
    fixture.route(() => json({message: 'Invalid credential test-token'}, 403))
    const result = await runCommand(['policy', 'list'], fixture.config)
    expect(result.error?.message).to.contain('[REDACTED]')
    expect(result.error?.message).not.to.contain('test-token')
  })
})
