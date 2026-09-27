import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

/**
 * A push whose new policy files would take the branch past its plan's policy cap is refused before
 * anything is written, and so is its preview. The preview has to say so with the platform's own
 * message (it names the plan, the cap and the remedy), not skip the preview and ask to proceed.
 */
describe('workspace push at the plan policy cap', () => {
  const fixture = policyFixture({source: 'policy F-PUSH-1 { title = "One" }'})
  const push = (...extra: string[]) => runCommand(['workspace', 'push', '-d', fixture.directory, '--no-guids', ...extra], fixture.config)

  const message = 'This would add 1 policy (F-PUSH-1), but the Free plan allows 3 policies per branch, and this branch has 3. Nothing was imported. Upgrade your plan to add more policies.'
  const refused = () => json({
    code: 'ERROR_CODE_ACCESS_DENIED',
    message,
    payload: {adding: 1, code: 'policy_plan_limit', count: 3, limit: 3, plan: 'build', plan_name: 'Free', policies: ['F-PUSH-1']},
  }, 403)

  it('stops the dry run with the platform message and never reaches the import', async () => {
    fixture.route(() => refused())
    const result = await push('--dry-run')
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.equal(`Push refused (403): ${message}`)
    expect(`${result.stdout}${result.stderr}`).not.to.contain('Skipping preview')
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.match(/\/multidoc\/dry-run$/)
  })

  it('stops the confirming push at its preview the same way', async () => {
    fixture.route(() => refused())
    const result = await push()
    expect(result.error?.message).to.equal(`Push refused (403): ${message}`)
    expect(fixture.calls).to.have.length(1)
  })

  it('names the platform message when a preview fails for a reason it does not explain', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Something else went wrong.'}, 403))
    const result = await push('--dry-run')
    expect(result.stderr.replaceAll(/\s+›?\s*/g, ' ')).to.contain('Push preview failed (403): Something else went wrong. Skipping preview.')
  })
})
