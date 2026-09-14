/* eslint-disable camelcase -- Preserve server response field names. */
import {expect} from 'chai'

import {parseDocument} from '../../src/utils/document-parser.js'
import {filterChangedEntries} from '../../src/utils/multidoc-push.js'
import {policyExitCode, policyFileName, policySummary} from '../../src/utils/policy.js'

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

  it('prints remediation and does not call missing checks a pass', () => {
    expect(policySummary().join('\n')).to.contain('unavailable')
    expect(
      policySummary({
        blocking: true,
        findings: [{message: 'No auth', remediation: 'Enable auth', rule_id: 'R1'}],
        status: 'fail',
      }).join('\n'),
    ).to.contain('Enable auth')
  })

  it('keeps commented policy headers and treats their bodies as opaque source', () => {
    const content = '/* policy notes */\n// comment\n\npolicy AUTH-001 {\n narrative = "guid = fake"\n}'
    expect(parseDocument(content)).to.deep.equal({content, name: 'AUTH-001', type: 'policy'})
    expect(filterChangedEntries([{content, filePath: 'policies/AUTH-001.xs'}], [{action: 'update', name: 'AUTH-001', type: 'policy'}], false)).to.have.lengthOf(1)
  })

})
