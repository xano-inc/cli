import {captureOutput, runCommand} from '@oclif/test'
import {expect} from 'chai'

import PolicyCreate from '../../src/commands/policy/create/index.js'
import {json, policyFixture} from '../helpers/policy-fixture.js'

const readyTemplate = {category: 'Reliability', id: 'safe_calls', key: 'SAFE-001', rules: [{check: 'stack.statement_forbidden', needs: [], params: {statements: ['db.truncate']}, title: ''}], severity: 'high', summary: 'Keep stored data.', title: 'No unsafe calls'}
const needsTemplate = {...readyTemplate, id: 'custom', rules: [{check: 'table.coverage_required', needs: ['table_selector.has_field'], params: {}, title: ''}]}

describe('policy create from a platform template', () => {
  const fixture = policyFixture()
  const created = {id: 9, key: 'SAFE-001', version: 1}

  beforeEach(() => {
    fixture.route((url, method) => {
      if (url.pathname.endsWith('/check')) return json({items: [], templates: [readyTemplate, needsTemplate]})
      if (url.pathname.endsWith('/parse')) return json({policy: {key: 'SAFE-001'}, rule_warnings: [], source: 'canonical source'})
      if (method === 'GET') return json({items: [], nextPage: null})
      return json(created)
    })
  })

  it('creates from the live catalogue, validates natively, and saves canonical source on the selected branch', async () => {
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls', '-b', 'scratch', '-o', 'json', '-m', 'Started'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal(created)
    const parsed = fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!
    expect(JSON.parse(parsed.body!).data).to.deep.equal({key: 'SAFE-001', rules: [{check: 'stack.statement_forbidden', params: {statements: ['db.truncate']}, title: ''}], severity: 'high', statement: 'Keep stored data.', title: 'No unsafe calls'})
    const write = fixture.calls.at(-1)!
    expect(write.method).to.equal('POST')
    expect(write.url.searchParams.get('branch')).to.equal('scratch')
    expect(JSON.parse(write.body!)).to.deep.equal({data: {source: 'canonical source'}, message: 'Started'})
  })

  it('refuses missing template needs before a parse or write and names how to supply them', async () => {
    const result = await runCommand(['policy', 'create', '--template', 'custom'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.contain('1.table_selector.has_field')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('takes one need of a needs_any rule, and names the alternatives when none is filled', async () => {
    const vendors = {...readyTemplate, id: 'vendors', rules: [{check: 'outbound.vendor_allowlist', needs: ['hosts', 'providers'], needs_any: true, params: {}, title: ''}]}
    fixture.route((url, method) => {
      if (url.pathname.endsWith('/check')) return json({items: [], templates: [vendors]})
      if (url.pathname.endsWith('/parse')) return json({policy: {key: 'SAFE-001'}, rule_warnings: [], source: 'canonical source'})
      if (method === 'GET') return json({items: [], nextPage: null})
      return json(created)
    })
    const refused = await runCommand(['policy', 'create', '--template', 'vendors'], fixture.config)
    expect(refused.error?.message).to.contain('1.hosts or 1.providers')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)

    const result = await captureOutput(() => PolicyCreate.run(['--template', 'vendors', '--param', 'hosts=["api.example.com"]'], fixture.config))
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!.body!).data.rules[0].params).to.deep.equal({hosts: ['api.example.com']})
  })

  it('fills nested parameters with typed JSON, keeping unrelated seed values', async () => {
    const result = await captureOutput(() => PolicyCreate.run(['--template', 'custom', '--key', 'MY-KEY', '--param', '1.table_selector.has_field="created_at"'], fixture.config))
    expect(result.error).to.equal(undefined)
    const document = JSON.parse(fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!.body!).data
    expect(document.key).to.equal('MY-KEY')
    expect(document.rules[0].params).to.deep.equal({table_selector: {has_field: 'created_at'}})
  })

  it('checks --key against the key pattern the catalogue serves, before any write', async () => {
    const document = {key: {message: 'Policy key "%s" must be upper case here.', pattern: '^[A-Z-]+$'}}
    fixture.route((url, method) => {
      if (url.pathname.endsWith('/check')) return json({document, items: [], templates: [readyTemplate]})
      if (method === 'GET') return json({items: [], nextPage: null})
      throw new Error(`unexpected ${method} ${url.pathname}`)
    })
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls', '--key', 'lower-key'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.contain('Policy key "lower-key" must be upper case here.')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('refuses unknown templates without writing', async () => {
    const result = await runCommand(['policy', 'create', '--template', 'missing'], fixture.config)
    expect(result.error?.message).to.contain('Unknown template')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('checks every list page for case-insensitive key collisions and chooses a free suffix', async () => {
    fixture.route((url, method) => {
      if (url.pathname.endsWith('/check')) return json({templates: [readyTemplate]})
      if (url.pathname.endsWith('/parse')) return json({policy: {key: 'SAFE-001-3'}, source: 'canonical source'})
      if (method === 'GET') return url.searchParams.get('page') === '2' ? json({items: [{key: 'SAFE-001-2'}], nextPage: null}) : json({items: [{key: 'safe-001'}], nextPage: 2})
      return json(created)
    })
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!.body!).data.key).to.equal('SAFE-001-3')
  })

  it('refuses an explicitly taken key instead of updating it', async () => {
    fixture.route(url => url.pathname.endsWith('/check') ? json({templates: [readyTemplate]}) : json({items: [{key: 'taken'}]}))
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls', '--key', 'TAKEN'], fixture.config)
    expect(result.error?.message).to.contain('already exists')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('stops at a native validation refusal', async () => {
    fixture.route(url => url.pathname.endsWith('/check') ? json({templates: [readyTemplate]}) : url.pathname.endsWith('/parse') ? json({message: 'Invalid params'}, 400) : json({items: []}))
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls'], fixture.config)
    expect(result.error?.message).to.contain('Invalid params')
    expect(fixture.calls.at(-1)?.url.pathname).to.match(/\/parse$/)
  })

  /** The template route answers the save with `refusal`; parse succeeds, as it does on the platform. */
  const refusedSave = (refusal: unknown) => fixture.route((url, method) => {
    if (url.pathname.endsWith('/check')) return json({items: [], templates: [readyTemplate]})
    if (url.pathname.endsWith('/parse')) return json({policy: {key: 'SAFE-001-3'}, rule_warnings: [], source: 'canonical source'})
    if (method === 'GET') return json({items: [], nextPage: null})
    return json(refusal, 400)
  })

  it('words an exact-copy refusal itself: the key it tried, the policy that has the rules, what to change', async () => {
    const message = 'A policy with exactly these rules already exists: SAFE-001. Change a parameter or scope to add another.'
    refusedSave({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {code: 'policy_duplicate', existing_id: 4, existing_key: 'SAFE-001', policies: [{existing_id: 4, existing_key: 'SAFE-001', key: 'SAFE-001-3'}]}})
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.equal('Policy SAFE-001-3 was not created: its rules exactly match SAFE-001, which this branch already has. '
      + 'Change a parameter or scope to add a different policy (for policy create, --param N.path=JSON); its key does not count.')
    expect(result.error?.message).not.to.contain('ERROR_CODE').and.not.to.contain('request failed')
  })

  it('words a taken-key refusal itself: the key it tried and the policy that holds it', async () => {
    const message = 'A policy with key "SAFE-001" already exists on this branch (policy id 4). To change it, update policy id 4 instead of creating a new one.'
    refusedSave({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {code: 'policy_key_taken', existing_id: 4, existing_key: 'SAFE-001', key: 'safe-001'}})
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls', '--key', 'safe-001'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.equal('Policy safe-001 was not saved: this branch already has SAFE-001 (policy id 4). '
      + 'Choose a key no policy has (for policy create, --key), or update SAFE-001 with policy publish.')
  })

  it('keeps the platform message for a refusal whose payload does not name the policy', async () => {
    const message = 'A policy with exactly these rules already exists: SAFE-001. Change a parameter or scope to add another.'
    refusedSave({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {code: 'policy_duplicate'}})
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls'], fixture.config)
    expect(result.error?.message).to.equal(`Policy request failed (400): ERROR_CODE_BAD_REQUEST: ${message}`)
  })

  it('keeps the platform message for a taken-key refusal whose payload does not name the policy', async () => {
    const message = 'A policy with key "SAFE-001" already exists on this branch.'
    refusedSave({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {code: 'policy_key_taken', existing_id: null}})
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls'], fixture.config)
    expect(result.error?.message).to.equal(`Policy request failed (400): ERROR_CODE_BAD_REQUEST: ${message}`)
  })

  it('keeps the -o json error envelope for an exact-copy refusal, with the plain sentence as its message', async () => {
    const message = 'A policy with exactly these rules already exists: SAFE-001. Change a parameter or scope to add another.'
    refusedSave({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {code: 'policy_duplicate', existing_id: 4, existing_key: 'SAFE-001', policies: [{existing_id: 4, existing_key: 'SAFE-001', key: 'SAFE-001-3'}]}})
    const result = await runCommand(['policy', 'create', '--template', 'safe_calls', '-o', 'json'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(JSON.parse(result.stdout)).to.deep.equal({error: {exit: 1, message: 'Policy SAFE-001-3 was not created: its rules exactly match SAFE-001, which this branch already has. '
      + 'Change a parameter or scope to add a different policy (for policy create, --param N.path=JSON); its key does not count.'}})
  })
})
