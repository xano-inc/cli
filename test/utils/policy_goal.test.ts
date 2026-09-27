/* eslint-disable unicorn/filename-case -- CLAUDE.md requires underscore filenames. */
import {expect} from 'chai'

import {policy_from_goal} from '../../src/utils/policy/goal.js'

const goal = {goal: 'Title', id: 'goal', key: 'GOAL', rules: [{check: 'check', needs: [], params: {existing: true}, title: ''}], severity: 'high', summary: 'Description'}
describe('policy goal authoring', () => {

  it('does not mutate goal seeds and preserves false and zero', () => {
    const document = policy_from_goal(goal, [], undefined, ['flag=false', 'number=0'])
    expect(document.rules[0].params).to.deep.equal({existing: true, flag: false, number: 0})
    expect(goal.rules[0].params).to.deep.equal({existing: true})
  })

  it('requires numbered paths for multiple rules and rejects invalid indices', () => {
    const multi = {...goal, rules: [...goal.rules, ...goal.rules]}
    expect(() => policy_from_goal(multi, [], undefined, ['flag=true'])).to.throw('rule number')
    expect(() => policy_from_goal(goal, [], undefined, ['2.flag=true'])).to.throw('Rule 2')
  })

  it('refuses malformed paths, prototype writes, and non-JSON values', () => {
    for (const param of ['__proto__.polluted=true', 'constructor.prototype.x=true', 'flag=bare', 'a..b=true', 'flag', 'bound=1e999', 'limits={"min":1e999}']) {
      expect(() => policy_from_goal(goal, [], undefined, [param])).to.throw()
    }

    expect(({} as Record<string, unknown>).polluted).to.equal(undefined)
  })

  it('accepts PHP empty maps serialized as arrays', () => {
    const empty = {...goal, rules: [{...goal.rules[0], params: [] as unknown as Record<string, unknown>}] }
    expect(policy_from_goal(empty, [], undefined, ['flag=false']).rules[0].params).to.deep.equal({flag: false})
  })


  it('keeps maximum-length keys valid when suffixing', () => {
    const key = 'A'.repeat(64)
    expect(policy_from_goal({...goal, key}, [key]).key).to.equal(`${'A'.repeat(62)}-2`)
  })

  it('rejects empty required values but accepts false and zero', () => {
    const required = {...goal, rules: [{...goal.rules[0], needs: ['flag']}]}
    for (const value of ['null', '[]', '{}', '""']) expect(() => policy_from_goal(required, [], undefined, [`flag=${value}`])).to.throw('Fill')
    expect(policy_from_goal(required, [], undefined, ['flag=false']).rules[0].params.flag).to.equal(false)
  })
})
