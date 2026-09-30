/* eslint-disable n/no-unsupported-features/node-builtins -- Response/ReadableStream/AbortSignal are stable on the Node 20.12 floor this package targets; the rule's support data is stale, and src/utils/sse.ts and src/utils/hatch-client.ts hit the same false positives */

/**
 * `xano hatch "<prompt>"` — start a Hatch build and watch it to its ending.
 *
 * Extends oclif's `Command` rather than `BaseCommand` (see the plan's KTD5):
 * `BaseCommand` exists to resolve a Xano profile, and Hatch's API takes no
 * credentials, so inheriting it would put a `-p/--profile` flag on the command
 * that changes nothing — and would break the "works on a fresh install with no
 * credentials file" property outright. What that gives up is `verboseFetch`
 * (whose User-Agent is reproduced by {@link HatchClient}) and the update-check
 * notice.
 *
 * Everything below the oclif class is a plain function over injected
 * dependencies, so the whole run — the ordering, the exit codes, the interrupt,
 * the snapshot backstop — is testable without a socket, a TTY, or oclif.
 */

import {Args, Command, Flags, ux} from '@oclif/core'

import type {Activity, BuildOutcome, CreateSessionResponse, SessionSnapshot, TerminalOutcome} from '../../utils/hatch-contract.js'
import type {RenderDone, RenderResult, RenderState} from '../../utils/hatch-render.js'
import type {SseEvent} from '../../utils/sse.js'

import {DEFAULT_HATCH_URL, HATCH_URL_ENV_VAR, HatchClient, outcomeFromSnapshot, resolveHatchUrl} from '../../utils/hatch-client.js'
import {
  exitCodeFor,
  initialRenderState,
  openingBlock,
  QUEUED_STATUS,
  reduceActivity,
  reduceReconnecting,
  renderLines,
  terminalBlock,
} from '../../utils/hatch-render.js'
import {readSseWithReconnect} from '../../utils/sse.js'

/** Hatch's own wall-clock budget for a single build. */
export const HATCH_BUILD_BUDGET_MS = 15 * 60 * 1000

/**
 * How far past that budget the client keeps watching.
 *
 * The server's expiry sweep is what produces the `expired` terminal activity,
 * and it runs on its own schedule; giving it a minute of slack means the
 * server's own answer normally wins the race and the cap stays what it is
 * meant to be — a backstop against a connection that died in a way that looked
 * like it was still alive, not the usual way a build ends.
 */
export const WATCH_CAP_MARGIN_MS = 60_000

/** The hard ceiling on a watch. Hitting it resolves the outcome from the snapshot. */
export const WATCH_CAP_MS = HATCH_BUILD_BUDGET_MS + WATCH_CAP_MARGIN_MS

/**
 * What the run ended as. A superset of the contract's terminal outcomes:
 * `started` is `--no-wait`, and `interrupted` is Ctrl-C — neither is a build
 * ending, but a scripted caller still has to get one object with a verdict in
 * it rather than an empty stream.
 */
export type HatchRunOutcome = 'interrupted' | 'started' | TerminalOutcome

/** The single object `-o json` puts on stdout. */
export interface HatchRunSummary {
  message?: string
  outcome: HatchRunOutcome
  sessionId: string
  siteUrl?: string
  watchUrl?: string
}

export interface HatchRunResult {
  exitCode: number
  summary: HatchRunSummary
}

/** The slice of {@link HatchClient} the run needs, so tests can stub it. */
export interface HatchSessionApi {
  createSession(): Promise<CreateSessionResponse>
  getSnapshot(sessionId: string): Promise<SessionSnapshot>
  openStream(sessionId: string, lastEventId?: number | string): Promise<Response>
  submitPrompt(sessionId: string, prompt: string): Promise<void>
}

/**
 * Two sinks, not one: stdout carries the result and stderr carries the
 * progress. The run decides which is which — under `-o json` every human line
 * goes to `err` so stdout holds exactly one object and the run pipes into `jq`.
 */
export interface HatchIo {
  err(line: string): void
  out(line: string): void
}

/** The spinner, abstracted so the run never touches `ux` (or a TTY) in tests. */
export interface HatchSpinner {
  start(action: string, status?: string): void
  stop(message?: string): void
  update(status: string): void
}

export interface RunHatchOptions {
  /** Spinner on. Gated by the caller exactly as `BaseCommand.waitForBuild()` does. */
  animate: boolean
  /** Overrides {@link WATCH_CAP_MS}; exists for tests. */
  capMs?: number
  client: HatchSessionApi
  /** Aborted by the `SIGINT` handler. */
  interrupt?: AbortSignal
  io: HatchIo
  /** `-o json`: one object on stdout, everything else on stderr. */
  json: boolean
  prompt: string
  /** Passed through to {@link readSseWithReconnect}; exists for tests. */
  reconnect?: {backoffMs?: (attempt: number) => number; maxAttempts?: number; sleep?: (ms: number) => Promise<void>}
  spinner?: HatchSpinner
  verbose: boolean
  /** False under `--no-wait`: print the link, do not open the stream. */
  wait: boolean
}

/**
 * Rejects a prompt that is empty or only whitespace, before anything is sent.
 *
 * Note what is deliberately *not* here: an upper bound. Hatch truncates at 5000
 * characters, and a second limit in the client is a second number to keep in
 * step with the first. The prompt goes out as given.
 */
export function validatePrompt(prompt: string): string {
  if (prompt.trim() === '') {
    throw new Error('a prompt is required: describe what you want built, e.g. xano hatch "a landing page for a bakery"')
  }

  return prompt
}

/** An activity off an SSE frame, or undefined if the frame carried no usable JSON. */
export function parseActivity(event: SseEvent): Activity | undefined {
  if (!event.data) return undefined

  try {
    const parsed = JSON.parse(event.data) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    return parsed as Activity
  } catch {
    // A frame this client cannot read is not a reason to fail a build that is
    // still running — the same forward-compatibility posture as an unknown kind.
    return undefined
  }
}

/** Printed on Ctrl-C. The build is server-side; the user only needs telling. */
export function interruptBlock(watchUrl?: string): string[] {
  if (!watchUrl) return ['Stopped watching. The build keeps running.']
  return ['Stopped watching — the build keeps running. Follow it at:', `  ${watchUrl}`]
}

/** How a watch ended, before the outcome is known. */
type WatchStep =
  | {event: SseEvent; kind: 'event'}
  | {kind: 'capped'}
  | {kind: 'closed'}
  | {kind: 'interrupted'}

interface Gate {
  dispose(): void
  promise: Promise<WatchStep>
}

/** Never resolves; stands in for an absent interrupt so the race is uniform. */
function idleGate(): Gate {
  return {
    dispose() {},
    promise: new Promise<WatchStep>(() => {}),
  }
}

function deadlineGate(ms: number): Gate {
  let timer: NodeJS.Timeout | undefined
  const promise = new Promise<WatchStep>((resolve) => {
    timer = setTimeout(() => resolve({kind: 'capped'}), ms)
    // The cap must never be the reason a finished command lingers.
    timer.unref?.()
  })

  return {
    dispose() {
      if (timer) clearTimeout(timer)
    },
    promise,
  }
}

function interruptGate(signal?: AbortSignal): Gate {
  if (!signal) return idleGate()

  let onAbort: (() => void) | undefined
  const promise = new Promise<WatchStep>((resolve) => {
    onAbort = () => resolve({kind: 'interrupted'})
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, {once: true})
  })

  return {
    dispose() {
      if (onAbort) signal.removeEventListener('abort', onAbort)
    },
    promise,
  }
}

/**
 * The event stream, plus the two things that can end the watch before it does.
 *
 * A custom iterable rather than a `while` loop so the consumer is a plain
 * `for await` — and so the three endings are one `Promise.race` in one place.
 * When the cap or the interrupt wins, the pending `next()` is abandoned; the
 * consumer closes the generator on its way out.
 */
function racingSteps(iterator: AsyncIterator<SseEvent>, gates: Gate[]): AsyncIterable<WatchStep> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<WatchStep>> {
          const step = await Promise.race<WatchStep>([
            iterator.next().then((result) => (result.done ? {kind: 'closed'} : {event: result.value, kind: 'event'})),
            ...gates.map((gate) => gate.promise),
          ])

          return {done: false, value: step}
        },
      }
    },
  }
}

/**
 * Run a build end to end.
 *
 * The ordering is load-bearing: the watch link is printed after session-create
 * and *before* the stream is opened, so a stream that never opens still leaves
 * the user with a link to a build that is running regardless.
 */
export async function runHatch(options: RunHatchOptions): Promise<HatchRunResult> {
  const {animate, client, interrupt, io, json, prompt, spinner, verbose, wait} = options

  validatePrompt(prompt)

  // Progress is not result. Under `-o json` it moves to stderr rather than
  // being buffered: a run killed by a proxy drop must not leave the session id
  // and the link nowhere at all, and `-o json` is the mode most likely to be
  // running unattended.
  const progress = (line: string): void => {
    if (json) io.err(line)
    else io.out(line)
  }

  const session = await client.createSession()
  const {sessionId, watchUrl} = session

  for (const line of openingBlock(watchUrl)) progress(line)

  await client.submitPrompt(sessionId, prompt)

  const conclude = (outcome: HatchRunOutcome, exitCode: number, build?: BuildOutcome): HatchRunResult => {
    const summary: HatchRunSummary = {
      ...(build?.message === undefined ? {} : {message: build.message}),
      outcome,
      sessionId,
      ...(build?.siteUrl === undefined ? {} : {siteUrl: build.siteUrl}),
      ...(watchUrl === undefined ? {} : {watchUrl}),
    }

    if (json) io.out(JSON.stringify(summary, null, 2))
    return {exitCode, summary}
  }

  if (!wait) return conclude('started', 0)

  let state: RenderState = initialRenderState()
  const emit = (result: RenderResult): void => {
    for (const line of renderLines(result, {animate})) progress(line)
    if (animate) spinner?.update(result.status)
    state = result.state
  }

  if (animate) spinner?.start('Building', QUEUED_STATUS)
  else progress(QUEUED_STATUS)

  const iterator = readSseWithReconnect({
    ...options.reconnect,
    isTerminal: (event) => parseActivity(event)?.kind === 'terminal',
    onReconnecting(attempt) {
      emit(reduceReconnecting(state, attempt))
    },
    async open(lastEventId) {
      const response = await client.openStream(sessionId, lastEventId)
      if (!response.body) throw new Error('the Hatch build stream returned an empty response body')
      return response.body
    },
  })[Symbol.asyncIterator]()

  const gates = [deadlineGate(options.capMs ?? WATCH_CAP_MS), interruptGate(interrupt)]

  const {done, ending, streamError} = await watchToEnding(iterator, gates, (event) => {
    // A frame that carried no usable activity is not an ending — skip it.
    const activity = parseActivity(event)
    if (!activity) return

    const result = reduceActivity(state, activity, {verbose, watchUrl})
    if (result.done && animate) spinner?.stop('')
    emit(result)
    return result.done
  })

  if (animate && !done) spinner?.stop('')

  if (ending === 'interrupted') {
    for (const line of interruptBlock(watchUrl)) progress(line)
    return conclude('interrupted', 0)
  }

  // The stream closing is the fast path, not the guarantee. Anything that got
  // here — the cap, a close with no terminal activity, a stream that could not
  // be opened at all — asks the server what actually happened rather than
  // assuming. One call on an exceptional path, not a poll loop.
  let ended = done
  if (!ended) {
    ended = await resolveFromSnapshot(client, sessionId, ending, streamError)
    for (const line of terminalBlock(ended.outcome, watchUrl)) progress(line)
  }

  return conclude(ended.outcome.outcome, ended.exitCode, ended.outcome)
}

interface WatchEnding {
  done?: RenderDone
  ending: WatchStep['kind']
  streamError?: unknown
}

/**
 * Consume the stream until something ends it: a terminal activity, the
 * wall-clock cap, an interrupt, a close, or a throw.
 *
 * `handle` folds each event and returns the build's ending if that event was
 * the one that carried it — keeping the render side of the loop out of here.
 */
async function watchToEnding(
  iterator: AsyncIterator<SseEvent>,
  gates: Gate[],
  handle: (event: SseEvent) => RenderDone | undefined,
): Promise<WatchEnding> {
  const result: WatchEnding = {ending: 'closed'}

  try {
    for await (const step of racingSteps(iterator, gates)) {
      if (step.kind !== 'event') {
        result.ending = step.kind
        break
      }

      const done = handle(step.event)
      if (done) {
        result.done = done
        result.ending = 'closed'
        break
      }
    }
  } catch (error) {
    result.streamError = error
  } finally {
    for (const gate of gates) gate.dispose()
    // Deliberately not awaited. On the cap and interrupt paths the generator is
    // parked on a read of a stream that is still open, and an async generator
    // queues `return()` behind that pending `next()` — awaiting it would hang
    // on exactly the two paths that exist to stop a hang.
    const closing = iterator.return?.()
    if (closing) closing.catch(() => {})
  }

  return result
}

/** Why the watch ended without a terminal activity, in the user's words. */
function unresolvedMessage(ending: WatchStep['kind'], streamError: unknown): string {
  const cause = streamError instanceof Error ? ` (${streamError.message})` : ''
  if (ending === 'capped') {
    return `Stopped watching after ${Math.round(WATCH_CAP_MS / 60_000)} minutes and the build had not reported an ending. It may still be running.`
  }

  return `The build stream ended before the build did, and the server has not reported an ending yet${cause}.`
}

async function resolveFromSnapshot(
  client: HatchSessionApi,
  sessionId: string,
  ending: WatchStep['kind'],
  streamError: unknown,
): Promise<RenderDone> {
  let snapshot: SessionSnapshot | undefined
  let snapshotError: unknown

  try {
    snapshot = await client.getSnapshot(sessionId)
  } catch (error) {
    snapshotError = error
  }

  const outcome = snapshot && outcomeFromSnapshot(snapshot)
  if (outcome) return {exitCode: exitCodeFor(outcome.outcome), outcome}

  // Still in flight, or the snapshot itself failed. Either way this is not a
  // success and silence is not an option: fail with what is known.
  return {
    exitCode: 1,
    outcome: {message: unresolvedMessage(ending, snapshotError ?? streamError), outcome: 'failed'},
  }
}

export default class Hatch extends Command {
  static override args = {
    prompt: Args.string({
      description: 'What you want built, in plain language',
      required: true,
    }),
  }
static override description = 'Build and deploy a full-stack app from a prompt, with Hatch'
static override examples = [
    `$ xano hatch "a landing page for a bakery, with an order form"
Your idea is being created, follow along for more details:
  https://hatch.mesh0.ai/s/K7QM2XPA9RTV`,
    `$ xano hatch "an inventory tracker" --no-wait
(prints the follow-along link and returns immediately)`,
    `$ xano hatch "a recipe box" -o json | jq -r .siteUrl
(one JSON object on stdout; progress goes to stderr)`,
    `$ xano hatch "a bakery site" --api http://localhost:8080
(point at a local Hatch API; XANO_HATCH_URL does the same)`,
  ]
static override flags = {
    // No `env:` here even though the variable is honoured. This repo's custom
    // help class renders `[env: X]` for any flag that declares one, and oclif
    // renders it too, so declaring it prints the hint twice. Precedence lives
    // in `resolveHatchUrl`, which is where it was put to begin with.
    api: Flags.string({
      description: `Hatch base URL. Defaults to $${HATCH_URL_ENV_VAR}, then ${DEFAULT_HATCH_URL}`,
      required: false,
    }),
    'no-wait': Flags.boolean({
      default: false,
      description: 'Print the follow-along link and exit without watching the build',
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['json', 'summary'],
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Print the build log lines as they arrive (disables the spinner)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Hatch)

    const json = flags.output === 'json'
    const {verbose} = flags
    // Same gating as BaseCommand.waitForBuild(): a spinner belongs only on an
    // interactive TTY that is not emitting JSON and not interleaving log lines.
    const animate = Boolean(process.stdout.isTTY) && !json && !verbose

    const client = new HatchClient({
      baseUrl: resolveHatchUrl({env: process.env[HATCH_URL_ENV_VAR], flag: flags.api}),
      version: this.config.version,
    })

    // The build is server-side and unaffected by this process leaving; the
    // handler exists only so the user is told so rather than left guessing.
    const controller = new AbortController()
    const onInterrupt = (): void => controller.abort()
    process.on('SIGINT', onInterrupt)

    let result: HatchRunResult
    try {
      result = await runHatch({
        animate,
        client,
        interrupt: controller.signal,
        io: {
          err: (line) => this.logToStderr(line),
          out: (line) => this.log(line),
        },
        json,
        prompt: args.prompt,
        spinner: {
          start: (action, status) => ux.action.start(action, status),
          stop: (message) => ux.action.stop(message ?? ''),
          update(status) {
            ux.action.status = status
          },
        },
        verbose,
        wait: !flags['no-wait'],
      })
    } catch (error) {
      this.error((error as Error).message)
    } finally {
      process.off('SIGINT', onInterrupt)
    }

    if (result.exitCode !== 0) this.exit(result.exitCode)
  }
}
