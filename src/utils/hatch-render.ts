/**
 * Turning a Hatch activity stream into what the terminal shows.
 *
 * Everything here is a pure function of `(state, activity)`, so the whole of
 * `xano hatch`'s output can be tested with no socket, no TTY, and no clock.
 *
 * The fold emits two different things and the caller decides which to print:
 *
 * - `lines` — things that belong in the transcript no matter what (a completed
 *   phase, the final block, a `--verbose` log line).
 * - `status` — the current "what is happening right now" label.
 *
 * When the command is animating, `status` is the spinner label and only `lines`
 * are printed. When it is not — a non-TTY, `--verbose`, a redirect to a file —
 * there is no spinner to carry the status, so a *changed* status has to be
 * printed as a plain line; otherwise a piped build shows one line per phase and
 * nothing at all for the six minutes in between. {@link renderLines} is the one
 * place that difference lives; the fold itself is identical in both modes.
 */

import type {Activity, BuildOutcome, TerminalOutcome} from './hatch-contract.js'

import {isKnownActivity, phaseLabel} from './hatch-contract.js'

/**
 * The status before any activity arrives. Not empty on purpose: the gap between
 * submitting a prompt and the first `phase` event is not short — the agent pool
 * is small and a build behind a full one waits — and an empty terminal in that
 * window reads as a crash.
 */
export const QUEUED_STATUS = 'Queued'

/** The one outcome the user can act on immediately, and the only one not about their prompt. */
export const POOL_FULL_SENTENCE = 'Hatch had no free build slot — try again shortly.'

/** Fallback prose per outcome, used when the server sent no `message`. */
const DEFAULT_FAILURE_MESSAGE: Record<Exclude<TerminalOutcome, 'succeeded'>, string> = {
  expired: 'The build ran out of time before it finished.',
  failed: 'The build did not finish.',
  rejected: 'The build could not be started.',
}

export interface RenderOptions {
  /** Whether `log` activities are part of the transcript. */
  verbose?: boolean
  /** Printed by the terminal blocks so a user always has somewhere to look. */
  watchUrl?: string
}

/** How a build ended, plus the process exit code that ending implies. */
export interface RenderDone {
  exitCode: number
  outcome: BuildOutcome
}

export interface RenderState {
  /** Artifacts seen so far. Counted, never printed inline. */
  artifactCount: number
  /** Set once a `terminal` activity has been folded in; the fold stops there. */
  done?: RenderDone
  /** Time in the current phase, per the last heartbeat. Decorates the status only. */
  elapsedMs?: number
  /** Highest `seq` folded in, so a replayed prefix cannot double-count. */
  lastSeq: number
  /** The raw phase value, kept so the next `phase` can flush it as completed. */
  phase?: string
  /** The status without its elapsed decoration — this is what gets printed. */
  statusText: string
}

export interface RenderResult {
  /** Present only on the activity that ended the build. */
  done?: RenderDone
  /** Lines to print in either mode. */
  lines: string[]
  /** The state to fold the next activity into. */
  state: RenderState
  /** The spinner label: {@link RenderState.statusText} plus any elapsed time. */
  status: string
  /**
   * Whether the status changed in a way worth printing. A heartbeat refreshing
   * the elapsed time does not count — it would otherwise put a line in every
   * piped build every few seconds.
   */
  statusChanged: boolean
  /** The undecorated status, which is what non-animated mode prints. */
  statusText: string
}

export function initialRenderState(): RenderState {
  return {artifactCount: 0, lastSeq: 0, statusText: QUEUED_STATUS}
}

/** 0 on success; 1 on every other ending. */
export function exitCodeFor(outcome: TerminalOutcome): number {
  return outcome === 'succeeded' ? 0 : 1
}

/** `1m 05s`, or `42s` under a minute. Only ever decorates a spinner label. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

/**
 * Printed before the stream opens, so a user who never sees another byte still
 * has the link. Degrades to a link-free sentence against a Hatch deployed
 * before `?watch=1` existed, rather than printing `undefined`.
 */
export function openingBlock(watchUrl?: string): string[] {
  if (!watchUrl) {
    return ['Your idea is being created. No follow-along link is available, so watch here.']
  }

  return ['Your idea is being created, follow along for more details:', `  ${watchUrl}`]
}

/**
 * The success block. The URL sits alone on an indented line so it survives a
 * copy-paste and a `| tail -1`.
 *
 * `siteUrl` is promised on success and the client still must not crash without
 * it, so the watch link stands in.
 */
export function successBlock(outcome: BuildOutcome, watchUrl?: string): string[] {
  const url = outcome.siteUrl ?? watchUrl
  if (!url) return ['Your project is complete.']

  return ['Your project is complete, you can view it at:', `  ${url}`]
}

/**
 * The failure block, shared by `failed`, `expired`, and `rejected`. The
 * difference between "the agent could not do it" and "it ran out of time" is on
 * the page the watch link opens; pointing there beats paraphrasing it.
 */
export function failureBlock(outcome: BuildOutcome, watchUrl?: string): string[] {
  const kind = outcome.outcome === 'succeeded' ? 'failed' : outcome.outcome
  const lines = [outcome.message?.trim() || DEFAULT_FAILURE_MESSAGE[kind]]

  if (outcome.outcome === 'rejected') lines.push(POOL_FULL_SENTENCE)
  if (watchUrl) lines.push('You can see what happened at:', `  ${watchUrl}`)

  return lines
}

/** The terminal block for any outcome. */
export function terminalBlock(outcome: BuildOutcome, watchUrl?: string): string[] {
  return outcome.outcome === 'succeeded' ? successBlock(outcome, watchUrl) : failureBlock(outcome, watchUrl)
}

/**
 * What the caller actually prints.
 *
 * Animated: only `lines` — `status` is on the spinner. Not animated: `lines`
 * first, then the changed status as its own line, so a completed phase is
 * reported before the one that replaced it.
 */
export function renderLines(result: RenderResult, options: {animate: boolean}): string[] {
  if (options.animate || !result.statusChanged) return result.lines
  return [...result.lines, result.statusText]
}

/**
 * A dropped connection is otherwise invisible — the elapsed counter is driven
 * by server heartbeats, so during a backoff it simply freezes, which on a
 * fifteen-minute command is indistinguishable from a hang.
 *
 * The attempt number is part of the status so each attempt reads as a change,
 * and so non-animated mode prints once per attempt rather than once per drop.
 */
export function reduceReconnecting(state: RenderState, attempt: number): RenderResult {
  return build(state, {elapsedMs: undefined, statusText: `Reconnecting… (attempt ${attempt})`})
}

/**
 * The fold. One activity in, the next state plus whatever it should print out.
 *
 * An unrecognized `kind` is ignored rather than thrown on: Hatch may add
 * activity kinds, and an older CLI has to keep working against a newer server.
 * A `seq` at or below the highest already folded in is ignored too — the caller
 * drops replayed events by id, but a duplicate reaching here must not
 * double-count an artifact or re-flush a phase.
 */
export function reduceActivity(state: RenderState, activity: Activity, options: RenderOptions = {}): RenderResult {
  if (typeof activity.seq === 'number' && activity.seq <= state.lastSeq) return build(state, {})

  const seen = typeof activity.seq === 'number' ? {lastSeq: activity.seq} : {}
  if (!isKnownActivity(activity)) return build(state, seen)

  switch (activity.kind) {
    case 'artifact': {
      return build(state, {...seen, artifactCount: state.artifactCount + 1})
    }

    case 'heartbeat': {
      // Refreshes the elapsed time in the status and nothing else. Notably it
      // does not advance the phase, even though it carries one.
      return build(state, {...seen, elapsedMs: activity.elapsedInPhaseMs})
    }

    case 'log': {
      return build(state, seen, options.verbose ? [activity.line] : [])
    }

    case 'narration': {
      const label = state.phase === undefined ? undefined : phaseLabel(state.phase)
      return build(state, {
        ...seen,
        statusText: label ? `${label} — ${activity.message}` : activity.message,
      })
    }

    case 'phase': {
      // The previous phase is only complete once another one starts, so this is
      // where it gets flushed. The first phase has nothing to flush.
      const previous = state.phase
      return build(
        state,
        {...seen, elapsedMs: undefined, phase: activity.phase, statusText: phaseLabel(activity.phase)},
        previous !== undefined && previous !== activity.phase ? [`✓ ${phaseLabel(previous)}`] : [],
      )
    }

    case 'terminal': {
      const outcome: BuildOutcome = {
        ...(activity.message === undefined ? {} : {message: activity.message}),
        outcome: activity.outcome,
        ...(activity.siteUrl === undefined ? {} : {siteUrl: activity.siteUrl}),
      }
      const done: RenderDone = {exitCode: exitCodeFor(activity.outcome), outcome}

      // The status is left alone: the final block says everything, and moving
      // the status here would put a redundant line in a piped run.
      return build(state, {...seen, done, elapsedMs: undefined}, terminalBlock(outcome, options.watchUrl))
    }

    default: {
      return build(state, seen)
    }
  }
}

/** Assembles a result, deriving `status` and `statusChanged` from the transition. */
function build(state: RenderState, changes: Partial<RenderState>, lines: string[] = []): RenderResult {
  const next: RenderState = {...state, ...changes}
  const statusChanged = next.statusText !== state.statusText

  return {
    ...(next.done === undefined ? {} : {done: next.done}),
    lines,
    state: next,
    status: next.elapsedMs === undefined ? next.statusText : `${next.statusText} (${formatElapsed(next.elapsedMs)})`,
    statusChanged,
    statusText: next.statusText,
  }
}
