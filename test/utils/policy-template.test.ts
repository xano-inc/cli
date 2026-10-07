import {expect} from 'chai'

import {policyFromTemplate} from '../../src/utils/policy/template.js'

const template = {category: 'Testing', id: 'template', key: 'TEMPLATE', rules: [{check: 'check', needs: [], params: {existing: true}, title: ''}], severity: 'high', summary: 'Description', title: 'Title'}
describe('policy template authoring', () => {
  it('does not mutate template seeds and preserves false and zero', () => {
    const document = policyFromTemplate(template, [], {overrides: ['flag=false', 'number=0']})
    expect(document.rules[0].params).to.deep.equal({existing: true, flag: false, number: 0})
    expect(template.rules[0].params).to.deep.equal({existing: true})
  })

  it('requires numbered paths for multiple rules and rejects invalid indices', () => {
    const multi = {...template, rules: [...template.rules, ...template.rules]}
    expect(() => policyFromTemplate(multi, [], {overrides: ['flag=true']})).to.throw('rule number')
    expect(() => policyFromTemplate(template, [], {overrides: ['2.flag=true']})).to.throw('Rule 2')
  })

  it('refuses malformed paths, prototype writes, and non-JSON values', () => {
    for (const param of ['__proto__.polluted=true', 'constructor.prototype.x=true', 'flag=bare', 'a..b=true', 'flag', 'bound=1e999', 'limits={"min":1e999}']) {
      expect(() => policyFromTemplate(template, [], {overrides: [param]})).to.throw()
    }

    expect(({} as Record<string, unknown>).polluted).to.equal(undefined)
  })

  it('accepts PHP empty maps serialized as arrays', () => {
    const empty = {...template, rules: [{...template.rules[0], params: [] as unknown as Record<string, unknown>}] }
    expect(policyFromTemplate(empty, [], {overrides: ['flag=false']}).rules[0].params).to.deep.equal({flag: false})
  })


  it('validates the key against the catalogue\'s key rule, naming the key in its sentence', () => {
    const keyRule = {message: 'Policy key "%s" does not match.', pattern: '^[A-Z]+$'}
    expect(() => policyFromTemplate(template, [], {key: 'lower', keyRule})).to.throw('Policy key "lower" does not match.')
    expect(policyFromTemplate(template, [], {key: 'UPPER', keyRule}).key).to.equal('UPPER')
    // The offline pattern stands in when the catalogue serves no key rule.
    expect(() => policyFromTemplate(template, [], {key: '-bad'})).to.throw('A policy key must be 1–64')
    expect(policyFromTemplate(template, [], {key: 'lower', keyRule: null}).key).to.equal('lower')
  })

  it('keeps maximum-length keys valid when suffixing', () => {
    const key = 'A'.repeat(64)
    expect(policyFromTemplate({...template, key}, [key]).key).to.equal(`${'A'.repeat(62)}-2`)
  })

  it('rejects empty required values but accepts false and zero', () => {
    const required = {...template, rules: [{...template.rules[0], needs: ['flag']}]}
    for (const value of ['null', '[]', '{}', '""']) expect(() => policyFromTemplate(required, [], {overrides: [`flag=${value}`]})).to.throw('Fill')
    expect(policyFromTemplate(required, [], {overrides: ['flag=false']}).rules[0].params.flag).to.equal(false)
  })

  it('requires every need of a rule unless it says needs_any', () => {
    const both = {...template, rules: [{...template.rules[0], needs: ['tables', 'functions']}]}
    expect(() => policyFromTemplate(both, [], {overrides: ['tables=["audit_log"]']})).to.throw(/: 1\.functions\.$/)
    expect(() => policyFromTemplate({...both, rules: [{...both.rules[0], needs_any: false}]}, [], {overrides: ['tables=["audit_log"]']})).to.throw(/: 1\.functions\.$/)
    expect(policyFromTemplate(both, [], {overrides: ['tables=["audit_log"]', 'functions=["write_audit"]']}).rules[0].params).to.include.keys('tables', 'functions')
  })

  it('accepts one filled need of a needs_any rule and names the alternatives when none is', () => {
    const either = {...template, rules: [{...template.rules[0], needs: ['hosts', 'providers'], needs_any: true}]}
    expect(() => policyFromTemplate(either, [])).to.throw(/: 1\.hosts or 1\.providers\.$/)
    expect(() => policyFromTemplate(either, [], {overrides: ['hosts=[]']})).to.throw('1.hosts or 1.providers')
    expect(policyFromTemplate(either, [], {overrides: ['hosts=["api.example.com"]']}).rules[0].params).to.deep.equal({existing: true, hosts: ['api.example.com']})
    expect(policyFromTemplate(either, [], {overrides: ['providers=["openai"]']}).rules[0].params).to.deep.equal({existing: true, providers: ['openai']})
  })
})
