import {expect} from 'chai'

import {policyFromGoal} from '../../src/utils/policy/goal.js'

const goal = {goal: 'Title', id: 'goal', key: 'GOAL', rules: [{check: 'check', needs: [], params: {existing: true}, title: ''}], severity: 'high', summary: 'Description'}
describe('policy goal authoring', () => {
  it('does not mutate goal seeds and preserves false and zero', () => {
    const document = policyFromGoal(goal, [], {overrides: ['flag=false', 'number=0']})
    expect(document.rules[0].params).to.deep.equal({existing: true, flag: false, number: 0})
    expect(goal.rules[0].params).to.deep.equal({existing: true})
  })

  it('requires numbered paths for multiple rules and rejects invalid indices', () => {
    const multi = {...goal, rules: [...goal.rules, ...goal.rules]}
    expect(() => policyFromGoal(multi, [], {overrides: ['flag=true']})).to.throw('rule number')
    expect(() => policyFromGoal(goal, [], {overrides: ['2.flag=true']})).to.throw('Rule 2')
  })

  it('refuses malformed paths, prototype writes, and non-JSON values', () => {
    for (const param of ['__proto__.polluted=true', 'constructor.prototype.x=true', 'flag=bare', 'a..b=true', 'flag', 'bound=1e999', 'limits={"min":1e999}']) {
      expect(() => policyFromGoal(goal, [], {overrides: [param]})).to.throw()
    }

    expect(({} as Record<string, unknown>).polluted).to.equal(undefined)
  })

  it('accepts PHP empty maps serialized as arrays', () => {
    const empty = {...goal, rules: [{...goal.rules[0], params: [] as unknown as Record<string, unknown>}] }
    expect(policyFromGoal(empty, [], {overrides: ['flag=false']}).rules[0].params).to.deep.equal({flag: false})
  })


  it('validates the key against the catalogue\'s key rule, naming the key in its sentence', () => {
    const keyRule = {message: 'Policy key "%s" does not match.', pattern: '^[A-Z]+$'}
    expect(() => policyFromGoal(goal, [], {key: 'lower', keyRule})).to.throw('Policy key "lower" does not match.')
    expect(policyFromGoal(goal, [], {key: 'UPPER', keyRule}).key).to.equal('UPPER')
    // The offline pattern stands in when the catalogue serves no key rule.
    expect(() => policyFromGoal(goal, [], {key: '-bad'})).to.throw('A policy key must be 1–64')
    expect(policyFromGoal(goal, [], {key: 'lower', keyRule: null}).key).to.equal('lower')
  })

  it('keeps maximum-length keys valid when suffixing', () => {
    const key = 'A'.repeat(64)
    expect(policyFromGoal({...goal, key}, [key]).key).to.equal(`${'A'.repeat(62)}-2`)
  })

  it('rejects empty required values but accepts false and zero', () => {
    const required = {...goal, rules: [{...goal.rules[0], needs: ['flag']}]}
    for (const value of ['null', '[]', '{}', '""']) expect(() => policyFromGoal(required, [], {overrides: [`flag=${value}`]})).to.throw('Fill')
    expect(policyFromGoal(required, [], {overrides: ['flag=false']}).rules[0].params.flag).to.equal(false)
  })
})
