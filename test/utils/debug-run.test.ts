/* eslint-disable camelcase */
import {expect} from 'chai'

import {
  buildDebugQuery,
  findEntryInDocs,
  isEnvDocument,
  isUuid,
  partitionEnvDocs,
  renderDebugGetSummary,
  renderDebugRunSummary,
} from '../../src/utils/debug-run.js'

describe('debug-run helpers', () => {
  describe('buildDebugQuery', () => {
    it('always sends entry_obj_type and entry_obj_name', () => {
      const query = buildDebugQuery({entryObjName: 'calcScore', entryObjType: 'function'})
      expect([...query.entries()]).to.deep.equal([
        ['entry_obj_type', 'function'],
        ['entry_obj_name', 'calcScore'],
      ])
    })

    it('omits empty optionals entirely', () => {
      const query = buildDebugQuery({
        branch: '',
        bypassSizeLimit: false,
        debugId: undefined,
        entryObjName: 'calcScore',
        entryObjType: 'function',
        entryObjVerb: '',
        input: {},
      })
      expect([...query.keys()]).to.deep.equal(['entry_obj_type', 'entry_obj_name'])
    })

    it('JSON-encodes input only when it has keys', () => {
      const query = buildDebugQuery({
        entryObjName: '/users',
        entryObjType: 'query',
        input: {age: 30, email: 'jo@x.com'},
      })
      expect(query.get('input')).to.equal(JSON.stringify({age: 30, email: 'jo@x.com'}))
    })

    it('includes verb, debug_id, bypass_size_limit and branch when supplied', () => {
      const query = buildDebugQuery({
        branch: 'dev',
        bypassSizeLimit: true,
        debugId: '018f3a6e-1111-4222-8333-444455556666',
        entryObjName: '/users',
        entryObjType: 'query',
        entryObjVerb: 'GET',
      })
      expect(query.get('entry_obj_verb')).to.equal('GET')
      expect(query.get('debug_id')).to.equal('018f3a6e-1111-4222-8333-444455556666')
      expect(query.get('bypass_size_limit')).to.equal('true')
      expect(query.get('branch')).to.equal('dev')
      expect(query.get('input')).to.equal(null)
    })
  })

  describe('isUuid', () => {
    it('accepts canonical uuids (case-insensitive)', () => {
      expect(isUuid('018f3a6e-1111-4222-8333-444455556666')).to.equal(true)
      expect(isUuid('018F3A6E-1111-4222-8333-444455556666')).to.equal(true)
    })

    it('rejects non-uuid strings', () => {
      expect(isUuid('')).to.equal(false)
      expect(isUuid('not-a-uuid')).to.equal(false)
      expect(isUuid('018f3a6e1111422283334444555566')).to.equal(false)
      expect(isUuid('018f3a6e-1111-4222-8333-44445555666g')).to.equal(false)
      expect(isUuid(' 018f3a6e-1111-4222-8333-444455556666')).to.equal(false)
    })
  })

  describe('findEntryInDocs', () => {
    const entries = [
      {content: 'function calcScore {\n}\n', filePath: 'function/calc_score.xs'},
      {content: 'query "/users" verb=GET {\n}\n', filePath: 'api/users_get.xs'},
      {content: 'query "/users" verb=POST {\n}\n', filePath: 'api/users_post.xs'},
      {content: 'table_trigger on_insert {\n}\n', filePath: 'table/trigger/on_insert.xs'},
    ]

    it('matches by type and name', () => {
      const result = findEntryInDocs(entries, 'function', 'calcScore')
      expect(result.found).to.equal(true)
      expect(result.suggestions).to.deep.equal([])
    })

    it('matches with a case-insensitive verb when supplied', () => {
      expect(findEntryInDocs(entries, 'query', '/users', 'get').found).to.equal(true)
    })

    it('matches any verb variant when no verb is supplied', () => {
      expect(findEntryInDocs(entries, 'query', '/users').found).to.equal(true)
    })

    it('misses on a wrong verb and suggests the existing verbs', () => {
      const result = findEntryInDocs(entries, 'query', '/users', 'DELETE')
      expect(result.found).to.equal(false)
      expect(result.suggestions).to.deep.equal(['query /users verb=GET', 'query /users verb=POST'])
    })

    it('misses on a wrong type', () => {
      expect(findEntryInDocs(entries, 'task', 'calcScore').found).to.equal(false)
    })

    it('suggests similar names of the same type', () => {
      const result = findEntryInDocs(entries, 'function', 'calc')
      expect(result.found).to.equal(false)
      expect(result.suggestions).to.deep.equal(['function calcScore'])
    })

    it('matches trigger subtypes against the generic trigger type', () => {
      expect(findEntryInDocs(entries, 'trigger', 'on_insert').found).to.equal(true)
    })
  })

  describe('env document detection', () => {
    const envDoc = 'workspace "todo" {\n  description = ""\n  env = {\n    API_KEY = "secret"\n  }\n}\n'
    const plainWorkspaceDoc = 'workspace "todo" {\n  description = ""\n}\n'
    const functionDoc = 'function calcScore {\n  env = {\n  }\n}\n'

    it('detects a workspace doc carrying an env block', () => {
      expect(isEnvDocument(envDoc)).to.equal(true)
    })

    it('ignores workspace docs without env and non-workspace docs', () => {
      expect(isEnvDocument(plainWorkspaceDoc)).to.equal(false)
      expect(isEnvDocument(functionDoc)).to.equal(false)
    })

    it('partitions env-bearing docs from the rest', () => {
      const {envEntries, rest} = partitionEnvDocs([
        {content: envDoc, filePath: 'workspace/todo.xs'},
        {content: functionDoc, filePath: 'function/calc_score.xs'},
      ])
      expect(envEntries.map((e) => e.filePath)).to.deep.equal(['workspace/todo.xs'])
      expect(rest.map((e) => e.filePath)).to.deep.equal(['function/calc_score.xs'])
    })
  })

  describe('renderDebugRunSummary', () => {
    it('renders an ok envelope with result preview and fetch hint', () => {
      const lines = renderDebugRunSummary({
        debug_id: '018f3a6e-1111-4222-8333-444455556666',
        result: {score: 42},
        status: 'ok',
        timing: 1.234_567,
      })
      expect(lines[0]).to.equal('Status: ok')
      expect(lines[1]).to.equal('Timing: 1.235s')
      expect(lines[2]).to.equal('Debug ID: 018f3a6e-1111-4222-8333-444455556666')
      expect(lines).to.include('Result:')
      expect(lines.join('\n')).to.contain('"score": 42')
      expect(lines.at(-1)).to.equal('Fetch the full stack: xano debug get 018f3a6e-1111-4222-8333-444455556666')
    })

    it('renders an exception envelope with the exception headline', () => {
      const lines = renderDebugRunSummary({
        debug_id: '018f3a6e-1111-4222-8333-444455556666',
        exception: {message: 'Division by zero'},
        status: 'exception',
        timing: 0.5,
      })
      expect(lines[0]).to.equal('Status: exception')
      expect(lines).to.include('Exception: Division by zero')
      expect(lines.join('\n')).to.not.contain('Result:')
    })

    it('renders a status:exception envelope missing the exception field without printing "undefined"', () => {
      const lines = renderDebugRunSummary({
        debug_id: '018f3a6e-1111-4222-8333-444455556666',
        status: 'exception',
        timing: 0.1,
      })
      expect(lines).to.include('Exception: (no exception details provided)')
      expect(lines.join('\n')).to.not.contain('undefined')
    })

    it('explains a null debug_id and includes the warning', () => {
      const lines = renderDebugRunSummary({
        debug_id: null,
        result: 1,
        status: 'ok',
        timing: 0.1,
        warning: 'persist failed',
      })
      expect(lines).to.include('Debug ID: (not persisted — full stack unavailable)')
      expect(lines).to.include('Warning: persist failed')
      expect(lines.join('\n')).to.not.contain('xano debug get')
    })

    it('truncates oversized result previews', () => {
      const lines = renderDebugRunSummary({
        debug_id: '018f3a6e-1111-4222-8333-444455556666',
        result: {blob: 'x'.repeat(5000)},
        status: 'ok',
        timing: 0.1,
      })
      expect(lines.join('\n')).to.contain('truncated preview — use -o json for the full result')
    })
  })

  describe('renderDebugGetSummary', () => {
    it('renders entry metadata, statement count and lifecycle timestamps', () => {
      const lines = renderDebugGetSummary({
        created_at: '2026-07-08T00:00:00Z',
        debug_id: '018f3a6e-1111-4222-8333-444455556666',
        entry_obj_name: '/users',
        entry_obj_type: 'query',
        entry_obj_verb: 'GET',
        expires_at: '2026-07-15T00:00:00Z',
        stack: [{}, {}, {}],
        status: 'ok',
        timing: 2,
      })
      expect(lines).to.deep.equal([
        'Status: ok',
        'Timing: 2.000s',
        'Entry: query /users GET',
        'Statements: 3',
        'Created: 2026-07-08T00:00:00Z',
        'Expires: 2026-07-15T00:00:00Z',
      ])
    })

    it('explains maxed and truncated flags with their remedies', () => {
      const lines = renderDebugGetSummary({maxed: true, stack: [], status: 'ok', timing: 1, truncated: true})
      const text = lines.join('\n')
      expect(text).to.contain('{{too_large}}')
      expect(text).to.contain('--bypass-size-limit')
      expect(text).to.contain('largest values were dropped')
    })

    it('includes the exception headline for a failed run', () => {
      const lines = renderDebugGetSummary({
        exception: {message: 'Missing param: email'},
        stack: [{}],
        status: 'exception',
        timing: 0.2,
      })
      expect(lines).to.include('Exception: Missing param: email')
    })
  })
})
