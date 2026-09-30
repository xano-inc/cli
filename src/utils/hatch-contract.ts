/**
 * A hand-written copy of the subset of Hatch's contract this CLI reads.
 *
 * Hatch's own `shared/contracts.ts` is an unpublished workspace file in a
 * different repository; this package is released independently and cannot
 * import it. Only what `xano hatch` consumes is copied here.
 *
 * It is a permissive superset on purpose: an activity `kind` or a phase this
 * CLI has never heard of must degrade to "ignored", never to a throw, so a
 * newer Hatch keeps working against an older CLI.
 */

export const BUILD_PHASES = ['queued', 'scaffolding', 'backend', 'frontend', 'deploying', 'done'] as const

export type BuildPhase = (typeof BUILD_PHASES)[number]

/** Phase copy, mirroring Hatch's `frontend/src/lib/labels.ts`. */
export const PHASE_LABELS: Record<BuildPhase, string> = {
  backend: 'Backend',
  deploying: 'Deploying',
  done: 'Done',
  frontend: 'Frontend',
  queued: 'Waiting',
  scaffolding: 'Setting up',
}

/** Falls back to the raw value so an unknown phase renders as itself. */
export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase as BuildPhase] ?? phase
}

/** The states a build can end in. Everything else is in-flight. */
export const TERMINAL_OUTCOMES = ['succeeded', 'failed', 'expired', 'rejected'] as const

export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number]

export type SessionState =
  | 'building'
  | 'deploying'
  | 'draft'
  | 'provisioning'
  | 'queued'
  | TerminalOutcome

export function isTerminalOutcome(state: string): state is TerminalOutcome {
  return (TERMINAL_OUTCOMES as readonly string[]).includes(state)
}

export const ACTIVITY_KINDS = ['phase', 'narration', 'artifact', 'log', 'heartbeat', 'terminal'] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export interface ActivityBase {
  /** Epoch milliseconds, server-assigned. */
  at: number
  kind: string
  /** Monotonic per-session sequence; doubles as the SSE `Last-Event-ID`. */
  seq: number
}

export interface PhaseActivity extends ActivityBase {
  kind: 'phase'
  phase: BuildPhase
}

export interface NarrationActivity extends ActivityBase {
  kind: 'narration'
  message: string
}

export interface ArtifactActivity extends ActivityBase {
  action: 'created' | 'deleted' | 'failed' | 'modified'
  kind: 'artifact'
  path: string
}

export interface LogActivity extends ActivityBase {
  kind: 'log'
  line: string
  role?: 'input' | 'output'
  stream: 'stderr' | 'stdout'
}

export interface HeartbeatActivity extends ActivityBase {
  elapsedInPhaseMs: number
  filesWritten: number
  kind: 'heartbeat'
  lastAction: string
  phase: BuildPhase
}

export interface TerminalActivity extends ActivityBase {
  kind: 'terminal'
  /** User-facing prose on any non-success outcome. */
  message?: string
  outcome: TerminalOutcome
  /** Present only when `outcome === 'succeeded'`. */
  siteUrl?: string
}

export type KnownActivity =
  | ArtifactActivity
  | HeartbeatActivity
  | LogActivity
  | NarrationActivity
  | PhaseActivity
  | TerminalActivity

/** An activity off the wire: known kinds are typed, anything else is inert. */
export type Activity = ActivityBase | KnownActivity

export function isKnownActivity(activity: Activity): activity is KnownActivity {
  return (ACTIVITY_KINDS as readonly string[]).includes(activity.kind)
}

/** How a build ended — the one shape both the stream and the snapshot yield. */
export interface BuildOutcome {
  message?: string
  outcome: TerminalOutcome
  siteUrl?: string
}

/** `POST /api/sessions` */
export interface CreateSessionResponse {
  sessionId: string
  state: SessionState
  /** Absolute, server-built, and present only when `?watch=1` was asked for. */
  watchUrl?: string
}

/** `GET /api/sessions/:id` */
export interface SessionSnapshot {
  createdAt: number
  failureMessage?: string
  phase: BuildPhase
  prompt: string
  sessionId: string
  siteUrl?: string
  state: SessionState
}
