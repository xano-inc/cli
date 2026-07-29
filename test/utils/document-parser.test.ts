import {expect} from 'chai'
import snakeCase from 'lodash.snakecase'
import {posix} from 'node:path'

import {
  buildChannelServerResolver,
  channelPathSegments,
  type ParsedDocument,
  parseDocument,
  resolveDocumentPath,
} from '../../src/utils/document-parser.js'

// ── Helpers ────────────────────────────────────────────────────────────────

const OUT = '/out'

// Resolve a document's on-disk location using POSIX joins, so assertions are
// stable regardless of the host OS. `documents` seeds the channel→server map
// so message/channel nesting can resolve.
function place(doc: ParsedDocument, documents: ParsedDocument[] = [doc]): {baseName: string; typeDir: string} {
  const getChannelServer = buildChannelServerResolver(documents)
  return resolveDocumentPath(doc, OUT, {
    getApiGroupFolder: (name) => snakeCase(name),
    getChannelServer,
    join: posix.join,
    snakeCase,
  })
}

function doc(partial: Partial<ParsedDocument> & Pick<ParsedDocument, 'name' | 'type'>): ParsedDocument {
  return {content: '', ...partial}
}

// ── channelPathSegments ──────────────────────────────────────────────────────

describe('document-parser', () => {

  describe('channelPathSegments', () => {
    it('escapes brace params to brackets and snake_cases literals', () => {
      expect(channelPathSegments('rooms', snakeCase)).to.deep.equal(['rooms'])
      expect(channelPathSegments('rooms/{room_id}', snakeCase)).to.deep.equal(['rooms', '[room_id]'])
      expect(channelPathSegments('org/{org_id}/room/{id}', snakeCase)).to.deep.equal([
        'org',
        '[org_id]',
        'room',
        '[id]',
      ])
    })
  })

  // ── resolveDocumentPath: realtime v2 (the layout that regressed) ──────────────

  describe('resolveDocumentPath — realtime v2', () => {
    it('places a realtime_server under realtime/server/<name>/<name>.xs', () => {
      const {baseName, typeDir} = place(doc({name: 'chat', type: 'realtime_server'}))
      expect(typeDir).to.equal('/out/realtime/server/chat')
      expect(baseName).to.equal('chat')
    })

    it('nests a channel under its server, snake_casing the whole path', () => {
      const {baseName, typeDir} = place(doc({name: 'rooms/{room_id}', server: 'chat', type: 'channel'}))
      expect(typeDir).to.equal('/out/realtime/server/chat/channel/rooms_room_id')
      expect(baseName).to.equal('rooms_room_id')
    })

    it('nests a message in a message/ subfolder under its channel and server', () => {
      const channel = doc({name: 'rooms/{room_id}', server: 'chat', type: 'channel'})
      const message = doc({channel: 'rooms/{room_id}', name: 'post', type: 'message'})
      const {baseName, typeDir} = place(message, [channel, message])
      expect(typeDir).to.equal('/out/realtime/server/chat/channel/rooms_room_id/message')
      expect(baseName).to.equal('post')
    })

    it('does NOT flatten two channels\' same-named messages together (collision guard)', () => {
      const chatSay = doc({channel: 'lobby', name: 'say', type: 'message'})
      const roomSay = doc({channel: 'rooms/{room_id}', name: 'say', type: 'message'})
      const documents = [
        doc({name: 'lobby', server: 'chat', type: 'channel'}),
        doc({name: 'rooms/{room_id}', server: 'chat', type: 'channel'}),
        chatSay,
        roomSay,
      ]
      const a = place(chatSay, documents)
      const b = place(roomSay, documents)
      // Same leaf name, but distinct directories → no clobber.
      expect(a.baseName).to.equal('say')
      expect(b.baseName).to.equal('say')
      expect(a.typeDir).to.not.equal(b.typeDir)
      expect(a.typeDir).to.equal('/out/realtime/server/chat/channel/lobby/message')
      expect(b.typeDir).to.equal('/out/realtime/server/chat/channel/rooms_room_id/message')
    })

    it('falls back to the legacy flat channel/ layout when a channel has no server', () => {
      const {baseName, typeDir} = place(doc({name: 'rooms/{room_id}', type: 'channel'}))
      expect(typeDir).to.equal('/out/channel/rooms/[room_id]')
      expect(baseName).to.equal('_channel')
    })

    it('falls back to the flat channel/ layout for a message whose channel-server is unresolved', () => {
      const {typeDir} = place(doc({channel: 'rooms/{room_id}', name: 'post', type: 'message'}))
      expect(typeDir).to.equal('/out/channel/rooms/[room_id]')
    })
  })

  // ── resolveDocumentPath: other object types (regression coverage) ─────────────

  describe('resolveDocumentPath — other types', () => {
    it('workspace → workspace/', () => {
      expect(place(doc({name: 'main', type: 'workspace'})).typeDir).to.equal('/out/workspace')
    })

    it('workspace_trigger and error_trigger colocate under workspace/trigger/', () => {
      expect(place(doc({name: 't', type: 'workspace_trigger'})).typeDir).to.equal('/out/workspace/trigger')
      expect(place(doc({name: 'e', type: 'error_trigger'})).typeDir).to.equal('/out/workspace/trigger')
    })

    it('ai object types nest under ai/', () => {
      expect(place(doc({name: 'a', type: 'agent'})).typeDir).to.equal('/out/ai/agent')
      expect(place(doc({name: 'm', type: 'mcp_server'})).typeDir).to.equal('/out/ai/mcp_server')
      expect(place(doc({name: 't', type: 'tool'})).typeDir).to.equal('/out/ai/tool')
      expect(place(doc({name: 'at', type: 'agent_trigger'})).typeDir).to.equal('/out/ai/agent/trigger')
      expect(place(doc({name: 'mt', type: 'mcp_server_trigger'})).typeDir).to.equal('/out/ai/mcp_server/trigger')
    })

    it('realtime v1 types stay under realtime/channel and realtime/trigger', () => {
      expect(place(doc({name: 'c', type: 'realtime_channel'})).typeDir).to.equal('/out/realtime/channel')
      expect(place(doc({name: 't', type: 'realtime_trigger'})).typeDir).to.equal('/out/realtime/trigger')
    })

    it('api_group and its queries land under api/<group>/', () => {
      expect(place(doc({name: 'MyGroup', type: 'api_group'})).typeDir).to.equal('/out/api/my_group')
      const q = place(doc({apiGroup: 'MyGroup', name: 'foo/bar', type: 'query', verb: 'GET'}))
      expect(q.typeDir).to.equal('/out/api/my_group/foo')
      expect(q.baseName).to.equal('bar_GET')
    })

    it('an unknown type falls through to <type>/ with verb suffix', () => {
      const t = place(doc({name: 'nested/leaf', type: 'table_trigger'}))
      expect(t.typeDir).to.equal('/out/table/trigger')
    })
  })

  // ── parseDocument extracts the v2 keys the layout depends on ──────────────────

  describe('parseDocument — realtime v2 references', () => {
    it('extracts realtime_server from a channel document', () => {
      const parsed = parseDocument('channel "rooms/{room_id}" {\n  realtime_server = "chat"\n}')
      expect(parsed?.type).to.equal('channel')
      expect(parsed?.name).to.equal('rooms/{room_id}')
      expect(parsed?.server).to.equal('chat')
    })

    it('extracts channel from a message document', () => {
      const parsed = parseDocument('message "post" {\n  channel = "rooms/{room_id}"\n}')
      expect(parsed?.type).to.equal('message')
      expect(parsed?.channel).to.equal('rooms/{room_id}')
    })
  })

})
