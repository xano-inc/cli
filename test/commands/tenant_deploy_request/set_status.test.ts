/* eslint-disable unicorn/filename-case -- CLAUDE.md requires underscore filenames. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../helpers/policy-fixture.js'

/** An error or warning as one line: oclif wraps it at the terminal width behind a ` › ` gutter. */
const oneLine = (text: string) => text.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

/** The approval-request the status endpoint returns; `fully_approved`/`resolution` drive the output. */
const request = (over: Record<string, unknown> = {}) => ({
  approvals_count: 1,
  fully_approved: true,
  id: 12,
  required_reviewers: 1,
  resolution: {deploy_status: ''},
  status: 'approved',
  title: 'Deploy v1.2 to prod',
  ...over,
})

/** A policy-gate refusal of the inline deploy a `--deploy` approve triggers (403, payload.code policy_gate). */
const refusal = (answer: Record<string, unknown> = {}, message = 'Deploy refused: 1 blocking policy finding.') =>
  json(
    {
      code: 'ERROR_CODE_ACCESS_DENIED',
      message,
      payload: {can_override: true, code: 'policy_gate', gate: 'tenant_approve', gated: true, release: {name: 'v1.2'}, status: 'blocked', total: 1, ...answer},
    },
    403,
  )

describe('tenant_deploy_request set_status and the approve-and-deploy path', () => {
  const fixture = policyFixture()

  const setStatus = (...extra: string[]) => runCommand(['tenant_deploy_request', 'set_status', '12', ...extra], fixture.config)

  it('a bare approve sends no auto_deploy and reports the release is authorized but not yet deployed', async () => {
    fixture.route(() => json(request({resolution: {deploy_status: ''}})))
    const result = await setStatus('--status', 'approve')
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/approval_request/12/status')
    const body = JSON.parse(fixture.calls[0].body!)
    expect(body).to.not.have.property('auto_deploy')
    expect(body.action).to.equal('approve')
    expect(result.stdout).to.contain('Deploy request #12 is now: approved (1/1 required reviewers)')
    expect(result.stdout).to.contain('The release is approved but not yet deployed')
    expect(result.stdout).to.contain('xano tenant deploy_release')
    expect(result.error).to.equal(undefined)
  })

  it('approve --deploy sends auto_deploy: true and reports the inline deploy', async () => {
    fixture.route(() => json(request({resolution: {deploy_status: 'deployed'}})))
    const result = await setStatus('--status', 'approve', '--deploy')
    const body = JSON.parse(fixture.calls[0].body!)
    expect(body.auto_deploy).to.equal(true)
    expect(result.stdout).to.contain('Deployed to tenant as part of this approval.')
    expect(result.stdout).to.not.contain('not yet deployed')
    expect(result.error).to.equal(undefined)
  })

  it('approve --deploy reports a failed deploy (branch preserved)', async () => {
    fixture.route(() => json(request({resolution: {deploy_error: 'storage provider missing', deploy_status: 'failed'}})))
    const result = await setStatus('--status', 'approve', '--deploy')
    expect(result.stdout).to.contain('Approved, but the deploy failed: storage provider missing')
    expect(result.stdout).to.not.contain('not yet deployed')
    expect(result.error).to.equal(undefined)
  })

  it('a bare approve that does not complete the quorum records the vote and sends no auto_deploy', async () => {
    fixture.route(() => json(request({approvals_count: 1, fully_approved: false, required_reviewers: 2, resolution: undefined, status: 'pending'})))
    const result = await setStatus('--status', 'approve')
    const body = JSON.parse(fixture.calls[0].body!)
    expect(body).to.not.have.property('auto_deploy')
    expect(result.stdout).to.contain('Vote recorded on deploy request #12: 1/2 required reviewers.')
    expect(result.stdout).to.not.contain('not yet deployed')
    expect(result.error).to.equal(undefined)
  })

  it('--deploy with a non-approve status is refused before any request, exiting 1', async () => {
    fixture.route(() => json(request()))
    const result = await setStatus('--status', 'submit', '--deploy')
    expect(result.error?.message).to.contain('--deploy applies only to --status approve')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(fixture.calls).to.have.length(0)
  })

  it('--override-policy without --deploy is refused before any request, exiting 1', async () => {
    fixture.route(() => json(request()))
    const result = await setStatus('--status', 'approve', '--override-policy', '--reason', 'why')
    expect(result.error?.message).to.contain('--override-policy has effect only with --deploy')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(fixture.calls).to.have.length(0)
  })

  it('--deploy --override-policy --reason past a gate refusal prints the verdict, exits 2, and keeps the request approved', async () => {
    fixture.route(() => refusal())
    const result = await setStatus('--status', 'approve', '--deploy', '--override-policy', '--reason', 'accepted-JIRA-12')
    const body = JSON.parse(fixture.calls[0].body!)
    expect(body.auto_deploy).to.equal(true)
    expect(body.override_policy).to.equal(true)
    expect(result.stdout).to.contain('Policy gate: blocked')
    const message = oneLine(result.error?.message ?? '')
    expect(message).to.contain('Deploy refused: 1 blocking policy finding.')
    expect(message).to.contain('Your approval was recorded and the request is approved')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('-o json is the raw approval-request passthrough, with no extra summary line', async () => {
    fixture.route(() => json(request({resolution: {deploy_status: ''}})))
    const result = await setStatus('--status', 'approve', '-o', 'json')
    const output = JSON.parse(result.stdout)
    expect(output.id).to.equal(12)
    expect(output.status).to.equal('approved')
    expect(result.stdout).to.not.contain('not yet deployed')
    expect(result.error).to.equal(undefined)
  })
})
