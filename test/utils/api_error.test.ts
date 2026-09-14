/* eslint-disable camelcase, unicorn/filename-case -- Native API fields and repository filename convention. */
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
    expect(formatApiError(folded)).to.contain('SYNTAX_ERROR: Invalid assignment').and.to.contain('"line":0')
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
