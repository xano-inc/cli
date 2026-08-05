import {expect} from 'chai'

import {filterChangedEntries, findMultiDocEntries} from '../../src/utils/multidoc-push.js'

describe('multidoc-push helpers', () => {
  describe('findMultiDocEntries', () => {
    it('flags a file holding multiple `---`-separated documents', () => {
      const entries = [
        {
          content: 'workspace w {\n}\n---\ntable documents {\n}\n---\nquery extract verb=POST {\n}\n',
          filePath: 'secret/bundle.xs',
        },
        {content: 'function ok {\n}\n', filePath: 'function/ok.xs'},
      ]
      const offenders = findMultiDocEntries(entries)
      expect(offenders).to.have.lengthOf(1)
      expect(offenders[0].filePath).to.equal('secret/bundle.xs')
      // 2 separators → 3 documents.
      expect(offenders[0].count).to.equal(3)
    })

    it('does not flag single-document files', () => {
      const entries = [
        {content: 'query documents verb=GET {\n  api_group = "pdf"\n}\n', filePath: 'api/pdf/documents_GET.xs'},
        {content: 'table documents {\n}\n', filePath: 'table/documents.xs'},
      ]
      expect(findMultiDocEntries(entries)).to.have.lengthOf(0)
    })

    it('only treats a bare `---` line as a separator (not `---` inside content)', () => {
      // A triple-dash embedded mid-line must not be mistaken for a doc boundary.
      const entries = [{content: 'query q verb=GET {\n  note = "a --- b"\n}\n', filePath: 'q.xs'}]
      expect(findMultiDocEntries(entries)).to.have.lengthOf(0)
    })
  })

  describe('filterChangedEntries', () => {
    // The dry-run preview buckets every trigger subtype under the generic `trigger`
    // type, while local documents carry the specific subtype (DEV-7084).
    it('keeps a trigger when the preview reports the generic `trigger` type', () => {
      const entries = [
        {content: 'error_trigger "Error Trigger" {\n}\n', filePath: 'workspace/trigger/error_trigger.xs'},
        {content: 'function unchanged_fn {\n}\n', filePath: 'function/unchanged_fn.xs'},
      ]
      const operations = [
        {action: 'create', name: 'Error Trigger', type: 'trigger'},
        {action: 'unchanged', name: 'unchanged_fn', type: 'function'},
      ]

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('workspace/trigger/error_trigger.xs')
    })

    it('matches every trigger subtype against the generic `trigger` bucket', () => {
      const subtypes = [
        'workspace_trigger',
        'error_trigger',
        'table_trigger',
        'agent_trigger',
        'mcp_server_trigger',
        'realtime_trigger',
      ]
      const entries = subtypes.map((type) => ({
        content: `${type} "${type} doc" {\n}\n`,
        filePath: `${type}.xs`,
      }))
      const operations = subtypes.map((type) => ({action: 'create', name: `${type} doc`, type: 'trigger'}))

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(subtypes.length)
    })

    it('drops unchanged documents', () => {
      const entries = [
        {content: 'function changed_fn {\n}\n', filePath: 'function/changed_fn.xs'},
        {content: 'function unchanged_fn {\n}\n', filePath: 'function/unchanged_fn.xs'},
      ]
      const operations = [
        {action: 'update', name: 'changed_fn', type: 'function'},
        {action: 'unchanged', name: 'unchanged_fn', type: 'function'},
      ]

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/changed_fn.xs')
    })

    it('matches API endpoints by name and verb', () => {
      const entries = [{content: 'query "users/{id}" verb=GET {\n}\n', filePath: 'api/users.xs'}]
      const operations = [{action: 'create', name: 'users/{id} GET', type: 'query'}]

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(1)
    })
  })
})
