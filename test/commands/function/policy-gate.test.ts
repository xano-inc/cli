import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../../helpers/policy-fixture.js'

/** An error as one line: oclif wraps it at the terminal width behind a ` › ` gutter. */
const oneLine = (text: string) => text.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

const blocked = {
  can_override: true,
  changed: 1,
  existing: 0,
  findings: [{
    gate_reason: 'changed',
    id: 'AUTH-001.R1:function:12',
    message: 'calls db.truncate',
    object: {name: 'cleanup', type: 'function'},
    policy_key: 'AUTH-001',
    rule_id: 'AUTH-001.R1',
    severity: 'high',
  }],
  gate: 'publish',
  introduced: 0,
  status: 'blocked',
  total: 1,
  truncated: false,
}

const message = 'Publish refused: 1 blocking policy finding (0 introduced by this change, 1 on objects it changes).'
const refusal = (answer: Record<string, unknown> = blocked) =>
  json({code: 'ERROR_CODE_ACCESS_DENIED', message, payload: {code: 'policy_gate', ...answer}}, 403)

describe('function create and edit and the live-branch publish gate', () => {
  const fixture = policyFixture()
  let script: string

  before(() => {
    script = path.join(fixture.directory, 'cleanup.xs')
    fs.writeFileSync(script, 'function cleanup {\n  input {\n  }\n\n  stack {\n  }\n\n  response = null\n}\n')
  })

  const create = (...extra: string[]) => runCommand(['function', 'create', '-f', script, ...extra], fixture.config)
  const edit = (...extra: string[]) => runCommand(['function', 'edit', '12', '-f', script, ...extra], fixture.config)

  it('a refused create prints the verdict, says nothing was saved, names the override, and exits 2', async () => {
    fixture.route(() => refusal())
    const result = await create()
    expect(fixture.calls[0].url.searchParams.has('override_reason')).to.equal(false)
    expect(result.stdout).to.contain('Policy gate: blocked')
    expect(result.stdout).to.contain('Blocking findings: 1 (0 introduced, 1 on objects the save changes); 0 already on the live branch never block')
    expect(result.stdout).to.contain('AUTH-001.R1 [high] (AUTH-001)  function cleanup: calls db.truncate')
    const error = oneLine(result.error?.message ?? '')
    expect(error).to.contain(`Nothing was saved. ${message}`)
    expect(error).to.contain(`xano function create -f ${script} --policy-override "<why>"`)
    expect(error).not.to.contain('Failed to create function')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('create --policy-override sends the trimmed reason as override_reason', async () => {
    fixture.route(() => json({id: 12, name: 'cleanup'}))
    const result = await create('--policy-override', '"  Exception approved  "')
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].url.searchParams.get('override_reason')).to.equal('Exception approved')
    expect(result.stdout).to.contain('Function created successfully!')
  })

  it('a refused edit under -o json prints the refusal and exits 2', async () => {
    fixture.route(() => refusal())
    const result = await edit('-o', 'json')
    expect(fixture.calls[0].method).to.equal('PUT')
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/function/12')
    const output = JSON.parse(result.stdout)
    expect(output).to.include({message, updated: false})
    expect(output.policy_gate.gate).to.equal('publish')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('a refused edit the credential may not override says whose permission it needs', async () => {
    fixture.route(() => refusal({...blocked, can_override: false}))
    const result = await edit()
    const error = oneLine(result.error?.message ?? '')
    expect(error).to.contain('needs the `workspace:policy` update permission')
    expect(error).not.to.contain('--policy-override')
    expect(result.error).to.have.nested.property('oclif.exit', 2)
  })

  it('edit --policy-override sends the reason with the publish', async () => {
    fixture.route(() => json({id: 12, name: 'cleanup'}))
    const result = await edit('--policy-override', '"Exception approved"')
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].url.searchParams.get('override_reason')).to.equal('Exception approved')
    expect(fixture.calls[0].url.searchParams.get('publish')).to.equal('true')
  })

  it('refuses a blank --policy-override before any request, exiting 1', async () => {
    fixture.route(() => json({id: 12, name: 'cleanup'}))
    for (const command of [create, edit]) {
      // eslint-disable-next-line no-await-in-loop -- one command at a time against one stubbed fetch
      const blank = await command('--policy-override', '" "')
      expect(blank.error?.message).to.contain('--policy-override needs a reason')
      expect(blank.error).to.have.nested.property('oclif.exit', 1)
    }

    expect(fixture.calls).to.have.length(0)
  })

  it('any failure that is not the publish gate exits 1', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_BAD_REQUEST', message: 'Syntax error'}, 400))
    const created = await create()
    expect(created.error?.message).to.contain('Failed to create function')
    expect(created.error).to.have.nested.property('oclif.exit', 1)
    fixture.route(() => json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Access denied.'}, 403))
    const edited = await edit()
    expect(edited.error?.message).to.contain('Failed to update function')
    expect(edited.error).to.have.nested.property('oclif.exit', 1)
  })
})
