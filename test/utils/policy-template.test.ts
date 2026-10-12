import {expect} from 'chai'

import type {PolicyCatalogueEntry} from '../../src/utils/policy/types.js'

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

  it('names the template example for an unfilled need as a --param to copy', () => {
    const one = {...template, examples: {fields: ['user_id']}, rules: [{...template.rules[0], needs: ['fields']}]}
    expect(() => policyFromTemplate(one, [])).to.throw(`Fill the template's required settings with --param 'N.path=JSON': 1.fields. For example: --param 'fields=["user_id"]'.`)
    const two = {...one, examples: {names: ['audit_log']}, rules: [{...template.rules[0], needs: ['tables']}, {...template.rules[0], needs: ['names']}]}
    expect(() => policyFromTemplate(two, [], {overrides: ['1.tables=["x"]']})).to.throw(`: 2.names. For example: --param '2.names=["audit_log"]'.`)
    expect(() => policyFromTemplate({...one, examples: {}}, [])).to.throw(/: 1\.fields\.$/)
  })

  it('falls back to the check\'s own catalogue example when the template gives none for the need', () => {
    const checks: PolicyCatalogueEntry[] = [
      {id: 'object.tag_required', label: 'Tags', params: {tag_set: {example: ['team-billing', 'team-growth'], required: true, type: 'string[]'}}},
      {id: 'table.coverage_required', label: 'Coverage', params: {table_selector: {properties: {has_field: {example: 'tenant_id', type: 'string'}}, type: 'object'}}},
    ]
    const owner = {...template, examples: {}, rules: [{...template.rules[0], check: 'object.tag_required', needs: ['tag_set']}]}
    expect(() => policyFromTemplate(owner, [], {checks})).to.throw(`: 1.tag_set. For example: --param 'tag_set=["team-billing","team-growth"]'.`)
    // A template without an examples map at all reads the same; a nested need reads its part's example.
    expect(() => policyFromTemplate({...owner, examples: undefined}, [], {checks})).to.throw(`For example: --param 'tag_set=["team-billing","team-growth"]'.`)
    const nested = {...template, rules: [{...template.rules[0], check: 'other'}, {...template.rules[0], check: 'table.coverage_required', needs: ['table_selector.has_field']}]}
    expect(() => policyFromTemplate(nested, [], {checks})).to.throw(`: 2.table_selector.has_field. For example: --param '2.table_selector.has_field="tenant_id"'.`)
    // The template's example wins over the check's.
    expect(() => policyFromTemplate({...owner, examples: {tag_set: ['public']}}, [], {checks})).to.throw(`For example: --param 'tag_set=["public"]'.`)
    // A check without an example, or one missing from the catalogue, gives none.
    expect(() => policyFromTemplate(owner, [], {checks: [{id: 'object.tag_required', label: 'Tags', params: {tag_set: {type: 'string[]'}}}]})).to.throw(/: 1\.tag_set\.$/)
    expect(() => policyFromTemplate(owner, [])).to.throw(/: 1\.tag_set\.$/)
  })
})
