import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

const refused = () =>
  json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Access denied.', payload: {code: 'audit_plan_required'}}, 403)

/**
 * A push whose table audit block turns auditing on, on a plan without Content Record Audit, is
 * refused with payload.code audit_plan_required. The CLI names the plan rather than the generic
 * access error, and stops at the preview because the push would be refused the same way.
 */
describe('workspace push on a plan without Content Record Audit', () => {
  const fixture = policyFixture({source: 'table users {\n  audit = {enabled: true}\n}'})
  const push = (...extra: string[]) => runCommand(['workspace', 'push', '-d', fixture.directory, '--no-guids', ...extra], fixture.config)
  const expected =
    'Push refused (403): Content Record Audit is not included in this plan. Upgrade to Pro or above to audit a table.'

  it('stops the dry run with the plan message', async () => {
    fixture.route(() => refused())
    const result = await push('--dry-run')
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.equal(expected)
    expect(fixture.calls).to.have.length(1)
  })

  it('names the plan when the push itself is refused', async () => {
    fixture.route((url) => (url.pathname.endsWith('/dry-run') ? json({}) : refused()))
    const result = await push('--force')
    expect(result.error?.message).to.equal(expected)
  })
})
