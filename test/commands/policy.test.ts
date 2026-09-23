import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

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
          ? json({items: [{id: 7, key: 'AUTH-001'}]})
          : json({id: 7, key: 'AUTH-001', version: 1}),
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
          ? json({items: [{id: 7, key: 'AUTH-001'}]})
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
          ? json({items: [{id: 7, key: 'AUTH-001'}]})
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

  it('does not save when native validation rejects source, and prints the refusal', async () => {
    const message = 'rule[0]: "query.removed" is not a policy check. GET workspace/{workspace_id}/policy/check lists every check id.'
    fixture.route((url) => url.pathname.endsWith('/parse') ? json({code: 'ERROR_CODE_BAD_REQUEST', message}, 400) : json({items: []}))
    const result = await runCommand(['policy', 'publish', '--file', policyFile], fixture.config)
    expect(result.error?.message).to.equal(`Policy request failed (400): ERROR_CODE_BAD_REQUEST: ${message}`)
    expect(fixture.calls.filter((call) => ['POST', 'PUT'].includes(call.method) && !call.url.pathname.endsWith('/parse'))).to.deep.equal([])
  })
  for (const [check, code, warning] of [
    [{blocking: false, status: 'pass'}, 0, null],
    [{blocking: true, status: 'fail'}, 2, null],
    [{blocking: false, status: 'fail'}, 0, null],
    [{blocking: false, message: 'No active policies on this branch.', status: 'not_applicable'}, 0, null],
    [{blocking: false, message: 'Policies are not enabled.', status: 'disabled'}, 0, 'Policy check disabled: Policies are not enabled.'],
    [{blocking: false, message: 'This credential cannot read policies.', status: 'forbidden'}, 0, 'Policy check forbidden: This credential cannot read policies.'],
    [{blocking: false, message: 'Evaluation is unavailable.', status: 'unavailable'}, 0, 'Policy check unavailable: Evaluation is unavailable.'],
    [{blocking: false, message: 'A check could not run.', status: 'error'}, 0, 'Policy check error: A check could not run.'],
    [{blocking: true, message: 'A check could not run.', status: 'error'}, 2, 'Policy check error: A check could not run.'],
    [undefined, 0, 'Policy check: no policy feedback returned.'],
  ] as const) {
    it(`evaluate retains JSON and uses exit ${code} for ${JSON.stringify(check)}`, async () => {
      fixture.route(() => json({findings: [], id: 12, policy_check: check}))
      const result = await runCommand(['policy', 'evaluate', '-o', 'json'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).id).to.equal(12)
      expect(process.exitCode ?? 0).to.equal(code)
      if (warning) expect(result.stderr).to.contain(warning)
      else expect(result.stderr).not.to.contain('Policy check')
    })
  }

  it('evaluate prints the server message under the headline of a branch with nothing to evaluate', async () => {
    fixture.route(() => json({id: 0, policy_check: {blocking: false, message: 'No active policies on this branch.', status: 'not_applicable'}}))
    const result = await runCommand(['policy', 'evaluate'], fixture.config)
    expect(result.stdout).to.contain('Policy check: not_applicable\nNo active policies on this branch.')
    expect(result.stderr).not.to.contain('Policy check')
  })

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
  const covered = {enforcement: 'mandatory', included: true, run_id: 1674, stale: false, version: 1}
  const active = {enforcement: 'mandatory', id: 1, key: 'AUTH-001', latest_run: covered, lifecycle: 'active', rules: [{id: 'R1'}], version: 1}
  for (const [results, expected] of [[[], 'not_evaluated'], [[{check_id: 'R1', checked: 0, policy_key: 'AUTH-001', status: 'pass'}], 'no_objects_checked']] as const) {
    it(`status reports ${expected} without presenting coverage`, async () => {
      fixture.route(url => url.pathname.includes('/run/') ? json({id: 1674, results}) : json({curPage: 1, items: [active], nextPage: null, prevPage: null}))
      const result = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).status[0].status).to.equal(expected)
      expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
    })
  }

  it('status reads the run the served latest_run names, and no run when there is none', async () => {
    const results = [{check_id: 'R1', checked: 1, policy_key: 'AUTH-001', status: 'pass'}]
    fixture.route(url => url.pathname.includes('/run/') ? json({id: 1674, results}) : json({items: [active]}))
    const current = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
    expect(fixture.calls.map(call => call.url.pathname)).to.deep.equal(['/api:meta/workspace/1/policy', '/api:meta/workspace/1/policy/run/1674'])
    expect(JSON.parse(current.stdout).status[0]).to.include({stale: false, status: 'pass'})

    fixture.calls.length = 0
    fixture.route(() => json({items: [{...active, latest_run: {...covered, enforcement: null, included: false, run_id: 0, version: null}}]}))
    const none = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
    expect(fixture.calls).to.have.length(1)
    expect(JSON.parse(none.stdout)).to.include({run: null})
    expect(JSON.parse(none.stdout).status[0]).to.include({status: 'not_evaluated'})
  })

  it('status takes staleness from the platform, whatever the run recorded', async () => {
    // The run recorded the same version the policy has, but the platform says the run is not evidence for it.
    const results = [{check_id: 'R1', checked: 1, policy_key: 'AUTH-001', status: 'pass'}]
    fixture.route(url => url.pathname.includes('/run/')
      ? json({id: 1674, policies: [{key: 'AUTH-001', version: 1}], results})
      : json({items: [{...active, latest_run: {...covered, stale: true, version: 0}}]}))
    const result = await runCommand(['policy', 'status', '-o', 'json'], fixture.config)
    expect(JSON.parse(result.stdout).status[0]).to.include({counted: false, stale: true, status: 'stale'})
  })

  describe('evaluate prints from the run it answers', () => {
    const findings = [
      {id: 'AUTH-001.R1:query:9', message: 'no auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1'},
      {id: 'SEC-100.R1:table:2', message: 'stale tag', object: {name: 'account', type: 'table'}, policy_key: 'SEC-100', rule_id: 'SEC-100.R1'},
    ]
    const evaluation = (overrides: Record<string, unknown> = {}) => ({
      findings,
      id: 1675,
      objects_checked: 4,
      policies: [],
      policy_check: {blocking: true, blocking_finding_ids: [findings[0].id], message: 'Active policies reported findings.', run_id: 1675, status: 'fail'},
      results: [{check_id: 'AUTH-001.R1', checked: 4, policy_key: 'AUTH-001', status: 'fail'}],
      status: 'fail',
      stored: true,
      ...overrides,
    })

    it('sends no body, and splits the findings by the ids the verdict names', async () => {
      fixture.route(() => json(evaluation()))
      const result = await runCommand(['policy', 'evaluate'], fixture.config)
      expect(fixture.calls[0].method).to.equal('POST')
      expect(fixture.calls[0].body).to.equal(undefined)
      expect(result.stdout).to.contain('Policy check: fail (blocking findings)\nActive policies reported findings.')
      expect(result.stdout).to.contain('Blocking findings (1) — these stop the merge:\n  AUTH-001.R1 (AUTH-001)  query GET /x: no auth')
      expect(result.stdout).to.contain('Advisory findings (1) — reported, not blocking:\n  SEC-100.R1 (SEC-100)  table account: stale tag')
      expect(result.stdout).not.to.contain('Not stored')
      expect(process.exitCode).to.equal(2)
    })

    it('says a run this credential could not record was not stored', async () => {
      fixture.route(() => json(evaluation({id: 0, policies: [{key: 'AUTH-001', rules: [{id: 'AUTH-001.R1'}]}], stored: false, trigger: 'manual'})))
      const result = await runCommand(['policy', 'evaluate', '--run-detail'], fixture.config)
      expect(result.stdout).to.contain('Not stored: this credential can run checks but not record runs')
      expect(result.stdout).to.contain('This evaluation, which was not stored (manual):').and.not.to.contain('Run 0')
    })

    it('says nothing about storage when there was nothing to evaluate', async () => {
      fixture.route(() => json({findings: [], id: 0, policies: [], policy_check: {blocking: false, message: 'No active policies on this branch; nothing was evaluated.', run_id: 0, status: 'not_applicable'}, results: [], stored: false}))
      const result = await runCommand(['policy', 'evaluate', '--run-detail'], fixture.config)
      expect(result.stdout).to.contain('Policy check: not_applicable').and.to.contain('No policies were evaluated.')
      expect(result.stdout).not.to.contain('Not stored').and.not.to.contain('Run 0')
    })
  })

  it('delete resolves a key, confirms nothing with --force, and reports what it removed', async () => {
    fixture.route((url, method) =>
      method === 'DELETE' ? new Response(null, {status: 204}) : json({items: [{id: 7, key: 'AUTH-001', version: 3}]}))
    const result = await runCommand(['policy', 'delete', 'AUTH-001', '--force'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[1].method).to.equal('DELETE')
    expect(fixture.calls[1].url.pathname).to.equal('/api:meta/workspace/1/policy/7')
    expect(fixture.calls[1].url.searchParams.get('branch')).to.equal('feature')
    expect(result.stdout).to.contain('Deleted policy AUTH-001 (ID: 7) from workspace 1 (feature).')
  })

  it('delete accepts an ID and stays a faithful JSON passthrough', async () => {
    fixture.route((url, method) => (method === 'DELETE' ? json({}) : json({items: [{id: 7, key: 'AUTH-001', version: 1}]})))
    const result = await runCommand(['policy', 'delete', '7', '-f', '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal({deleted: true, id: 7, key: 'AUTH-001'})
  })

  it('delete names the branch contents instead of sending an unresolved key', async () => {
    fixture.route(() => json({items: [{id: 7, key: 'AUTH-001'}, {id: 8, key: 'SEC-100'}]}))
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
    policies: [{key: 'AUTH-001', rules: [{check: 'query.auth_required', id: 'AUTH-001.R1', label: 'Endpoints declare authentication', params: {except_tags: ['public']}}], statement: 'Every endpoint declares auth.'}],
    results: [{check_id: 'AUTH-001.R1', checked: 23, policy_key: 'AUTH-001', status: 'fail'}],
    started_at: '2026-09-17T22:42:00.903Z',
    status: 'fail',
    trigger: 'push',
  }

  it('runs lists the retained runs newest first and says how to read one', async () => {
    const summary = {counts: {blocking: 1, errors: 0, findings: 1}, finished_at: run.finished_at, id: 1674, objects_checked: 23, started_at: run.started_at, status: 'fail', trigger: 'push'}
    fixture.route(() => json({items: [summary, {...summary, counts: {blocking: 0, errors: 0, findings: 0}, id: 1673, status: 'pass', trigger: 'manual'}]}))
    const result = await runCommand(['policy', 'runs', '--limit', '5'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/policy/run')
    expect(fixture.calls[0].url.searchParams.get('limit')).to.equal('5')
    expect(result.stdout).to.contain('1674  fail    1 findings    23 objects  push     2026-09-17T22:42:00.903Z')
    expect(result.stdout).to.contain('1673  pass    0 findings    23 objects  manual   2026-09-17T22:42:00.903Z')
    expect(result.stdout).to.contain('xano policy runs <id> --run-detail')
  })

  it('runs refuses a --limit beyond the twenty runs a branch retains, before any request', async () => {
    fixture.route(() => json({items: []}))
    const result = await runCommand(['policy', 'runs', '--limit', '21'], fixture.config)
    expect(result.error?.message).to.contain('20')
    expect(fixture.calls).to.have.length(0)
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
    expect(result.stdout).to.contain('settings: except_tags=[public]')
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

  it('push reports the policy documents it sent without claiming which changed', async () => {
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
    expect(result.stdout).to.contain('Pushed 1 documents to')
    expect(result.stdout).to.contain('Policy documents: 1 sent without a preview, so which of them changed is not known')
    expect(result.stdout).to.contain('Blocking findings (1) — these stop the merge:')
    expect(result.stdout).to.contain('SEC-100.R1 (SEC-100)  query GET /x: no auth')
    expect(result.stdout).to.contain('Advisory findings (1) — reported, not blocking:')
    expect(result.stdout).to.contain('SEC-100.R2 (SEC-100)  table account: stale tag')
    expect(result.stdout).to.contain('Next: `xano policy status --run-detail`')
    expect(process.exitCode).to.equal(2)
  })

  it('parses the file named as a positional, exactly as --file names it', async () => {
    fixture.route(() => json({policy: {key: 'AUTH-001'}, source}))
    const result = await runCommand(['policy', 'parse', policyFile], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.equal(`${source}\n`)
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({source})
  })

  it('refuses a file named twice with two different paths', async () => {
    fixture.route(() => { throw new Error('unexpected request') })
    const result = await runCommand(['policy', 'parse', policyFile, '--file', 'other.xs'], fixture.config)
    expect(result.error?.message).to.contain('Provide the file once: as a positional or as --file.')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(fixture.calls).to.have.length(0)
  })

  it('publishes the file named as a positional', async () => {
    fixture.route((url, method) =>
      url.pathname.endsWith('/parse')
        ? json({policy: {key: 'AUTH-001'}, source})
        : method === 'GET'
          ? json({items: []})
          : json({id: 7, key: 'AUTH-001', version: 1}),
    )
    const result = await runCommand(['policy', 'publish', policyFile], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[2].method).to.equal('POST')
    expect(result.stdout).to.contain('Published AUTH-001 (Version 1) to workspace 1 (feature).')
  })

  it('-o json reports a failure as JSON on stdout and still exits 1', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_BAD_REQUEST', message: 'unknown check query.removed'}, 400))
    const result = await runCommand(['policy', 'parse', policyFile, '-o', 'json'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    const envelope = JSON.parse(result.stdout)
    expect(envelope.error.exit).to.equal(1)
    expect(envelope.error.message).to.contain('unknown check query.removed')
    expect(envelope.error.message).to.equal(result.error?.message)
  })

  it('redacts the active credential if an API error reflects it', async () => {
    fixture.route(() => json({message: 'Invalid credential test-token'}, 403))
    const result = await runCommand(['policy', 'list'], fixture.config)
    expect(result.error?.message).to.contain('[REDACTED]')
    expect(result.error?.message).not.to.contain('test-token')
  })
})
