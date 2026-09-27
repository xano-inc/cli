import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

describe('workspace push publish gate', () => {
  const fixture = policyFixture()
  const payload = {can_override: true, changed: 1, code: 'policy_gate', findings: [{message: 'Authentication is required'}], gate: 'push', introduced: 2, total: 3}
  const push = (...args: string[]) => runCommand(['workspace', 'push', '-d', fixture.directory, '--no-guids', ...args], fixture.config)

  it('exits 2 and explains a refused live push, with findings and override guidance', async () => {
    fixture.route(() => json({message: 'Push blocked', payload}, 403))
    const result = await push('--force')
    expect(result.error?.oclif?.exit).to.equal(2)
    expect(result.error?.message).to.include('3 blocking policy findings').and.include('2 introduced').and.include('1 on changed objects')
    expect(result.error?.message).to.include('Nothing was imported').and.include('Authentication is required').and.include('--policy-override')
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

  it('explains transaction refusal as an operational failure', async () => {
    fixture.route(() => json({message: 'Transaction required', payload: {code: 'policy_gate_transaction_required'}}, 400))
    const result = await push('--force', '--no-transaction')
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.include('--no-transaction').and.include('Nothing was imported')
  })
})
