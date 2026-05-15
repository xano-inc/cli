import {expect} from 'chai'

import {
  countSummaryChanges,
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
})
