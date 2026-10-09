import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

/** An error as one line: oclif wraps it at the terminal width behind a ` › ` gutter. */
const oneLine = (text: string) => text.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

/**
 * A push to the live branch is judged by the policies it leaves, so policy files that weaken a
 * policy active and blocking on the branch need the `workspace:policy` update permission. Without
 * it the push, and its preview, are refused before anything is written. That is a permission
 * refusal like `policy_permission_required` (exit 1), not a blocking finding (exit 2).
 */
describe('workspace push that weakens a blocking policy, without workspace:policy update', () => {
  const fixture = policyFixture({source: 'policy GATE-001 {\n  title = "Gate"\n  enforcement = "advisory"\n}'})
  const push = (...extra: string[]) => runCommand(['workspace', 'push', '-d', fixture.directory, '--no-guids', ...extra], fixture.config)

  const message = 'Push refused: it weakens blocking policy GATE-001, which needs the workspace:policy update permission. Nothing was imported.'
  const refused = () => json({
    code: 'ERROR_CODE_ACCESS_DENIED',
    message,
    payload: {code: 'policy_weakening_permission_required', gate: 'push', level: 'update', permission: 'workspace:policy', policies: ['GATE-001']},
  }, 403)

  it('stops the dry run with the platform sentence and how to go on, exiting 1 without importing', async () => {
    fixture.route(() => refused())
    const result = await push('--dry-run')
    expect(result.error?.oclif?.exit).to.equal(1)
    const error = oneLine(result.error?.message ?? '')
    expect(error.startsWith(message)).to.equal(true)
    expect(error).not.to.contain('Push refused (403)')
    expect(error).to.contain('and it needs the `workspace:policy` update permission. --policy-override does not stand in for it.')
    expect(error).to.contain('-e "policies/*"')
    expect(error).to.contain('xano workspace pull')
    expect(`${result.stdout}${result.stderr}`).not.to.contain('Skipping preview')
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.match(/\/multidoc\/dry-run$/)
  })

  it('stops the confirming push at its preview the same way', async () => {
    fixture.route(() => refused())
    const result = await push()
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(oneLine(result.error?.message ?? '')).to.contain(message)
    expect(fixture.calls).to.have.length(1)
  })

  it('explains the refused import the same way, with --policy-override too, and exits 1', async () => {
    fixture.route(() => refused())
    const result = await push('--force', '--policy-override', 'Approved')
    expect(result.error?.oclif?.exit).to.equal(1)
    const error = oneLine(result.error?.message ?? '')
    expect(error).to.contain(message)
    expect(error).to.contain('--policy-override does not stand in for it.')
    expect(error).to.contain('ask someone who holds that permission')
    expect(fixture.calls.at(-1)?.method).to.equal('POST')
    expect(fixture.calls.at(-1)?.url.searchParams.get('override_reason')).to.equal('Approved')
  })
})
