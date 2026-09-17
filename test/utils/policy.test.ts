import {expect} from 'chai'

import {parseDocument} from '../../src/utils/document-parser.js'
import {filterChangedEntries} from '../../src/utils/multidoc-push.js'
import {computeStatusRows, policyExitCode, policyFileName, policySummary, statusExitCode} from '../../src/utils/policy.js'

const result = (status: string, checked = 1) => ({check_id: 'R1', checked, policy_key: 'AUTH-001', status})

describe('policy carriage and feedback', () => {
  it('preserves stable policy keys as safe filenames', () => {
    expect(policyFileName('AUTH-001')).to.equal('AUTH-001.xs')
    expect(() => policyFileName('../escape')).to.throw('Invalid policy key')
  })

  it('distinguishes mandatory findings, advisory findings and missing evidence', () => {
    expect(policyExitCode({blocking: true, status: 'fail'})).to.equal(2)
    expect(policyExitCode({blocking: false, status: 'fail'})).to.equal(0)
    expect(policyExitCode({blocking: false, status: 'unavailable'})).to.equal(1)
    expect(policyExitCode()).to.equal(1)
    expect(policyExitCode(undefined, true)).to.equal(0)
  })

  it('prints findings and does not call missing checks a pass', () => {
    expect(policySummary().join('\n')).to.contain('unavailable')
    expect(
      policySummary({
        blocking: true,
        findings: [{message: 'No auth', rule_id: 'R1'}],
        status: 'fail',
      }).join('\n'),
    ).to.contain('No auth')
  })

  it('prints a warning for a name the branch does not have, even when the rule passed', () => {
    const summary = policySummary({
      results: [{check_id: 'AUTH-001.R1', checked: 3, policy_key: 'AUTH-001', status: 'pass', warnings: ['API group "incidents" is not on this branch.']}],
      status: 'pass',
    }).join('\n')
    expect(summary).to.contain('AUTH-001 AUTH-001.R1: warning: API group "incidents" is not on this branch.')
  })

  it('names an unnamed rule by its id instead of printing nothing', () => {
    const summary = policySummary({
      findings: [{message: 'No auth', policy_key: 'AUTH-001', policy_title: '', rule_id: 'AUTH-001.R1', rule_title: ''}],
      status: 'fail',
    }).join('\n')
    expect(summary).to.contain('AUTH-001.R1 (AUTH-001)')
  })

  it('keeps commented policy headers and treats their bodies as opaque source', () => {
    const content = '// policy notes\n// comment\n\npolicy AUTH-001 {\n narrative = "guid = fake"\n}'
    expect(parseDocument(content)).to.deep.equal({content, name: 'AUTH-001', type: 'policy'})
    expect(filterChangedEntries([{content, filePath: 'policies/AUTH-001.xs'}], [{action: 'update', name: 'AUTH-001', type: 'policy'}], false)).to.have.lengthOf(1)
  })

  describe('computeStatusRows', () => {
    const policy = {enforcement: 'mandatory', id: 7, key: 'AUTH-001', lifecycle: 'active', rules: [{id: 'R1'}], updated_at: '2026-09-01T10:00:00.000Z'}
    const run = {
      findings: [{policy_key: 'AUTH-001'}],
      results: [{check_id: 'R1', checked: 10, policy_key: 'AUTH-001', status: 'fail'}],
      started_at: '2026-09-02T10:00:00.500Z',
    }

    it('compares ISO timestamps and reports a current failing run', () => {
      const [row] = computeStatusRows([policy], run)
      expect(row).to.deep.equal({
        checked: 10, findings: 1, key: 'AUTH-001', policy_updated_at: policy.updated_at,
        run_started_at: run.started_at, stale: false, status: 'fail', title: undefined,
      })
      expect(statusExitCode([policy], [row])).to.equal(2)
    })

    it('marks a policy edited after the run as outdated with ISO timestamps', () => {
      const edited = {...policy, updated_at: '2026-09-03T00:00:00Z'}
      const [row] = computeStatusRows([edited], run)
      expect(row).to.include({checked: 0, findings: 0, stale: true, status: 'outdated; evaluate again'})
      expect(statusExitCode([edited], [row])).to.equal(1)
    })

    it('accepts epoch numbers and a missing run', () => {
      const numeric = {...policy, updated_at: 1000}
      expect(computeStatusRows([numeric], {...run, started_at: 2000})[0]).to.include({stale: false, status: 'fail'})
      expect(computeStatusRows([numeric])[0]).to.include({run_started_at: null, stale: true, status: 'not evaluated'})
      expect(computeStatusRows([{...numeric, lifecycle: 'draft'}])[0]).to.include({stale: false, status: 'draft; not evaluated'})
    })

    it('distinguishes error, partial, empty-coverage and advisory outcomes', () => {
      const rules = [{id: 'R1'}, {id: 'R2'}]
      const rows = (results: Array<ReturnType<typeof result>>) => computeStatusRows([{...policy, rules}], {...run, findings: [], results})
      expect(rows([result('error')])[0].status).to.equal('error')
      expect(rows([result('pass')])[0].status).to.equal('not evaluated')
      expect(rows([result('pass', 0), {...result('pass', 0), check_id: 'R2'}])[0].status).to.equal('no objects checked')
      expect(rows([result('pass'), {...result('pass'), check_id: 'R2'}])[0].status).to.equal('pass')
      expect(computeStatusRows([{...policy, rules: []}], {...run, results: []})[0].status).to.equal('no checks')
      const advisory = {...policy, enforcement: 'advisory'}
      expect(statusExitCode([advisory], computeStatusRows([advisory], run))).to.equal(0)
    })
  })
})
