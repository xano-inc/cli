import {expect} from 'chai'

import {checkReferences} from '../../src/utils/reference-checker.js'

describe('checkReferences', () => {
  it('scans only the candidate documents while resolving names against the whole tree and server ops', () => {
    const localFn = {
      content: 'function helper {\n}\n',
      filePath: 'function/helper.xs',
    }
    const candidate = {
      content: 'function caller {\n  function.run helper\n  function.run remote_only\n}\n',
      filePath: 'function/caller.xs',
    }
    const operations = [
      {name: 'helper', type: 'function'},
      {name: 'caller', type: 'function'},
      {name: 'remote_only', type: 'function'},
    ]

    const scanned = checkReferences([localFn, candidate], operations, [candidate])
    expect(scanned).to.deep.equal([])

    const wholeTree = checkReferences([candidate], operations)
    expect(wholeTree).to.deep.equal([])

    const withoutServer = checkReferences([candidate])
    expect(withoutServer).to.have.lengthOf(2)
    expect(withoutServer.map((ref) => ref.target).sort()).to.deep.equal(['helper', 'remote_only'])
  })

  it('does not report a candidate reference to an object that exists only on the server', () => {
    const candidate = {
      content: 'function caller {\n  db.query users\n}\n',
      filePath: 'function/caller.xs',
    }
    const refs = checkReferences(
      [candidate],
      [{name: 'users', type: 'table'}],
      [candidate],
    )
    expect(refs).to.deep.equal([])
  })
})
