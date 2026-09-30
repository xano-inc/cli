/* eslint-disable unicorn/filename-case -- CLAUDE.md requires underscore filenames. */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../../helpers/policy-fixture.js'

/** An error or warning as one line: oclif wraps it at the terminal width behind a ` › ` gutter. */
const oneLine = (text: string) => text.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

const blocked = {
  can_override: true,
  changed: 0,
  existing: 2,
  findings: [{
    gate_reason: 'introduced',
    id: 'AUTH-001.R1:query:18',
    message: 'Endpoint has no authentication.',
    object: {name: 'GET /orders', type: 'query'},
    policy_key: 'AUTH-001',
    rule_id: 'R1',
    severity: 'high',
  }],
  gate: 'set_live',
  introduced: 1,
  status: 'blocked',
  total: 1,
  truncated: false,
}

const refusal = (answer: Record<string, unknown> = blocked, message = 'Set live refused: 1 blocking policy finding (1 introduced by this change).') =>
  json({code: 'ERROR_CODE_ACCESS_DENIED', message, payload: {code: 'policy_gate', ...answer}}, 403)

const live = {backup: false, created_at: '2026-09-27 10:00:00+0000', label: 'rollback', live: true}

describe('branch set_live and the set-live policy gate', () => {
  const fixture = policyFixture()

  /** `branch set_live rollback` with no confirmation prompt. */
  const setLive = (...extra: string[]) => runCommand(['branch', 'set_live', 'rollback', '--force', ...extra], fixture.config)

  it('a refusal prints the verdict, exits 2 with the platform\'s message, and names the override', async () => {
    fixture.route(() => refusal())
    const result = await setLive()
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/branch/rollback/live')
    expect(fixture.calls[0].body).to.equal(undefined)
    expect(result.stdout).to.contain('Policy gate: blocked')
    expect(result.stdout).to.contain('Blocking findings: 1 (1 introduced, 0 on objects the branch changes); 2 already on the live branch never block')
    expect(result.stdout).to.contain('Endpoint has no authentication.')
    const message = oneLine(result.error?.message ?? '')
    expect(message).to.contain('Set live refused: 1 blocking policy finding (1 introduced by this change).')
    expect(message).to.contain('xano branch set_live rollback --policy-override "<why>"')
    expect(message).not.to.contain('Failed to set branch as live')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('a refusal the credential may not override says whose permission it needs', async () => {
    fixture.route(() => refusal({...blocked, can_override: false}))
    const result = await setLive('-w', '7')
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/7/branch/rollback/live')
    const message = oneLine(result.error?.message ?? '')
    expect(message).to.contain('needs the `workspace:policy` update permission')
    expect(message).not.to.contain('--policy-override')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('a refusal under -o json keeps stdout the refusal', async () => {
    fixture.route(() => refusal())
    const result = await setLive('-o', 'json')
    const output = JSON.parse(result.stdout)
    expect(output).to.include({set_live: false})
    expect(output.message).to.contain('Set live refused')
    expect(output.policy_gate.gate).to.equal('set_live')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('--policy-override sends the trimmed reason and sets the branch live', async () => {
    fixture.route(() => json(live))
    const result = await setLive('--policy-override', '"  Rollback approved  "')
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({override_reason: 'Rollback approved'})
    expect(result.stdout).to.contain("Branch 'rollback' is now live")
  })

  it('a reason from a credential that may not override is refused with the platform\'s message', async () => {
    const message = 'Set live refused: 1 blocking policy finding (1 introduced by this change). Overriding a policy gate needs the workspace:policy update permission.'
    fixture.route(() => refusal({...blocked, can_override: false, override_denied: true}, message))
    const result = await setLive('--policy-override', 'Please')
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({override_reason: 'Please'})
    const error = oneLine(result.error?.message ?? '')
    expect(error).to.contain('Overriding a policy gate needs the workspace:policy update permission.')
    expect(error).not.to.contain('To proceed past the policy gate')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('a blank --policy-override is refused before any request, exiting 1', async () => {
    fixture.route(() => json(live))
    const result = await setLive('--policy-override', '"  "')
    expect(result.error?.message).to.contain('--policy-override needs a reason')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(fixture.calls).to.have.length(0)
  })

  it('a missing workspace exits 1, not the gate\'s 2', async () => {
    const credentials = path.join(fixture.directory, 'no-workspace.yaml')
    fs.writeFileSync(credentials, 'profiles:\n  fixture:\n    instance_origin: https://test.example.com\n    access_token: test-token\ndefault: fixture\n')
    process.env.XANO_CONFIG = credentials
    fixture.route(() => json(live))
    const result = await setLive()
    expect(result.error?.message).to.contain('No workspace ID provided')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(fixture.calls).to.have.length(0)
  })

  describe('a branch that weakens a mandatory policy of the live branch', () => {
    const message = 'Set live refused: it weakens mandatory policies GATE-001, GATE-002, which needs the workspace:policy update permission. The live branch was not changed.'
    const weakening = () => json({
      code: 'ERROR_CODE_ACCESS_DENIED',
      message,
      payload: {code: 'policy_weakening_permission_required', gate: 'set_live', level: 'update', permission: 'workspace:policy', policies: ['GATE-001', 'GATE-002']},
    }, 403)

    it('is a permission refusal: the platform\'s sentence and how to go on, exiting 1', async () => {
      fixture.route(() => weakening())
      const result = await setLive('-w', '7')
      const error = oneLine(result.error?.message ?? '')
      expect(error.startsWith(message)).to.equal(true)
      expect(error).to.contain('--policy-override does not stand in for it.')
      expect(error).to.contain('xano branch set_live rollback -w 7')
      expect(error).to.contain('ask someone who holds that permission')
      expect(error).not.to.contain('Failed to set branch as live')
      expect(error).not.to.contain('ERROR_CODE_ACCESS_DENIED')
      expect(result.stdout).not.to.contain('Policy gate:')
      expect(result.error).to.have.nested.property('oclif.exit', 1)
    })

    it('under -o json prints the error document and exits 1', async () => {
      fixture.route(() => weakening())
      const result = await setLive('-o', 'json')
      const output = JSON.parse(result.stdout)
      expect(output.error).to.include({exit: 1})
      expect(output.error.message).to.contain(message)
      expect(result.error).to.have.nested.property('oclif.exit', 1)
    })

    it('--policy-override does not turn it into a gate refusal', async () => {
      fixture.route(() => weakening())
      const result = await setLive('--policy-override', 'Approved')
      expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({override_reason: 'Approved'})
      expect(oneLine(result.error?.message ?? '')).to.contain(message)
      expect(result.error).to.have.nested.property('oclif.exit', 1)
    })
  })

  it('any other failure exits 1', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Access denied.', payload: {code: 'policy_permission_required'}}, 403))
    const result = await setLive()
    expect(result.error?.message).to.contain('Failed to set branch as live')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
  })
})
