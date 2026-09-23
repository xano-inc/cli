import {expect} from 'chai'

import {describePolicyError} from '../../src/utils/policy-errors.js'

const url = 'https://instance.example/api:meta/workspace/9/policy?branch=ci%2Fnew'

describe('policy route errors', () => {
  it('keeps the code and message, drops internals, and locates a parse error 1-based', () => {
    const body = JSON.stringify({
      code: 'SYNTAX_ERROR',
      message: 'Invalid assignment',
      payload: {col: 0, error_line: 'title =', error_snippet: 'title =', line: 0, trace: ['internal']},
      stack: [{file: '/private/server.php'}],
      traceId: 'trace-id',
    })
    expect(describePolicyError(body, 400, url)).to.equal('SYNTAX_ERROR: Invalid assignment\n  at line 1, col 1: title =')
  })

  it('never prints two numbers for one place', () => {
    // The platform's own sentence already says `line 3` (1-based): show the text, not a second number.
    const comment = JSON.stringify({message: 'line 3: policy files cannot contain "//" comments.', payload: {col: 2, error_line: '  // why', line: 2}})
    expect(describePolicyError(comment, 400, url)).to.equal('line 3: policy files cannot contain "//" comments.\n  at:   // why')
  })

  it('falls back to the snippet, then to the position alone, and prints nothing without either', () => {
    const snippet = JSON.stringify({message: 'Invalid block: enforcement', payload: {col: 2, error_snippet: 'enforcement = "advisory"', line: 21}})
    expect(describePolicyError(snippet, 400, url)).to.equal('Invalid block: enforcement\n  at line 22, col 3: enforcement = "advisory"')
    expect(describePolicyError(JSON.stringify({message: 'Bad', payload: {line: 4}}), 400, url)).to.equal('Bad\n  at line 5')
    expect(describePolicyError(JSON.stringify({message: 'Bad', payload: {param: 'source'}}), 400, url)).to.equal('Bad')
  })

  for (const body of ['', '{"message":""}']) {
    it(`names the decoded branch for an empty 404 with body ${JSON.stringify(body)}`, () => {
      expect(describePolicyError(body, 404, url)).to.equal('Branch "ci/new" was not found in workspace 9.')
    })
  }

  it('does not invent a branch label for live or a workspace-only request', () => {
    for (const request of [url.replace('ci%2Fnew', ''), url.split('?')[0]]) {
      expect(describePolicyError('{"code":"NOT_FOUND","message":""}', 404, request)).to.equal('NOT_FOUND')
    }
  })

  it('says so when the server sent no message at all', () => {
    expect(describePolicyError('', 500, url)).to.equal('The server returned no message.')
  })

  for (const trace of ['\nStack trace:\n#0 /internal/a.php', '\n#0 /internal/a.php', '\n    at internal (/server/file.js:1:2)']) {
    it(`folds stack frames embedded in messages and plain text: ${JSON.stringify(trace)}`, () => {
      expect(describePolicyError(`Syntax error${trace}`, 500, url)).to.equal('Syntax error')
      expect(describePolicyError(JSON.stringify({message: `Syntax error${trace}`}), 500, url)).to.equal('Syntax error')
    })
  }
})
