import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

describe('workspace push publish gate', () => {
  const fixture = policyFixture()
  const finding = {gate_reason: 'introduced', message: 'declares no auth', object: {name: 'GET /users', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1'}
  const payload = {can_override: true, changed: 1, code: 'policy_gate', findings: [finding], gate: 'push', introduced: 2, total: 3}
  const push = (...args: string[]) => runCommand(['workspace', 'push', '-d', fixture.directory, '--no-guids', ...args], fixture.config)

  it('exits 2 and explains a refused live push, with findings and override guidance', async () => {
    fixture.route(() => json({message: 'Push blocked', payload}, 403))
    const result = await push('--force')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(result.error?.message).to.include('3 blocking policy findings').and.include('2 introduced').and.include('1 on changed objects')
    expect(result.error?.message).to.include('Nothing was imported').and.include('--policy-override')
    expect(result.error?.message).to.include('AUTH-001.R1 (AUTH-001)  query GET /users: declares no auth (introduced)')
  })

  it('prints the platform\'s sentence, which names the blocking policies to every caller', async () => {
    const message = 'Push refused: 3 blocking policy findings from AUTH-001 and PII-001 (2 introduced by this change, 1 on objects it changes).'
    fixture.route(() => json({message, payload}, 403))
    const result = await push('--force')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(result.error?.message).to.include(`${message} Nothing was imported.`)
    expect(result.error?.message).to.include('AUTH-001.R1 (AUTH-001)  query GET /users: declares no auth (introduced)')
  })

  it('tells a caller without policy read which policies refused the push, and that the findings need policy read', async () => {
    const message = 'Push refused: 3 blocking policy findings from AUTH-001 (2 introduced by this change, 1 on objects it changes).'
    const counts = {can_override: false, changed: 1, code: 'policy_gate', gate: 'push', introduced: 2, total: 3}
    fixture.route(() => json({message, payload: counts}, 403))
    const result = await push('--force')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(result.error?.message).to.include(`${message} Nothing was imported.`)
    expect(result.error?.message).to.include('The findings are listed only for a credential that reads policies (workspace:policy read).')
    expect(result.error?.message).to.include('ask someone with workspace:policy update permission')
  })

  it('counts a single blocking finding in the singular', async () => {
    fixture.route(() => json({message: 'Push blocked', payload: {...payload, changed: 0, introduced: 1, total: 1}}, 403))
    const result = await push('--force')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(result.error?.message).to.include('Push refused: 1 blocking policy finding (1 introduced, 0 on changed objects).')
  })

  it('returns one refusal JSON document and preserves exit 2', async () => {
    fixture.route(() => json({message: 'Push blocked', payload}, 403))
    const result = await push('--force', '-o', 'json')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(JSON.parse(result.stdout)).to.deep.equal({imported: false, refused: payload})
  })

  it('preserves a gate refusal at preview without importing', async () => {
    fixture.route(() => json({message: 'Push blocked', payload}, 403))
    const result = await push('--dry-run')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.match(/dry-run$/)
  })

  it('sends the reason on import to the selected live branch', async () => {
    fixture.route(() => json({policy_check: {blocking: false, status: 'pass'}}))
    const result = await push('--force', '-b', 'live', '--policy-override', '"Approved exception"')
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].url.searchParams.get('override_reason')).to.equal('Approved exception')
    expect(fixture.calls[0].url.searchParams.get('branch')).to.equal('live')
  })

  it("pushes to the live branch for -b '', whatever the profile's branch", async () => {
    fixture.route(() => json({policy_check: {blocking: false, status: 'pass'}}))
    const result = await push('--force', '-b', '""')
    expect(result.error).to.equal(undefined)
    // No branch parameter is the live branch; the profile's branch is `feature`.
    expect(fixture.calls[0].url.searchParams.get('branch') ?? '').to.equal('')
  })

  it('refuses a blank --policy-override before any request, exiting 1', async () => {
    fixture.route(() => json({policy_check: {blocking: false, status: 'pass'}}))
    const result = await push('--force', '-b', 'live', '--policy-override', '"   "')
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.include('--policy-override needs a reason')
    expect(fixture.calls).to.have.length(0)
  })

  it('explains transaction refusal as an operational failure', async () => {
    fixture.route(() => json({message: 'Transaction required', payload: {code: 'policy_gate_transaction_required'}}, 400))
    const result = await push('--force', '--no-transaction')
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.include('--no-transaction').and.include('Nothing was imported')
  })
})
