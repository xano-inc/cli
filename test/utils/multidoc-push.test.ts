import {expect} from 'chai'

import {filterChangedEntries} from '../../src/utils/multidoc-push.js'

describe('multidoc-push helpers', () => {
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
