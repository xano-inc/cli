/* eslint-disable unicorn/filename-case -- CLAUDE.md requires underscore filenames. */
import {captureOutput, runCommand} from '@oclif/test'
import {expect} from 'chai'

import PolicyCreate from '../../src/commands/policy/create/index.js'
import {json, policyFixture} from '../helpers/policy-fixture.js'

const ready_goal = {goal: 'No unsafe calls', id: 'safe_calls', key: 'SAFE-001', rules: [{check: 'stack.statement_forbidden', needs: [], params: {statements: ['db.truncate']}, title: ''}], severity: 'high', summary: 'Keep stored data.'}
const needs_goal = {...ready_goal, id: 'custom', rules: [{check: 'table.coverage_required', needs: ['table_selector.has_field'], params: {}, title: ''}]}

describe('policy create from a platform goal', () => {
  const fixture = policyFixture()
  const created = {id: 9, key: 'SAFE-001', version: 1}

  beforeEach(() => {
    fixture.route((url, method) => {
      if (url.pathname.endsWith('/check')) return json({goals: [ready_goal, needs_goal], items: []})
      if (url.pathname.endsWith('/parse')) return json({policy: {key: 'SAFE-001'}, rule_warnings: [], source: 'canonical source'})
      if (method === 'GET') return json({items: [], nextPage: null})
      return json(created)
    })
  })

  it('creates from the live catalogue, validates natively, and saves canonical source on the selected branch', async () => {
    const result = await runCommand(['policy', 'create', '--goal', 'safe_calls', '-b', 'scratch', '-o', 'json', '-m', 'Started'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal(created)
    const parsed = fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!
    expect(JSON.parse(parsed.body!).data).to.deep.equal({key: 'SAFE-001', rules: [{check: 'stack.statement_forbidden', params: {statements: ['db.truncate']}, title: ''}], severity: 'high', statement: 'Keep stored data.', title: 'No unsafe calls'})
    const write = fixture.calls.at(-1)!
    expect(write.method).to.equal('POST')
    expect(write.url.searchParams.get('branch')).to.equal('scratch')
    expect(JSON.parse(write.body!)).to.deep.equal({data: {source: 'canonical source'}, message: 'Started'})
  })

  it('refuses missing goal needs before a parse or write and names how to supply them', async () => {
    const result = await runCommand(['policy', 'create', '--goal', 'custom'], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.contain('1.table_selector.has_field')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('fills nested parameters with typed JSON, keeping unrelated seed values', async () => {
    const result = await captureOutput(() => PolicyCreate.run(['--goal', 'custom', '--key', 'MY-KEY', '--param', '1.table_selector.has_field="created_at"'], fixture.config))
    expect(result.error).to.equal(undefined)
    const document = JSON.parse(fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!.body!).data
    expect(document.key).to.equal('MY-KEY')
    expect(document.rules[0].params).to.deep.equal({table_selector: {has_field: 'created_at'}})
  })

  it('refuses unknown goals without writing', async () => {
    const result = await runCommand(['policy', 'create', '--goal', 'missing'], fixture.config)
    expect(result.error?.message).to.contain('Unknown goal')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('checks every list page for case-insensitive key collisions and chooses a free suffix', async () => {
    fixture.route((url, method) => {
      if (url.pathname.endsWith('/check')) return json({goals: [ready_goal]})
      if (url.pathname.endsWith('/parse')) return json({policy: {key: 'SAFE-001-3'}, source: 'canonical source'})
      if (method === 'GET') return url.searchParams.get('page') === '2' ? json({items: [{key: 'SAFE-001-2'}], nextPage: null}) : json({items: [{key: 'safe-001'}], nextPage: 2})
      return json(created)
    })
    const result = await runCommand(['policy', 'create', '--goal', 'safe_calls'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(fixture.calls.find(call => call.url.pathname.endsWith('/parse'))!.body!).data.key).to.equal('SAFE-001-3')
  })

  it('refuses an explicitly taken key instead of updating it', async () => {
    fixture.route(url => url.pathname.endsWith('/check') ? json({goals: [ready_goal]}) : json({items: [{key: 'taken'}]}))
    const result = await runCommand(['policy', 'create', '--goal', 'safe_calls', '--key', 'TAKEN'], fixture.config)
    expect(result.error?.message).to.contain('already exists')
    expect(fixture.calls.every(call => call.method === 'GET')).to.equal(true)
  })

  it('stops at a native validation refusal', async () => {
    fixture.route(url => url.pathname.endsWith('/check') ? json({goals: [ready_goal]}) : url.pathname.endsWith('/parse') ? json({message: 'Invalid params'}, 400) : json({items: []}))
    const result = await runCommand(['policy', 'create', '--goal', 'safe_calls'], fixture.config)
    expect(result.error?.message).to.contain('Invalid params')
    expect(fixture.calls.at(-1)?.url.pathname).to.match(/\/parse$/)
  })
})
