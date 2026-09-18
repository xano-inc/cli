/* eslint-disable unicorn/filename-case -- Repository filename convention. */
import {expect} from 'chai'

import {foldApiError, formatApiError} from '../../src/utils/api_error.js'

const url = 'https://instance.example/api:meta/workspace/9/policy?branch=ci%2Fnew'

describe('shared API error formatting', () => {
  it('retains source coordinates including zero and folds all internal fields', () => {
    const folded = foldApiError(JSON.stringify({
      code: 'SYNTAX_ERROR',
      message: 'Invalid assignment',
      payload: {col: 0, error_line: 'title =', error_snippet: 'title =', line: 0, trace: ['internal']},
      stack: [{file: '/private/server.php'}],
      trace: ['frame'],
      traceId: 'trace-id',
    }), 400, url)
    expect(JSON.parse(folded)).to.deep.equal({
      code: 'SYNTAX_ERROR', message: 'Invalid assignment',
      payload: {col: 0, error_line: 'title =', error_snippet: 'title =', line: 0},
    })
    // The fold keeps the platform's 0-based payload; only the human rendering renumbers it.
    expect(formatApiError(folded)).to.equal('SYNTAX_ERROR: Invalid assignment\n  at line 1, col 1: title =')
    expect(formatApiError(folded, {rawPayload: true})).to.contain('SYNTAX_ERROR: Invalid assignment').and.to.contain('"line":0')
  })

  it('locates a parse error 1-based, as the MCP server does, and never prints two numbers for one place', () => {
    const named = JSON.stringify({
      code: 'ERROR_CODE_BAD_REQUEST', message: 'rule[0]: A rule cannot be named.',
      payload: {col: 7, error_line: '  rule foo {', error_snippet: 'foo {', line: 6},
    })
    expect(formatApiError(named)).to.equal('ERROR_CODE_BAD_REQUEST: rule[0]: A rule cannot be named.\n  at line 7, col 8:   rule foo {')
    expect(formatApiError(named, {rawPayload: true})).to.contain('payload: {"col":7,"error_line":"  rule foo {","error_snippet":"foo {","line":6}')

    // The platform's own sentence already says `line 3` (1-based): show the text, not a second number.
    const comment = JSON.stringify({message: 'line 3: policy files cannot contain "//" comments.', payload: {col: 2, error_line: '  // why', line: 2}})
    expect(formatApiError(comment)).to.equal('line 3: policy files cannot contain "//" comments.\n  at:   // why')

    // No text to show falls back to the snippet, then to the position alone; no position prints nothing.
    expect(formatApiError(JSON.stringify({message: 'Invalid block: enforcement', payload: {col: 2, error_snippet: 'enforcement = "advisory"', line: 21}})))
      .to.equal('Invalid block: enforcement\n  at line 22, col 3: enforcement = "advisory"')
    expect(formatApiError(JSON.stringify({message: 'Bad', payload: {line: 4}}))).to.equal('Bad\n  at line 5')
    expect(formatApiError(JSON.stringify({message: 'Bad', payload: {param: 'source'}}))).to.equal('Bad')
  })

  for (const body of ['', '{"message":""}']) {
    it(`names the actual decoded branch with body ${JSON.stringify(body)}`, () => {
      expect(formatApiError(foldApiError(body, 404, url))).to.equal('Branch "ci/new" was not found in workspace 9.')
    })
  }

  it('does not invent a branch label for live or a workspace-only request', () => {
    for (const request of [url.replace('ci%2Fnew', ''), url.split('?')[0]]) {
      expect(foldApiError('{"code":"NOT_FOUND","message":""}', 404, request)).not.to.contain('Branch')
    }
  })

  for (const trace of ['\nStack trace:\n#0 /internal/a.php', '\n#0 /internal/a.php', '\n    at internal (/server/file.js:1:2)']) {
    it(`folds stack frames embedded in messages and plain text: ${JSON.stringify(trace)}`, () => {
      expect(foldApiError(`Syntax error${trace}`, 500, url)).to.equal('Syntax error')
      expect(formatApiError(foldApiError(JSON.stringify({message: `Syntax error${trace}`}), 500, url))).to.equal('Syntax error')
    })
  }
})
