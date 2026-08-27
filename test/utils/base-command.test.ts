import {expect} from 'chai'

import {argvHasProfileFlag, isDispatcherRejection, requestWithFallback} from '../../src/base-command.js'

// Derive the fetch Response/options shapes from requestWithFallback itself so the
// test never names the Node globals (fetch/Response/RequestInit) that this repo's
// lint config flags as unsupported below Node 21.
type FetchResult = Awaited<ReturnType<typeof requestWithFallback>>
type FetchOptionsArg = Parameters<typeof requestWithFallback>[2]

const fakeResponse = {ok: true, status: 200} as unknown as FetchResult
const dispatcherRejection = (message: string): Error => Object.assign(new Error(message), {code: 'UND_ERR_INVALID_ARG'})

// Closure-free fakes are hoisted to module scope (unicorn/consistent-function-scoping).
const resolvesToFake = async (): Promise<FetchResult> => fakeResponse
const rejectsTransport = async (): Promise<FetchResult> => {
  throw new Error('fetch failed', {cause: {code: 'ECONNREFUSED'}})
}

describe('base-command helpers', () => {
  describe('argvHasProfileFlag', () => {
    it('detects -p', () => {
      expect(argvHasProfileFlag(['node', 'xano', 'workspace', 'push', '-p', 'prod'], {})).to.equal(true)
    })

    it('detects --profile', () => {
      expect(argvHasProfileFlag(['node', 'xano', 'push', '--profile', 'prod'], {})).to.equal(true)
    })

    it('detects --profile=value', () => {
      expect(argvHasProfileFlag(['node', 'xano', 'push', '--profile=prod'], {})).to.equal(true)
    })

    it('detects the XANO_PROFILE env var', () => {
      expect(argvHasProfileFlag(['node', 'xano', 'push'], {XANO_PROFILE: 'prod'})).to.equal(true)
    })

    it('returns false when neither flag nor env is present', () => {
      expect(argvHasProfileFlag(['node', 'xano', 'push'], {})).to.equal(false)
    })

    it('ignores an empty XANO_PROFILE', () => {
      expect(argvHasProfileFlag(['node', 'xano', 'push'], {XANO_PROFILE: ''})).to.equal(false)
    })
  })

  describe('isDispatcherRejection', () => {
    it('is true when the error cause code is UND_ERR_INVALID_ARG', () => {
      expect(isDispatcherRejection({cause: {code: 'UND_ERR_INVALID_ARG'}})).to.equal(true)
    })

    it('is true when the top-level code is ERR_INVALID_ARG_TYPE', () => {
      expect(isDispatcherRejection({code: 'ERR_INVALID_ARG_TYPE'})).to.equal(true)
    })

    it('is true when the message mentions a dispatcher', () => {
      expect(isDispatcherRejection(new Error('invalid dispatcher option provided'))).to.equal(true)
    })

    it('is false for a genuine transport error (ECONNREFUSED)', () => {
      expect(isDispatcherRejection({cause: {code: 'ECONNREFUSED'}})).to.equal(false)
    })

    it('is false for a non-object error value', () => {
      expect(isDispatcherRejection(null)).to.equal(false)
      expect(isDispatcherRejection('boom')).to.equal(false)
    })
  })

  describe('requestWithFallback', () => {
    it('returns the builtin result when it succeeds, without any fallback', async () => {
      let undiciCalls = 0
      const undici = async (): Promise<FetchResult> => {
        undiciCalls++
        return fakeResponse
      }

      const result = await requestWithFallback({builtin: resolvesToFake, undici}, 'https://acme.xano.io', {
        dispatcher: {} as FetchOptionsArg['dispatcher'],
      })

      expect(result).to.equal(fakeResponse)
      expect(undiciCalls).to.equal(0)
    })

    it('falls back to undici with the dispatcher intact when the builtin rejects it', async () => {
      const dispatcher = {} as FetchOptionsArg['dispatcher']
      const calls: string[] = []
      let undiciOptions: FetchOptionsArg | undefined
      const builtin = async (): Promise<FetchResult> => {
        calls.push('builtin')
        throw dispatcherRejection('builtin refused the dispatcher')
      }

      const undici = async (_url: string, options: FetchOptionsArg): Promise<FetchResult> => {
        calls.push('undici')
        undiciOptions = options
        return fakeResponse
      }

      const result = await requestWithFallback({builtin, undici}, 'https://acme.xano.io', {
        dispatcher,
        headers: {'x-test': '1'},
      })

      expect(result).to.equal(fakeResponse)
      expect(calls).to.deep.equal(['builtin', 'undici'])
      expect(undiciOptions?.dispatcher).to.equal(dispatcher)
    })

    it('drops the dispatcher and retries the builtin when undici also rejects it', async () => {
      const calls: string[] = []
      let plainReplay: FetchOptionsArg | undefined
      const builtin = async (_url: string, options: FetchOptionsArg): Promise<FetchResult> => {
        if (options.dispatcher) {
          calls.push('builtin+dispatcher')
          throw dispatcherRejection('builtin refused the dispatcher')
        }

        calls.push('builtin-plain')
        plainReplay = options
        return fakeResponse
      }

      const undici = async (): Promise<FetchResult> => {
        calls.push('undici')
        throw dispatcherRejection('undici refused the dispatcher too')
      }

      const result = await requestWithFallback({builtin, undici}, 'https://acme.xano.io', {
        dispatcher: {} as FetchOptionsArg['dispatcher'],
        headers: {'x-test': '1'},
      })

      expect(result).to.equal(fakeResponse)
      expect(calls).to.deep.equal(['builtin+dispatcher', 'undici', 'builtin-plain'])
      expect(plainReplay ? 'dispatcher' in plainReplay : true).to.equal(false)
      expect(plainReplay?.headers).to.deep.equal({'x-test': '1'})
    })

    it('propagates a non-dispatcher error from the builtin without falling back', async () => {
      let undiciCalls = 0
      const undici = async (): Promise<FetchResult> => {
        undiciCalls++
        return fakeResponse
      }

      let threw = false
      try {
        await requestWithFallback({builtin: rejectsTransport, undici}, 'https://acme.xano.io', {})
      } catch {
        threw = true
      }

      expect(threw).to.equal(true)
      expect(undiciCalls).to.equal(0)
    })
  })
})
