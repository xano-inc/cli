import {expect} from 'chai'
import snakeCase from 'lodash.snakecase'
import {join, relative, sep} from 'node:path'

import type {ParsedDocument} from '../../src/utils/document-parser.js'

import {resolveDocumentOutputPath} from '../../src/utils/pull-layout.js'

// Reproduce the two functions each pull command injects, so the layout assertions match
// production behavior exactly: `sanitize` is the commands' private sanitizeFilename
// (snakeCase after stripping quotes) and `getApiGroupFolder` is a simple snakeCase resolver.
const sanitize = (name: string): string => snakeCase(name.replaceAll('"', ''))
const getApiGroupFolder = (name: string): string => snakeCase(name)

const OUT = 'out'

function resolve(type: string, name: string, extra: Partial<ParsedDocument> = {}): {baseName: string; typeDir: string} {
  const doc: ParsedDocument = {content: '', name, type, ...extra}
  return resolveDocumentOutputPath(OUT, doc, getApiGroupFolder, sanitize)
}

/** The first path segment under OUT — the top-level folder the document lands in. */
function topFolder(typeDir: string): string {
  return relative(OUT, typeDir).split(sep)[0]
}

describe('pull-layout', () => {
  describe('resolveDocumentOutputPath — new realtime trigger mappings (DEV-7712)', () => {
    it('maps channel_trigger to realtime/channel/trigger', () => {
      const {typeDir} = resolve('channel_trigger', 'On Join')
      expect(typeDir).to.equal(join(OUT, 'realtime', 'channel', 'trigger'))
    })

    it('maps realtime_server_trigger to realtime/server/trigger', () => {
      const {typeDir} = resolve('realtime_server_trigger', 'On Connect')
      expect(typeDir).to.equal(join(OUT, 'realtime', 'server', 'trigger'))
    })

    it('keeps both new realtime triggers under realtime/, never at the output root', () => {
      // The bug: both types fell through to the default handler and landed at the root
      // (channel_trigger/…, realtime_server_trigger/…), outside realtime/.
      expect(topFolder(resolve('channel_trigger', 'On Join').typeDir)).to.equal('realtime')
      expect(topFolder(resolve('realtime_server_trigger', 'On Connect').typeDir)).to.equal('realtime')
    })

    it('sanitizes the trigger filename like every other document', () => {
      const {baseName} = resolve('channel_trigger', 'On "Join"')
      expect(baseName).to.equal(sanitize('On "Join"'))
    })
  })

  describe('resolveDocumentOutputPath — regression guards (extraction preserves prior behavior)', () => {
    // [type, doc name, expected folder segments under OUT]
    const cases: Array<[string, string, string[]]> = [
      ['realtime_channel', 'Chat', ['realtime', 'channel']],
      ['realtime_trigger', 'On Message', ['realtime', 'trigger']],
      ['workspace', 'Main', ['workspace']],
      ['workspace_trigger', 'On Boot', ['workspace', 'trigger']],
      ['error_trigger', 'On Error', ['workspace', 'trigger']],
      ['agent', 'Helper', ['ai', 'agent']],
      ['agent_trigger', 'On Run', ['ai', 'agent', 'trigger']],
      ['mcp_server_trigger', 'On Call', ['ai', 'mcp_server', 'trigger']],
      ['table_trigger', 'On Insert', ['table', 'trigger']],
    ]

    for (const [type, name, segments] of cases) {
      it(`maps ${type} to ${segments.join('/')}`, () => {
        const {typeDir} = resolve(type, name)
        expect(typeDir).to.equal(join(OUT, ...segments))
      })
    }

    it('routes api_group through the injected folder resolver', () => {
      const {typeDir} = resolve('api_group', 'Auth API')
      expect(typeDir).to.equal(join(OUT, 'api', getApiGroupFolder('Auth API')))
    })

    it('places a query in its api group folder and appends the verb', () => {
      const {baseName, typeDir} = resolve('query', 'users/login', {apiGroup: 'Auth API', verb: 'post'})
      expect(typeDir).to.equal(join(OUT, 'api', getApiGroupFolder('Auth API'), 'users'))
      expect(baseName).to.equal(`${sanitize('login')}_post`)
    })

    it('falls back to the raw type folder for an unknown type', () => {
      const {baseName, typeDir} = resolve('foo', 'mystery')
      expect(typeDir).to.equal(join(OUT, 'foo'))
      expect(topFolder(typeDir)).to.equal('foo')
      expect(baseName).to.equal(sanitize('mystery'))
    })
  })
})
