import {expect} from 'chai'

import {buildServerRegistry, checkReferences} from '../../src/utils/reference-checker.js'

describe('reference-checker', () => {
  // Regression for DEV-7772: a partial push (`--force -i "<glob>"`) references objects that live on the
  // server but sit outside the include glob. Feeding the dry-run operations in as the server registry
  // must clear those false positives, while a reference that resolves nowhere stays flagged.
  const caller = {
    content: 'function say {\n  function.run "chat_record" {\n  }\n}\n',
    filePath: 'function/say.xs',
  }

  describe('checkReferences with a server registry', () => {
    it('clears a reference absent from the push but present in the server operations', () => {
      const serverOps = [{name: 'chat_record', type: 'function'}]
      expect(checkReferences([caller], serverOps)).to.deep.equal([])
    })

    it('flags the same reference when no server operations are supplied (force fallback)', () => {
      const badRefs = checkReferences([caller])
      expect(badRefs).to.have.lengthOf(1)
      expect(badRefs[0]).to.deep.equal({
        source: 'say',
        sourceType: 'function',
        statementType: 'function.run',
        target: 'chat_record',
        targetType: 'function',
      })
    })

    it('still flags a reference that resolves in neither the push set nor the server', () => {
      const ghostCaller = {content: 'function say {\n  function.run "ghost_fn" {\n  }\n}\n', filePath: 'function/say.xs'}
      const serverOps = [{name: 'chat_record', type: 'function'}]
      const badRefs = checkReferences([ghostCaller], serverOps)
      expect(badRefs).to.have.lengthOf(1)
      expect(badRefs[0].target).to.equal('ghost_fn')
    })

    it('resolves a db.* table reference against a server-only table', () => {
      const writer = {content: 'function say {\n  db.get "mw_log" {\n  }\n}\n', filePath: 'function/say.xs'}
      expect(checkReferences([writer], [{name: 'mw_log', type: 'table'}])).to.deep.equal([])
      expect(checkReferences([writer])).to.have.lengthOf(1)
    })
  })

  describe('buildServerRegistry', () => {
    it('strips the HTTP verb suffix from query operation names', () => {
      const registry = buildServerRegistry([{name: 'users/{id} GET', type: 'query'}])
      expect(registry.get('query')?.has('users/{id}')).to.equal(true)
      expect(registry.get('query')?.has('users/{id} GET')).to.equal(false)
    })

    it('keeps a name with no verb suffix intact', () => {
      const registry = buildServerRegistry([{name: 'chat_record', type: 'function'}])
      expect(registry.get('function')?.has('chat_record')).to.equal(true)
    })
  })
})
