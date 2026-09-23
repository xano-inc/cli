import {expect} from 'chai'

import {createOrderedEmitter, mapWithConcurrency} from '../../src/utils/concurrency.js'

/** Resolve after a tick, so interleaving is observable without real timers. */
const tick = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve) })

describe('concurrency', () => {
  describe('mapWithConcurrency', () => {
    it('returns results in input order, not completion order', async () => {
      // Later items finish first; the result array must not reflect that.
      const result = await mapWithConcurrency([3, 2, 1], 3, async (n) => {
        await Promise.all(Array.from({length: n}, () => tick()))
        return n
      })
      expect(result).to.deep.equal([3, 2, 1])
    })

    it('never exceeds the concurrency limit', async () => {
      let active = 0
      let peak = 0
      await mapWithConcurrency(Array.from({length: 20}, (_, i) => i), 4, async () => {
        active++
        peak = Math.max(peak, active)
        await tick()
        active--
        return null
      })
      expect(peak).to.be.at.most(4)
    })

    it('runs strictly sequentially at a limit of 1', async () => {
      let active = 0
      let peak = 0
      await mapWithConcurrency([1, 2, 3, 4], 1, async () => {
        active++
        peak = Math.max(peak, active)
        await tick()
        active--
        return null
      })
      expect(peak).to.equal(1)
    })

    it('clamps a limit below 1 up to sequential rather than hanging', async () => {
      const result = await mapWithConcurrency([1, 2], 0, async (n) => n * 2)
      expect(result).to.deep.equal([2, 4])
    })

    it('processes every item when the limit exceeds the item count', async () => {
      const result = await mapWithConcurrency([1, 2], 99, async (n) => n * 2)
      expect(result).to.deep.equal([2, 4])
    })

    it('passes the index to the worker', async () => {
      const result = await mapWithConcurrency(['a', 'b'], 2, async (item, index) => `${index}:${item}`)
      expect(result).to.deep.equal(['0:a', '1:b'])
    })

    it('returns an empty array for no items', async () => {
      expect(await mapWithConcurrency([], 4, async () => 'x')).to.deep.equal([])
    })

    it('propagates a worker rejection', async () => {
      try {
        await mapWithConcurrency([1], 1, async () => {
          throw new Error('boom')
        })
        expect.fail('expected rejection')
      } catch (error) {
        expect((error as Error).message).to.equal('boom')
      }
    })
  })

  describe('createOrderedEmitter', () => {
    it('holds an out-of-order result until its predecessors arrive', () => {
      const seen: number[] = []
      const emitter = createOrderedEmitter<number>((r) => seen.push(r))

      emitter.settle(2, 30)
      expect(seen).to.deep.equal([])

      emitter.settle(1, 20)
      expect(seen).to.deep.equal([])

      emitter.settle(0, 10)
      expect(seen).to.deep.equal([10, 20, 30])
    })

    it('emits immediately when results arrive in order', () => {
      const seen: number[] = []
      const emitter = createOrderedEmitter<number>((r) => seen.push(r))

      emitter.settle(0, 10)
      expect(seen).to.deep.equal([10])
      emitter.settle(1, 20)
      expect(seen).to.deep.equal([10, 20])
    })

    it('reports the original index alongside the result', () => {
      const seen: Array<[number, string]> = []
      const emitter = createOrderedEmitter<string>((r, i) => seen.push([i, r]))
      emitter.settle(1, 'b')
      emitter.settle(0, 'a')
      expect(seen).to.deep.equal([
        [0, 'a'],
        [1, 'b'],
      ])
    })

    it('flushes a long out-of-order backlog in one go', () => {
      const seen: number[] = []
      const emitter = createOrderedEmitter<number>((r) => seen.push(r))
      for (let i = 4; i >= 1; i--) emitter.settle(i, i)
      expect(seen).to.deep.equal([])
      emitter.settle(0, 0)
      expect(seen).to.deep.equal([0, 1, 2, 3, 4])
    })
  })
})
