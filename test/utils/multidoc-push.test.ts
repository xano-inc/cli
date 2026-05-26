import {expect} from 'chai'

import {
  countSummaryChanges,
  filterChangedEntries,
  findLocalWorkspaceName,
  WORKSPACE_MISMATCH_THRESHOLD,
} from '../../src/utils/multidoc-push.js'

describe('multidoc-push helpers', () => {
  describe('countSummaryChanges', () => {
    const summary = {
      function: {created: 2, deleted: 5, truncated: 0, updated: 3},
      table: {created: 1, deleted: 4, truncated: 1, updated: 1},
    }

    it('omits deleted counts when shouldDelete is false', () => {
      // 2+3+0 + 1+1+1 = 8
      expect(countSummaryChanges(summary, false)).to.equal(8)
    })

    it('includes deleted counts when shouldDelete is true', () => {
      // 2+3+5+0 + 1+1+4+1 = 17
      expect(countSummaryChanges(summary, true)).to.equal(17)
    })

    it('returns 0 for an empty summary', () => {
      expect(countSummaryChanges({}, true)).to.equal(0)
    })
  })

  describe('findLocalWorkspaceName', () => {
    it('returns the workspace name when a workspace document is present', () => {
      const entries = [
        {content: 'function foo {\n}\n', filePath: 'function/foo.xs'},
        {content: 'workspace my_ws {\n}\n', filePath: 'workspace.xs'},
      ]
      expect(findLocalWorkspaceName(entries)).to.equal('my_ws')
    })

    it('returns null when no workspace document exists', () => {
      const entries = [
        {content: 'function foo {\n}\n', filePath: 'function/foo.xs'},
        {content: 'table users {\n}\n', filePath: 'table/users.xs'},
      ]
      expect(findLocalWorkspaceName(entries)).to.be.null
    })

    it('returns null for an empty entry list', () => {
      expect(findLocalWorkspaceName([])).to.be.null
    })

    it('returns the first workspace name when multiple are present', () => {
      const entries = [
        {content: 'workspace first {\n}\n', filePath: 'a.xs'},
        {content: 'workspace second {\n}\n', filePath: 'b.xs'},
      ]
      expect(findLocalWorkspaceName(entries)).to.equal('first')
    })

    it('handles quoted workspace names', () => {
      const entries = [{content: 'workspace "my workspace" {\n}\n', filePath: 'workspace.xs'}]
      expect(findLocalWorkspaceName(entries)).to.equal('my workspace')
    })
  })

  describe('WORKSPACE_MISMATCH_THRESHOLD', () => {
    it('is set to 10', () => {
      // Lock the threshold so a silent change away from the documented value is caught.
      expect(WORKSPACE_MISMATCH_THRESHOLD).to.equal(10)
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
