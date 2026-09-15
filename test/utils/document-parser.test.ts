import {expect} from 'chai'
import snakeCase from 'lodash.snakecase'
import {posix} from 'node:path'

import {
  buildChannelServerResolver,
  channelPathSegments,
  type ParsedDocument,
  parseDocument,
  placeDocuments,
  resolveDocumentPath,
  splitMultidoc,
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

    // DEV-7712: v2 trigger docs used to fall through to the default handler and land at the OUTPUT ROOT
    // (channel_trigger/…, realtime_server_trigger/…). They now nest under their v2 parents, like messages.
    it('nests a realtime_server_trigger under its server (server/trigger)', () => {
      const {baseName, typeDir} = place(doc({name: 'on_connect', server: 'chat', type: 'realtime_server_trigger'}))
      expect(typeDir).to.equal('/out/realtime/server/chat/trigger')
      expect(baseName).to.equal('on_connect')
    })

    it('nests a channel_trigger beside its channel (server/channel/trigger)', () => {
      const {baseName, typeDir} = place(
        doc({channel: 'rooms/{room_id}', name: 'on_join', server: 'chat', type: 'channel_trigger'}),
      )
      expect(typeDir).to.equal('/out/realtime/server/chat/channel/rooms_room_id/trigger')
      expect(baseName).to.equal('on_join')
    })

    it('keeps a server-less realtime_server_trigger under realtime/, never the output root', () => {
      const {typeDir} = place(doc({name: 'orphan', type: 'realtime_server_trigger'}))
      expect(typeDir).to.equal('/out/realtime/server_trigger')
    })

    it('falls a channel_trigger with a channel but no server back to the flat channel/ layout', () => {
      const {typeDir} = place(doc({channel: 'rooms/{room_id}', name: 'on_join', type: 'channel_trigger'}))
      expect(typeDir).to.equal('/out/channel/rooms/[room_id]/trigger')
    })

    it('keeps a bare channel_trigger (no server, no channel) under realtime/, never the output root', () => {
      const {typeDir} = place(doc({name: 'orphan', type: 'channel_trigger'}))
      expect(typeDir).to.equal('/out/realtime/channel_trigger')
    })

    it('never places a v2 trigger at the output root (the DEV-7712 regression)', () => {
      const ct = place(doc({channel: 'c', name: 'x', server: 's', type: 'channel_trigger'})).typeDir
      const st = place(doc({name: 'x', server: 's', type: 'realtime_server_trigger'})).typeDir
      expect(ct).to.match(/^\/out\/realtime\//)
      expect(st).to.match(/^\/out\/realtime\//)
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

  describe('splitMultidoc', () => {
    it('splits a `---`-joined bundle into parsed documents', () => {
      const blob = [
        'workspace w {\n}',
        'table documents {\n}',
        '// a comment header\nquery extract verb=POST {\n  api_group = "pdf"\n}',
      ].join('\n---\n')
      const docs = splitMultidoc(blob)
      expect(docs.map((d) => d.type)).to.deep.equal(['workspace', 'table', 'query'])
      expect(docs[2].verb).to.equal('POST')
      expect(docs[2].apiGroup).to.equal('pdf')
    })

    it('skips empty fragments and unparseable ones', () => {
      const blob = 'table a {\n}\n---\n\n---\n   \n---\ntable b {\n}'
      const docs = splitMultidoc(blob)
      expect(docs.map((d) => d.name)).to.deep.equal(['a', 'b'])
    })
  })

  describe('placeDocuments', () => {
    // Use POSIX joins so relPaths are stable across host OSes.
    const deps = {join: posix.join, relative: posix.relative, snakeCase}

    it('places a full bundle into the pull layout', () => {
      const docs = splitMultidoc(
        [
          'workspace microservice {\n}',
          'table documents {\n}',
          'api_group pdf {\n  canonical = "pdf"\n}',
          'query documents verb=GET {\n  api_group = "pdf"\n}',
          'query "documents/{document_id}" verb=GET {\n  api_group = "pdf"\n}',
          'microservice pdf2text {\n}',
        ].join('\n---\n'),
      )
      const placed = placeDocuments(docs, deps)
      const paths = placed.map((p) => p.relPath)
      expect(paths).to.include('workspace/microservice.xs')
      expect(paths).to.include('table/documents.xs')
      expect(paths).to.include('api/pdf/pdf.xs')
      expect(paths).to.include('api/pdf/documents_GET.xs')
      // A slashed query name nests as folders, leaf carries the verb suffix.
      expect(paths).to.include('api/pdf/documents/document_id_GET.xs')
      expect(paths).to.include('microservice/pdf_2_text.xs')
    })

    it('disambiguates duplicate leaf names within a directory with a _N suffix', () => {
      // Two functions that snake_case to the same leaf must not collide.
      const docs = splitMultidoc('function Foo {\n}\n---\nfunction foo {\n}')
      const placed = placeDocuments(docs, deps)
      expect(placed.map((p) => p.relPath)).to.deep.equal(['function/foo.xs', 'function/foo_2.xs'])
    })

    it('preserves each document body verbatim', () => {
      const docs = splitMultidoc('table a {\n  x = 1\n}\n---\ntable b {\n  y = 2\n}')
      const placed = placeDocuments(docs, deps)
      expect(placed[0].content).to.equal('table a {\n  x = 1\n}')
      expect(placed[1].content).to.equal('table b {\n  y = 2\n}')
    })
  })
})
