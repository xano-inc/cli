import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../../helpers/policy-fixture.js'

const event = (id: number, extra: Record<string, unknown> = {}) => ({
  app_name: 'xano',
  changed: ['name'],
  client_addr: null,
  context: {source: 'api'},
  created_at: 1_763_200_000_000 + id,
  db_user: 'tenant_rw',
  id,
  new: {id: 1, name: `n${id}`},
  old: {id: 1, name: `o${id}`},
  op: 'update',
  record_id: '1',
  tx_id: 7000 + id,
  ...extra,
})

describe('table audit', () => {
  const fixture = policyFixture()
  const audit = (...argv: string[]) => runCommand(['table', 'audit', ...argv], fixture.config)
  const auditCalls = () => fixture.calls.filter((call) => call.url.pathname.endsWith('/audit'))

  /** The route paged by cursor: three pages of two events (6..1), newest first. */
  const pagedRoute = () =>
    fixture.route((url) => {
      if (!url.pathname.endsWith('/audit')) return json({message: 'unexpected'}, 404)
      const before = url.searchParams.get('before')
      const pages: Record<string, {items: unknown[]; next: null | number}> = {
        '': {items: [event(6), event(5)], next: 5},
        3: {items: [event(2), event(1)], next: null},
        5: {items: [event(4), event(3)], next: 3},
      }
      const page = pages[before ?? '']
      return json({available: true, enabled: true, log_table: null, ...page})
    })

  it('fetches one page by table ID with no filters', async () => {
    pagedRoute()
    const result = await audit('42')
    expect(result.error).to.equal(undefined)
    expect(auditCalls()).to.have.length(1)
    const [call] = auditCalls()
    expect(call.method).to.equal('GET')
    expect(call.url.pathname).to.equal('/api:meta/workspace/1/table/42/audit')
    expect(Object.fromEntries(call.url.searchParams)).to.deep.equal({limit: '50'})
    expect(call.headers).not.to.have.property('x-data-source')

    const output = JSON.parse(result.stdout)
    expect(output.items.map((item: {id: number}) => item.id)).to.deep.equal([6, 5])
    expect(output.next).to.equal(5)
    expect(output.enabled).to.equal(true)
    expect(output.available).to.equal(true)
    expect(result.stderr).to.contain('rerun with --before 5')
  })

  it('maps the filters to query params and --datasource to x-data-source', async () => {
    pagedRoute()
    await audit('42', '--record', '17', '--op', 'delete', '--limit', '100', '--before', '5', '--datasource', 'test')
    const [call] = auditCalls()
    expect(Object.fromEntries(call.url.searchParams)).to.deep.equal({before: '5', limit: '100', op: 'delete', record_id: '17'})
    expect(call.headers['x-data-source']).to.equal('test')
  })

  it('follows next until done with --all', async () => {
    pagedRoute()
    const result = await audit('42', '--all', '--limit', '2')
    expect(result.error).to.equal(undefined)
    expect(auditCalls().map((call) => call.url.searchParams.get('before'))).to.deep.equal([null, '5', '3'])
    expect(auditCalls().every((call) => call.url.searchParams.get('limit') === '2')).to.equal(true)

    const output = JSON.parse(result.stdout)
    expect(output.items.map((item: {id: number}) => item.id)).to.deep.equal([6, 5, 4, 3, 2, 1])
    expect(output.next).to.equal(null)
    expect(result.stderr).not.to.contain('rerun with')
  })

  it('stops --all when the cursor does not move', async () => {
    fixture.route(() => json({enabled: true, items: [event(9)], next: 9}))
    const result = await audit('42', '--all', '--before', '9')
    expect(result.error).to.equal(undefined)
    expect(auditCalls()).to.have.length(1)
  })

  it('writes csv, one row per event across pages', async () => {
    pagedRoute()
    const result = await audit('42', '--all', '-o', 'csv')
    expect(result.error).to.equal(undefined)
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines[0]).to.equal('id,created_at,tx_id,op,record_id,changed,old,new,context,db_user,app_name,client_addr')
    expect(lines).to.have.length(7)
    expect(lines[1]).to.equal(
      '6,2025-11-15T09:46:40.006Z,7006,update,1,"[""name""]","{""id"":1,""name"":""o6""}","{""id"":1,""name"":""n6""}","{""source"":""api""}",tenant_rw,xano,',
    )
  })

  it('writes the export to --file and reports the count', async () => {
    pagedRoute()
    const file = path.join(fixture.directory, 'audit_out.csv')
    const result = await audit('42', '--all', '-o', 'csv', '--file', file)
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain(`Saved 6 events to ${file}`)
    expect(fs.readFileSync(file, 'utf8').split('\n')).to.have.length(8)
  })

  it('resolves a table name to its ID through the table list', async () => {
    fixture.route((url) => {
      if (url.pathname.endsWith('/table')) {
        return json({curPage: 1, items: [{id: 7, name: 'users_archive'}, {id: 8, name: 'users'}], nextPage: null})
      }

      return json({enabled: true, items: [], next: null})
    })
    const result = await audit('users')
    expect(result.error).to.equal(undefined)
    const lookup = fixture.calls[0]
    expect(lookup.url.pathname).to.equal('/api:meta/workspace/1/table')
    expect(lookup.url.searchParams.get('search')).to.equal('users')
    expect(auditCalls()[0].url.pathname).to.equal('/api:meta/workspace/1/table/8/audit')
  })

  it('fails clearly when no table has that name', async () => {
    fixture.route(() => json({items: [{id: 7, name: 'users_archive'}]}))
    const result = await audit('users')
    expect(result.error?.message).to.equal("Table 'users' not found in workspace 1.")
    expect(auditCalls()).to.have.length(0)
  })

  it('warns on stderr when auditing is off, naming the plan when it is unavailable', async () => {
    fixture.route(() => json({available: false, enabled: false, items: [], next: null}))
    const result = await audit('42')
    expect(result.error).to.equal(undefined)
    const stderr = result.stderr.replaceAll(/\s+›?\s*/g, ' ')
    expect(stderr).to.contain("Auditing is off for table '42'")
    expect(stderr).to.contain('Upgrade to Pro or above to audit a table.')
    expect(JSON.parse(result.stdout).items).to.deep.equal([])
  })

  it('prints the API message on an error', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: 'Unable to locate table.'}, 404))
    const result = await audit('42')
    expect(result.error?.message).to.equal('Unable to locate table.')
  })

  it('prints the plan message for an audit_plan_required refusal', async () => {
    fixture.route(() =>
      json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Access denied.', payload: {code: 'audit_plan_required'}}, 403),
    )
    const result = await audit('42')
    expect(result.error?.message).to.equal(
      'Content Record Audit is not included in this plan. Upgrade to Pro or above to audit a table.',
    )
  })

  it('rejects a --limit above the route maximum', async () => {
    const result = await audit('42', '--limit', '101')
    expect(result.error?.message).to.contain('101')
    expect(fixture.calls).to.have.length(0)
  })
})
