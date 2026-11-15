import {expect} from 'chai'

import {argvWritesFile} from '../../src/commands/table/audit/index.js'
import {
  AUDIT_CSV_COLUMNS,
  AUDIT_PLAN_REQUIRED_MESSAGE,
  auditEventsToCsv,
  auditPlanRequiredMessage,
  buildAuditQuery,
  csvField,
  normalizeAuditPage,
} from '../../src/utils/table-audit.js'

describe('table audit helpers', () => {
  describe('buildAuditQuery', () => {
    const cases: Array<[string, Parameters<typeof buildAuditQuery>[0], Record<string, string>]> = [
      ['sends nothing when no filter is given', {}, {}],
      ['maps --record to record_id', {record: '17'}, {record_id: '17'}],
      ['drops an empty record', {record: ''}, {}],
      ['maps --op, --before and --limit', {before: 900, limit: 100, op: 'update'}, {before: '900', limit: '100', op: 'update'}],
    ]

    for (const [name, query, expected] of cases) {
      it(name, () => {
        expect(Object.fromEntries(buildAuditQuery(query))).to.deep.equal(expected)
      })
    }
  })

  describe('normalizeAuditPage', () => {
    it('keeps the route fields and defaults items and next', () => {
      expect(normalizeAuditPage({available: true, enabled: true, log_table: null})).to.deep.equal({
        available: true,
        enabled: true,
        items: [],
        log_table: null,
        next: null,
      })
    })

    it('treats a non-object body as an empty page', () => {
      expect(normalizeAuditPage(null)).to.deep.equal({items: [], next: null})
    })
  })

  describe('csvField', () => {
    const cases: Array<[unknown, string]> = [
      [null, ''],
      [undefined, ''],
      [42, '42'],
      ['plain', 'plain'],
      ['a,b', '"a,b"'],
      ['say "hi"', '"say ""hi"""'],
      ['two\nlines', '"two\nlines"'],
      [{a: 1, b: 'x,y'}, '"{""a"":1,""b"":""x,y""}"'],
      [['name', 'email'], '"[""name"",""email""]"'],
    ]

    for (const [value, expected] of cases) {
      it(`writes ${JSON.stringify(value)} as ${JSON.stringify(expected)}`, () => {
        expect(csvField(value)).to.equal(expected)
      })
    }
  })

  describe('auditEventsToCsv', () => {
    it('writes only the header for no events', () => {
      expect(auditEventsToCsv([])).to.equal(`${AUDIT_CSV_COLUMNS.join(',')}\n`)
    })

    it('writes one row per event with ISO times and JSON nested values', () => {
      const csv = auditEventsToCsv([
        {
          app_name: 'xano',
          changed: ['email'],
          client_addr: null,
          context: {source: 'api', user: {id: 3}},
          created_at: 1_763_200_000_123,
          db_user: 'tenant_rw',
          id: 501,
          new: {email: 'b@x.com', id: 17},
          old: {email: 'a@x.com', id: 17},
          op: 'update',
          record_id: '17',
          tx_id: 9001,
        },
      ])
      const [header, row, trailing] = csv.split('\n')
      expect(header).to.equal('id,created_at,tx_id,op,record_id,changed,old,new,context,db_user,app_name,client_addr')
      expect(row).to.equal(
        '501,2025-11-15T09:46:40.123Z,9001,update,17,"[""email""]",' +
          '"{""email"":""a@x.com"",""id"":17}","{""email"":""b@x.com"",""id"":17}",' +
          '"{""source"":""api"",""user"":{""id"":3}}",tenant_rw,xano,',
      )
      expect(trailing).to.equal('')
    })
  })

  describe('auditPlanRequiredMessage', () => {
    it('names the plan for an audit_plan_required refusal', () => {
      const body = {code: 'ERROR_CODE_ACCESS_DENIED', message: 'x', payload: {code: 'audit_plan_required'}}
      expect(auditPlanRequiredMessage(body)).to.equal(AUDIT_PLAN_REQUIRED_MESSAGE)
    })

    for (const body of [null, 'text', {}, {payload: null}, {payload: {code: 'policy_gate'}}, {code: 'audit_plan_required'}]) {
      it(`ignores ${JSON.stringify(body)}`, () => {
        expect(auditPlanRequiredMessage(body)).to.equal(undefined)
      })
    }
  })

  describe('argvWritesFile', () => {
    const cases: Array<[string[], boolean]> = [
      [['users'], false],
      [['users', '-o', 'csv'], false],
      [['users', '-f', 'out.csv'], true],
      [['users', '--file', 'out.csv'], true],
      [['users', '--file=out.csv'], true],
    ]

    for (const [argv, expected] of cases) {
      it(`${argv.join(' ')} -> ${expected}`, () => {
        expect(argvWritesFile(argv)).to.equal(expected)
      })
    }
  })
})
