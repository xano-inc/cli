import {expect} from 'chai'

import {describeNetworkError} from '../../src/utils/network-error.js'

describe('describeNetworkError', () => {
  const url = 'https://acme.xano.io/api:meta/workspace'

  it('unwraps a "fetch failed" TypeError to its cause code and names the host', () => {
    const error = new TypeError('fetch failed', {cause: {code: 'ECONNREFUSED'}})
    const message = describeNetworkError(error, url)
    expect(message).to.contain('acme.xano.io')
    expect(message).to.contain('(ECONNREFUSED)')
  })

  it('describes a TimeoutError/AbortError as a CLI-timeout with the env-var hint', () => {
    const error = new Error('The operation was aborted')
    error.name = 'TimeoutError'
    const message = describeNetworkError(error, url)
    expect(message).to.contain('exceeded the CLI timeout')
    expect(message).to.contain('XANO_CLI_REQUEST_TIMEOUT_MS')
  })

  it('maps a UND_ERR_INVALID_ARG cause to the Node-compatibility hint', () => {
    const error = new TypeError('fetch failed', {cause: {code: 'UND_ERR_INVALID_ARG'}})
    const message = describeNetworkError(error, url)
    expect(message).to.contain('rejected the request configuration on this Node version')
    expect(message).to.contain('(UND_ERR_INVALID_ARG)')
  })

  it('falls back to a generic network-error line for a bare "fetch failed" with no code', () => {
    const error = new TypeError('fetch failed')
    const message = describeNetworkError(error, url)
    expect(message).to.contain('network error connecting to acme.xano.io')
  })
})
