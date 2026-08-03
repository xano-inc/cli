import {expect} from 'chai'

import type {Activity} from '../../src/utils/hatch-contract.js'
import type {RenderResult, RenderState} from '../../src/utils/hatch-render.js'

import {
  exitCodeFor,
  failureBlock,
  formatElapsed,
  initialRenderState,
  openingBlock,
  POOL_FULL_SENTENCE,
  QUEUED_STATUS,
  reduceActivity,
  reduceReconnecting,
  renderLines,
  successBlock,
} from '../../src/utils/hatch-render.js'

const WATCH_URL = 'https://hatch.mesh0.ai/s/K7QM2XPA9RTV'
const SITE_URL = 'https://bakery-a91f.xano.io'

let nextSeq = 0

/** Sequence numbers are an implementation detail of every test but the replay one. */
function activity<T extends Record<string, unknown>>(fields: T): Activity & T {
  nextSeq += 1
  return {at: 1_700_000_000_000, seq: nextSeq, ...fields} as unknown as Activity & T
}

/** Folds a list of activities, collecting what each step would print. */
function fold(
  activities: Activity[],
  options: {animate?: boolean; verbose?: boolean; watchUrl?: string} = {},
): {lines: string[]; results: RenderResult[]; state: RenderState} {
  const {animate = true, ...renderOptions} = options
  let state = initialRenderState()
  const results: RenderResult[] = []
  const lines: string[] = []

  for (const item of activities) {
    const result = reduceActivity(state, item, renderOptions)
    results.push(result)
    lines.push(...renderLines(result, {animate}))
    state = result.state
  }

  return {lines, results, state}
}

describe('hatch-render', () => {
  beforeEach(() => {
    nextSeq = 0
  })

  describe('initial state', () => {
    it('carries a Queued status before any activity is folded in', () => {
      const state = initialRenderState()
      expect(state.statusText).to.equal(QUEUED_STATUS)
      expect(state.artifactCount).to.equal(0)
      expect(state.done).to.equal(undefined)
    })
  })

  describe('phase', () => {
    it('replaces the Queued status and emits no check line for the first phase', () => {
      const {results} = fold([activity({kind: 'phase', phase: 'scaffolding'})])

      expect(results[0].lines).to.deep.equal([])
      expect(results[0].statusText).to.equal('Setting up')
      expect(results[0].statusChanged).to.equal(true)
    })

    it('flushes the previous phase as a check line and sets the new status', () => {
      const {lines, results} = fold([
        activity({kind: 'phase', phase: 'scaffolding'}),
        activity({kind: 'phase', phase: 'backend'}),
      ])

      expect(results[1].lines).to.deep.equal(['✓ Setting up'])
      expect(results[1].statusText).to.equal('Backend')
      expect(lines).to.deep.equal(['✓ Setting up'])
    })

    it('does not flush when the same phase is repeated', () => {
      const {lines} = fold([
        activity({kind: 'phase', phase: 'backend'}),
        activity({kind: 'phase', phase: 'backend'}),
      ])

      expect(lines).to.deep.equal([])
    })

    it('renders an unknown phase as itself rather than dropping it', () => {
      const {results} = fold([activity({kind: 'phase', phase: 'polishing'})])
      expect(results[0].statusText).to.equal('polishing')
    })
  })

  describe('narration', () => {
    it('changes the status without emitting a line', () => {
      const {results} = fold([
        activity({kind: 'phase', phase: 'backend'}),
        activity({kind: 'narration', message: 'writing the order table'}),
      ])

      expect(results[1].lines).to.deep.equal([])
      expect(results[1].statusText).to.equal('Backend — writing the order table')
      expect(results[1].statusChanged).to.equal(true)
    })

    it('prints the status as a plain line when not animating', () => {
      const {lines} = fold(
        [activity({kind: 'phase', phase: 'backend'}), activity({kind: 'narration', message: 'writing the order table'})],
        {animate: false},
      )

      expect(lines).to.deep.equal(['Backend', 'Backend — writing the order table'])
    })

    it('prints a repeated identical status once, not twice', () => {
      const {lines} = fold(
        [
          activity({kind: 'phase', phase: 'backend'}),
          activity({kind: 'narration', message: 'writing the order table'}),
          activity({kind: 'narration', message: 'writing the order table'}),
        ],
        {animate: false},
      )

      expect(lines).to.deep.equal(['Backend', 'Backend — writing the order table'])
    })

    it('stands alone when no phase has arrived yet', () => {
      const {results} = fold([activity({kind: 'narration', message: 'waiting for a slot'})])
      expect(results[0].statusText).to.equal('waiting for a slot')
    })
  })

  describe('reconnecting', () => {
    it('sets a distinct status that the next narration replaces', () => {
      const afterPhase = reduceActivity(initialRenderState(), activity({kind: 'phase', phase: 'backend'}))

      const dropped = reduceReconnecting(afterPhase.state, 2)
      expect(dropped.statusText).to.equal('Reconnecting… (attempt 2)')
      expect(dropped.statusChanged).to.equal(true)
      expect(dropped.lines).to.deep.equal([])

      const resumed = reduceActivity(dropped.state, activity({kind: 'narration', message: 'still going'}))
      expect(resumed.statusText).to.equal('Backend — still going')
      expect(resumed.statusChanged).to.equal(true)
    })

    it('prints once per attempt when not animating', () => {
      let state = initialRenderState()
      const lines: string[] = []

      for (const attempt of [1, 2]) {
        const result = reduceReconnecting(state, attempt)
        lines.push(...renderLines(result, {animate: false}))
        state = result.state
      }

      expect(lines).to.deep.equal(['Reconnecting… (attempt 1)', 'Reconnecting… (attempt 2)'])
    })
  })

  describe('artifact', () => {
    it('emits no line and increments the count', () => {
      const {lines, state} = fold([
        activity({action: 'created', kind: 'artifact', path: 'api/order.xs'}),
        activity({action: 'modified', kind: 'artifact', path: 'api/order.xs'}),
      ])

      expect(lines).to.deep.equal([])
      expect(state.artifactCount).to.equal(2)
    })
  })

  describe('heartbeat', () => {
    it('never emits a line and never advances the phase', () => {
      const {lines, results, state} = fold([
        activity({kind: 'phase', phase: 'backend'}),
        activity({
          elapsedInPhaseMs: 65_000,
          filesWritten: 3,
          kind: 'heartbeat',
          lastAction: 'writing',
          phase: 'deploying',
        }),
      ])

      expect(lines).to.deep.equal([])
      expect(state.phase).to.equal('backend')
      expect(results[1].statusText).to.equal('Backend')
      expect(results[1].status).to.equal('Backend (1m 05s)')
      expect(results[1].statusChanged).to.equal(false)
    })

    it('emits nothing when not animating either', () => {
      const {lines} = fold(
        [
          activity({kind: 'phase', phase: 'backend'}),
          activity({elapsedInPhaseMs: 4000, filesWritten: 0, kind: 'heartbeat', lastAction: 'x', phase: 'backend'}),
        ],
        {animate: false},
      )

      expect(lines).to.deep.equal(['Backend'])
    })
  })

  describe('log', () => {
    it('emits nothing at default verbosity and emits under --verbose', () => {
      const line = activity({kind: 'log', line: 'npm install', stream: 'stdout'})

      expect(fold([line]).lines).to.deep.equal([])
      expect(fold([line], {verbose: true}).lines).to.deep.equal(['npm install'])
    })
  })

  describe('unknown kinds', () => {
    it('ignores an unrecognized kind without throwing', () => {
      const before = initialRenderState()
      const result = reduceActivity(before, activity({kind: 'telemetry', payload: {a: 1}}))

      expect(result.lines).to.deep.equal([])
      expect(result.statusChanged).to.equal(false)
      expect(result.state.statusText).to.equal(QUEUED_STATUS)
      expect(result.done).to.equal(undefined)
    })
  })

  describe('terminal', () => {
    it('renders the success block with exactly the site URL and exit code 0', () => {
      const {results} = fold([activity({kind: 'terminal', outcome: 'succeeded', siteUrl: SITE_URL})], {
        watchUrl: WATCH_URL,
      })

      expect(results[0].lines).to.deep.equal(['Your project is complete, you can view it at:', `  ${SITE_URL}`])
      expect(results[0].done).to.deep.equal({
        exitCode: 0,
        outcome: {outcome: 'succeeded', siteUrl: SITE_URL},
      })
    })

    it('falls back to the watch link when a success carries no siteUrl', () => {
      const {results} = fold([activity({kind: 'terminal', outcome: 'succeeded'})], {watchUrl: WATCH_URL})

      expect(results[0].lines).to.deep.equal(['Your project is complete, you can view it at:', `  ${WATCH_URL}`])
      expect(results[0].done?.exitCode).to.equal(0)
    })

    it('renders a failure with its message, the watch link, and a non-zero exit', () => {
      const {results} = fold([activity({kind: 'terminal', message: 'the agent gave up', outcome: 'failed'})], {
        watchUrl: WATCH_URL,
      })

      expect(results[0].lines).to.deep.equal([
        'the agent gave up',
        'You can see what happened at:',
        `  ${WATCH_URL}`,
      ])
      expect(results[0].done?.exitCode).to.equal(1)
    })

    it('renders expiry non-zero without the pool sentence', () => {
      const {results} = fold([activity({kind: 'terminal', message: 'out of time', outcome: 'expired'})], {
        watchUrl: WATCH_URL,
      })

      expect(results[0].done?.exitCode).to.not.equal(0)
      expect(results[0].lines).to.not.include(POOL_FULL_SENTENCE)
      expect(results[0].lines[0]).to.equal('out of time')
    })

    it('renders rejection non-zero with the pool sentence', () => {
      const {results} = fold([activity({kind: 'terminal', message: 'no capacity', outcome: 'rejected'})], {
        watchUrl: WATCH_URL,
      })

      expect(results[0].done?.exitCode).to.not.equal(0)
      expect(results[0].lines).to.include(POOL_FULL_SENTENCE)
    })

    it('prints the block in non-animated mode without an extra status line', () => {
      const {lines} = fold([activity({kind: 'terminal', outcome: 'succeeded', siteUrl: SITE_URL})], {animate: false})

      expect(lines).to.deep.equal(['Your project is complete, you can view it at:', `  ${SITE_URL}`])
    })
  })

  describe('replay after a reconnect', () => {
    it('is idempotent over a duplicate seq', () => {
      const stream: Activity[] = [
        activity({kind: 'phase', phase: 'scaffolding'}),
        activity({action: 'created', kind: 'artifact', path: 'a.xs'}),
        activity({kind: 'phase', phase: 'backend'}),
      ]

      const clean = fold(stream)
      const replayed = fold([...stream, ...stream])

      expect(replayed.lines).to.deep.equal(clean.lines)
      expect(replayed.state).to.deep.equal(clean.state)
      expect(replayed.state.artifactCount).to.equal(1)
    })

    it('re-renders a replayed prefix identically from a fresh state', () => {
      const stream: Activity[] = [
        activity({kind: 'phase', phase: 'scaffolding'}),
        activity({kind: 'narration', message: 'reading the brief'}),
        activity({kind: 'phase', phase: 'backend'}),
      ]

      expect(fold(stream, {animate: false}).lines).to.deep.equal(fold(stream, {animate: false}).lines)
    })
  })

  describe('formatters', () => {
    it('prints the opening block with the watch link', () => {
      expect(openingBlock(WATCH_URL)).to.deep.equal([
        'Your idea is being created, follow along for more details:',
        `  ${WATCH_URL}`,
      ])
    })

    it('degrades the opening block when there is no watch link', () => {
      const block = openingBlock()
      expect(block).to.have.lengthOf(1)
      expect(block[0]).to.not.include('undefined')
      expect(block[0]).to.include('being created')
    })

    it('degrades the success block when there is neither a site nor a watch URL', () => {
      expect(successBlock({outcome: 'succeeded'})).to.deep.equal(['Your project is complete.'])
    })

    it('supplies default prose per outcome when the server sent no message', () => {
      expect(failureBlock({outcome: 'failed'})[0]).to.include('did not finish')
      expect(failureBlock({outcome: 'expired'})[0]).to.include('ran out of time')
      expect(failureBlock({outcome: 'rejected'})).to.deep.equal([
        'The build could not be started.',
        POOL_FULL_SENTENCE,
      ])
    })

    it('maps outcomes to exit codes', () => {
      expect(exitCodeFor('succeeded')).to.equal(0)
      expect(exitCodeFor('failed')).to.not.equal(0)
      expect(exitCodeFor('expired')).to.not.equal(0)
      expect(exitCodeFor('rejected')).to.not.equal(0)
    })

    it('formats elapsed time under and over a minute', () => {
      expect(formatElapsed(42_000)).to.equal('42s')
      expect(formatElapsed(125_000)).to.equal('2m 05s')
    })
  })
})
