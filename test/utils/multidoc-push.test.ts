import {expect} from 'chai'

import {filterChangedEntries, renderBadReferences, renderUnverifiedReferences} from '../../src/utils/multidoc-push.js'

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

  const sampleBadRefs = [
    {
      source: 'say',
      sourceType: 'function',
      statementType: 'function.run',
      target: 'chat_record',
      targetType: 'function',
    },
  ]

  describe('renderUnverifiedReferences', () => {
    // DEV-7772: the force-path fallback (server could not be consulted) must NOT claim the referenced
    // objects are missing — it only notes they were not part of this push.
    it('uses non-alarming wording that never asserts the object is missing', () => {
      const lines: string[] = []
      renderUnverifiedReferences(sampleBadRefs, (msg) => lines.push(msg))
      const output = lines.join('\n')

      expect(output).to.include('not included in this push')
      expect(output).to.include('assumed to exist')
      expect(output).to.not.include('does not exist')
      expect(output).to.not.include('placeholder')
    })
  })

  describe('renderBadReferences', () => {
    // The accurate message is preserved for genuine unresolved references (server was consulted).
    it('keeps the "does not exist" / placeholder wording for genuine unresolved references', () => {
      const lines: string[] = []
      renderBadReferences(sampleBadRefs, (msg) => lines.push(msg))
      const output = lines.join('\n')

      expect(output).to.include('does not exist')
      expect(output).to.include('placeholder')
    })
  })
})
