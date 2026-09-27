import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {trialLines} from '../../src/commands/policy/evaluate/index.js'
import {json, policyFixture} from '../helpers/policy-fixture.js'

const snapshot = [{
  key: 'TRY-001',
  lifecycle: 'draft',
  rules: [{check: 'object.settings_forbidden', id: 'TRY-001.R1', label: 'Objects avoid forbidden settings', params: {}, title: ''}],
  statement: 'Tried before it counts.',
}]
const trial = {
  clear: [
    {items: [{name: 'beta', type: 'function'}, {name: 'gamma', type: 'function'}], policy_key: 'TRY-001', rule_id: 'TRY-001.R1', total: 2},
    {items: [], policy_key: 'TRY-001', rule_id: 'TRY-001.R2', total: 0},
  ],
  findings: [{id: 'TRY-001.R1:function:1', message: 'matches forbidden settings', object: {name: 'alpha', type: 'function'}, policy_key: 'TRY-001', rule_id: 'TRY-001.R1'}],
  id: 0,
  policies: snapshot,
  policy_check: {blocking: false, blocking_finding_ids: [], message: 'Active policies reported findings.', run_id: 0, status: 'fail'},
  results: [{check_id: 'TRY-001.R1', checked: 3, message: '1 finding', policy_key: 'TRY-001', status: 'fail'}],
  stored: false,
}

describe('policy evaluate --policy', () => {
  const fixture = policyFixture({branch: 'profile-branch', source: 'policy TRY-001 {}', workspace: '3'})

  it('asks for a trial of that one policy and says what the answer is', async () => {
    fixture.route(() => json(trial))
    const result = await runCommand(['policy', 'evaluate', '--policy', 'TRY-001'], fixture.config)

    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({policy: 'TRY-001'})
    expect(result.stdout).to.contain('Trial of TRY-001: this policy alone, evaluated without storing a run.')
    expect(result.stdout).to.contain('Clear objects (examined, nothing found):\n  TRY-001.R1  2  beta, gamma\n  TRY-001.R2  0')
    // A trial is unstored by design, so the note about credentials that cannot record runs is not shown.
    expect(result.stdout).not.to.contain('Not stored:')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('sends the summary answer with the key, and passes the answer through as JSON', async () => {
    fixture.route(() => json(trial))
    const result = await runCommand(['policy', 'evaluate', '--policy', 'TRY-001', '--summary', '-o', 'json'], fixture.config)

    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({answer: 'summary', policy: 'TRY-001'})
    expect(JSON.parse(result.stdout)).to.deep.equal(trial)
  })

  it('names at most five clear objects per rule and counts the rest', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => ({name}))
    expect(trialLines('K', [{items, rule_id: 'K.R1', total: 120}])).to.deep.equal([
      'Trial of K: this policy alone, evaluated without storing a run. It is not a report and gates nothing.',
      'Clear objects (examined, nothing found):',
      '  K.R1  120  a, b, c, d, e, 115 more',
    ])
    expect(trialLines('K', [])).to.have.length(1)
  })
})
