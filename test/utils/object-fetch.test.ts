/* eslint-disable unicorn/consistent-function-scoping -- per-test fetch stubs close over case-specific data */
import {expect} from 'chai'

import {
  canUsePerObjectFetch,
  fetchFormattedObjects,
  insertGuidLine,
  lookupObjectId,
  OBJECT_TYPE_SPECS,
  type ObjectGet,
  readXanoscript,
  restoreGuidFromLocal,
} from '../../src/utils/object-fetch.js'
import {type SyncTargetIdentity, type SyncTargetState} from '../../src/utils/sync-state.js'

const target: SyncTargetIdentity = {
  branch: 'v1',
  branch_created_at: 'ts',
  instance_host: 'example.test',
  workspace_created_at: 'ts',
  workspace_id: '1',
}

function jsonOk(body: unknown, status = 200) {
  return {json: body, ok: status >= 200 && status < 300, status}
}

function xsBody(value: string, extra: Record<string, unknown> = {}) {
  return {branch: 'v1', guid: 'abc', xanoscript: {status: 'ok', value}, ...extra}
}

describe('object-fetch', () => {
  describe('URL building', () => {
    it('builds per-type object and list paths', () => {
      expect(OBJECT_TYPE_SPECS.function.objectPath('1', 92)).to.equal('/workspace/1/function/92')
      expect(OBJECT_TYPE_SPECS.table.listPath('1')).to.equal('/workspace/1/table')
      expect(OBJECT_TYPE_SPECS.query.listPath('1')).to.equal('/workspace/1/apigroup')
      expect(OBJECT_TYPE_SPECS.query.listPath('1', {groupId: 3})).to.equal('/workspace/1/apigroup/3/api')
      expect(OBJECT_TYPE_SPECS.query.objectPath('1', 16, {groupId: 3})).to.equal('/workspace/1/apigroup/3/api/16')
    })
  })

  describe('ID lookup', () => {
    it('keeps only the exact name when search returns several', async () => {
      const get: ObjectGet = async (pathname, query) => {
        expect(pathname).to.equal('/workspace/1/function')
        expect(query?.search).to.equal('foo')
        return jsonOk({
          items: [
            {id: 1, name: 'foo'},
            {id: 2, name: 'foo_dev'},
          ],
        })
      }

      const found = await lookupObjectId(get, '1', {name: 'foo', type: 'function'})
      expect(found).to.deep.equal({id: 1})
    })

    it('matches API endpoints by group, name, and verb', async () => {
      const get: ObjectGet = async (pathname, query) => {
        if (pathname === '/workspace/1/apigroup') {
          expect(query?.search).to.equal('Event Logs')
          return jsonOk({items: [{id: 3, name: 'Event Logs'}]})
        }

        expect(pathname).to.equal('/workspace/1/apigroup/3/api')
        expect(query?.search).to.equal('logs/user/my_events')
        return jsonOk({
          items: [
            {id: 16, name: 'logs/user/my_events', verb: 'GET'},
            {id: 17, name: 'logs/user/my_events', verb: 'POST'},
          ],
        })
      }

      const found = await lookupObjectId(get, '1', {
        apiGroup: 'Event Logs',
        name: 'logs/user/my_events',
        type: 'query',
        verb: 'GET',
      })
      expect(found).to.deep.equal({groupId: 3, id: 16})
    })
  })

  describe('guid restoration', () => {
    it('inserts the local guid before the final brace', () => {
      const local = 'function foo {\n  tags = ["a"]\n  guid = "abc"\n}'
      const remote = 'function foo {\n  tags = ["a"]\n}'
      expect(restoreGuidFromLocal(remote, local)).to.equal(local)
    })

    it('adds a blank line before guid when the previous line is a closing brace or bracket', () => {
      const local = 'function foo {\n  stack {\n  }\n\n  guid = "abc"\n}'
      const remote = 'function foo {\n  stack {\n  }\n}'
      expect(restoreGuidFromLocal(remote, local)).to.equal(local)
    })

    it('does not add a guid when the local file has none', () => {
      const remote = 'function foo {\n  tags = ["a"]\n}'
      expect(restoreGuidFromLocal(remote, 'function foo {\n  tags = ["a"]\n}')).to.equal(remote)
    })

    it('insertGuidLine is a no-op replacement when a guid already exists', () => {
      expect(insertGuidLine('function foo {\n  guid = "old"\n}', 'new')).to.include('guid = "new"')
    })
  })

  describe('readXanoscript', () => {
    it('rejects a non-ok status', () => {
      const result = readXanoscript({xanoscript: {status: 'error', value: 'nope'}})
      expect(result).to.deep.equal({error: 'xanoscript.status is error'})
    })
  })

  describe('fetchFormattedObjects', () => {
    const functionDoc = 'function foo {\n  tags = ["a"]\n  guid = "abc"\n}'
    const pushed = [{content: functionDoc, filePath: '/tmp/foo.xs', relPath: 'function/foo.xs'}]
    const state: SyncTargetState = {
      ...target,
      files: {
        'function/foo.xs': {id: 92, key: 'function:foo', sha256: 'aa'.repeat(32)},
      },
    }

    it('fetches by cached id and restores the guid', async () => {
      const get: ObjectGet = async (pathname) => {
        expect(pathname).to.equal('/workspace/1/function/92')
        return jsonOk(xsBody('function foo {\n  tags = ["a"]\n}'))
      }

      const result = await fetchFormattedObjects({
        get,
        isLiveBranch: true,
        pushed,
        state,
        target,
        workspaceId: '1',
      })
      expect(result.ok).to.equal(true)
      if (!result.ok) return
      expect(result.results[0].content).to.equal(functionDoc)
      expect(result.ids['function/foo.xs']?.id).to.equal(92)
    })

    it('discards a cached id whose stored key no longer matches', async () => {
      const paths: string[] = []
      const get: ObjectGet = async (pathname) => {
        paths.push(pathname)
        if (pathname === '/workspace/1/function') {
          return jsonOk({items: [{id: 99, name: 'foo'}]})
        }

        return jsonOk(xsBody('function foo {\n  tags = ["a"]\n}'))
      }

      const result = await fetchFormattedObjects({
        get,
        isLiveBranch: true,
        pushed,
        state: {
          ...state,
          files: {
            'function/foo.xs': {id: 92, key: 'function:other', sha256: 'aa'.repeat(32)},
          },
        },
        target,
        workspaceId: '1',
      })
      expect(result.ok).to.equal(true)
      expect(paths).to.include('/workspace/1/function')
      expect(paths).to.include('/workspace/1/function/99')
    })

    it('falls back when the fetched key does not match', async () => {
      const get: ObjectGet = async () => jsonOk(xsBody('function other {\n  tags = ["a"]\n}'))
      const result = await fetchFormattedObjects({
        get,
        isLiveBranch: true,
        pushed,
        state,
        target,
        workspaceId: '1',
      })
      expect(result.ok).to.equal(false)
      if (result.ok) return
      expect(result.reason).to.include('fetched key')
    })

    it('falls back when the response branch does not match', async () => {
      const get: ObjectGet = async () => jsonOk(xsBody('function foo {\n  tags = ["a"]\n}', {branch: 'v2'}))
      const result = await fetchFormattedObjects({
        get,
        isLiveBranch: true,
        pushed,
        state,
        target,
        workspaceId: '1',
      })
      expect(result.ok).to.equal(false)
      if (result.ok) return
      expect(result.reason).to.include('branch')
    })

    it('uses the full export on a non-live branch for types without a branch field', () => {
      const table = 'table users {\n  guid = "t"\n}'
      const gate = canUsePerObjectFetch({
        isLiveBranch: false,
        pushed: [{content: table, filePath: '/tmp/users.xs', relPath: 'table/users.xs'}],
      })
      expect(gate.ok).to.equal(false)
      if (gate.ok) return
      expect(gate.reason).to.include('non-live branch')
    })

    const many = (count: number) =>
      Array.from({length: count}, (_, i) => ({
        content: `function f${i} {\n}`,
        filePath: `/tmp/f${i}.xs`,
        relPath: `function/f${i}.xs`,
      }))

    it('uses the default limit of 25 when no limit is given', () => {
      expect(canUsePerObjectFetch({isLiveBranch: true, pushed: many(25)}).ok).to.equal(true)
      const over = canUsePerObjectFetch({isLiveBranch: true, pushed: many(26)})
      expect(over.ok).to.equal(false)
      if (over.ok) return
      expect(over.reason).to.equal('push has 26 documents (limit 25)')
    })

    it('honors a custom limit', () => {
      expect(canUsePerObjectFetch({isLiveBranch: true, limit: 50, pushed: many(29)}).ok).to.equal(true)
      const over = canUsePerObjectFetch({isLiveBranch: true, limit: 10, pushed: many(11)})
      expect(over.ok).to.equal(false)
      if (over.ok) return
      expect(over.reason).to.equal('push has 11 documents (limit 10)')
    })

    it('falls back when xanoscript.status is not ok', async () => {
      const get: ObjectGet = async () => jsonOk({branch: 'v1', xanoscript: {status: 'error'}})
      const result = await fetchFormattedObjects({
        get,
        isLiveBranch: true,
        pushed,
        state,
        target,
        workspaceId: '1',
      })
      expect(result.ok).to.equal(false)
    })
  })
})
