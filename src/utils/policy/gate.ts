import type {ProfileConfig} from '../../base-command.js'
import type {PolicyFinding} from './types.js'

import {describePolicyError} from './errors.js'
import {findingLine} from './findings.js'
import {WEAKENING_REFUSAL} from './permission.js'

/** The release the tenant deploy gate judges. */
export interface GateRelease {
  /** Whether the release was cut with its policies; one cut without them has no check. */
  carried?: boolean
  counts?: null | {advisory?: number; blocking?: number; errors?: number; findings?: number}
  id?: number
  name?: string
  /** The release's stored policy run, 0 when it has none. */
  run_id?: number
  status?: string
}

/**
 * The tenant deploy gate's answer: what `GET tenant/{name}/policy_gate` previews, and the payload of
 * the 403 a refused deploy answers (with `code: policy_gate`). The gate judges the release alone, by
 * its own policy check, so the same release gets the same verdict on every tenant; only `gated`
 * differs. The findings come only to a credential that reads the workspace's policies.
 */
export interface PolicyGateAnswer {
  can_override?: boolean
  code?: string
  /** The first of the release's blocking findings. */
  findings?: PolicyFinding[]
  /** `tenant_deploy`, or `tenant_approve` when an approval completes the deploy. */
  gate?: string
  /** False for an ephemeral or sandbox tenant: the verdict is reported but never refuses. */
  gated?: boolean
  message?: string
  override_denied?: boolean
  release?: GateRelease | null
  run_id?: number
  /** `pass`, `blocked`, `overridden`, `not_applicable`, `not_carried`, `disabled` or `unavailable`. */
  status?: string
  /** Every blocking finding the release has, listed or not. */
  total?: number
  truncated?: boolean
}

/**
 * A gate that measures a change against the live branch (set-live, publish, a live-branch save): its
 * blocking findings split by why they block.
 */
export interface LiveGateAnswer extends Omit<PolicyGateAnswer, 'gated' | 'release'> {
  changed?: number
  existing?: number
  introduced?: number
}

/** The refusal code a policy gate's 403 carries in `payload.code`. */
export const GATE_REFUSAL = 'policy_gate'

/** 2 when the gate refuses this deploy (blocked on a gated tenant); every other verdict is 0. */
export function gateExitCode(answer?: null | PolicyGateAnswer): number {
  return answer?.status === 'blocked' && answer.gated !== false ? 2 : 0
}

function releaseLine(release: GateRelease | null | undefined, status: string): string {
  if (!release) return '  Release: unknown'
  const name = release.name?.trim() || (release.id ? `#${release.id}` : 'unknown')
  const detail = status === 'not_carried' || release.status === 'not_carried'
    ? 'cut without its policies'
    : [release.run_id ? `policy run ${release.run_id}` : '', release.status ?? ''].filter(Boolean).join(', ')
  return `  Release: ${name}${detail ? ` (${detail})` : ''}`
}

/** The first of the release's blocking findings, and where the rest of its findings are. */
function findingLines(answer: PolicyGateAnswer): string[] {
  const findings = answer.findings ?? []
  if (findings.length === 0) {
    const withheld = answer.findings === undefined && (answer.total ?? 0) > 0
    return withheld ? ['  The findings are listed only for a credential that reads policies (workspace:policy read).'] : []
  }

  const total = answer.total ?? findings.length
  const releaseName = answer.release?.name?.trim()
  return [
    `  Blocking findings (${total > findings.length ? `first ${findings.length} of ${total}` : findings.length}):`,
    ...findings.map(finding => `  ${findingLine(finding, new Map())}`),
    ...(releaseName ? [`  Every finding of the release: xano policy runs --release ${quoted(releaseName)}`] : []),
  ]
}

/**
 * The gate's verdict on stdout: a headline with its sentence, the release it judged, how many of its
 * findings block, and the first of them. Every blocking finding of the release counts, whatever the
 * tenant runs today.
 */
export function gateLines(answer: PolicyGateAnswer): string[] {
  const status = answer.status?.trim() || 'unknown'
  const lines = [`Policy gate: ${status}`]
  if (answer.message?.trim()) lines.push(`  ${answer.message.trim()}`)
  if (answer.release !== undefined) lines.push(releaseLine(answer.release, status))
  // Listed findings carry their own count; otherwise say how many there are.
  if (['blocked', 'overridden', 'pass'].includes(status) && typeof answer.total === 'number' && (answer.findings ?? []).length === 0) {
    lines.push(`  Blocking findings in this release: ${answer.total}`)
  }

  lines.push(...findingLines(answer))
  if (answer.gated === false) lines.push('  Not gated: this tenant is ephemeral or a sandbox, so the verdict never refuses a deploy to it.')
  return lines
}

/**
 * The line a completed deploy prints about its gate. A blocked verdict on an ephemeral or sandbox
 * tenant refused nothing (the deploy went ahead), so it says so rather than reading as a failure.
 */
export function deployedGateLine(answer: PolicyGateAnswer): string {
  const status = answer.status?.trim() || 'unknown'
  return status === 'blocked' && answer.gated === false
    ? 'Policy gate: blocked (not gated: this tenant is ephemeral or a sandbox, so the deploy went ahead)'
    : `Policy gate: ${status}`
}

/**
 * The verdict of a gate that measures a change against the live branch (set-live, publish): its
 * status, what blocks, and the first blocking findings. `subject` is what changes: a branch set live,
 * the branch a release was deployed as (`release deploy --set_live`), or an object saved to live.
 */
export function liveGateLines(answer: LiveGateAnswer, subject: 'branch' | 'release' | 'save'): string[] {
  const lines = [`Policy gate: ${answer.status?.trim() || 'unknown'}`]
  if (typeof answer.total === 'number') {
    lines.push(`  Blocking findings: ${answer.total} (${answer.introduced ?? 0} introduced, ${answer.changed ?? 0} on objects the ${subject} changes); ${answer.existing ?? 0} already on the live branch never block`)
  }

  const findings = answer.findings ?? []
  if (findings.length > 0) {
    lines.push(...findings.map(finding => `  ${findingLine(finding, new Map())}`))
    if (answer.truncated) lines.push('  Only the first findings are listed.')
  } else if (answer.findings === undefined && (answer.total ?? 0) > 0) {
    lines.push('  The findings are listed only for a credential that reads policies (workspace:policy read).')
  }

  return lines
}

/**
 * A save the live-branch publish gate refused (`function create`, `function edit`): what goes on
 * stdout (the verdict, or under `-o json` `{created|updated: false, message, policy_gate}`) and the
 * error the command exits 2 with, saying nothing was saved and how to proceed (`rerun` is the same
 * command with `--policy-override`).
 */
export function publishRefusal(refused: GateRefused, options: {json: boolean; outcome: 'created' | 'updated'; rerun: string}): {lines: string[]; message: string} {
  const lines = options.json
    ? [JSON.stringify({message: refused.message, [options.outcome]: false, policy_gate: refused.answer}, null, 2)]
    : liveGateLines(refused.answer, 'save')
  return {lines, message: `Nothing was saved. ${refused.message}${gateOverrideHint(refused.answer, options.rerun)}`}
}

/** The refusal of a `--policy-override` given without a reason, before any request is made. */
export const BLANK_POLICY_OVERRIDE = '--policy-override needs a reason: say why this change may proceed past the policy gate.'

/** True when `--policy-override` was given but holds only whitespace. */
export function blankPolicyOverride(reason?: string): boolean {
  return reason !== undefined && !reason.trim()
}

/** A value quoted for the shell when it needs it. */
export function quoted(value: string): string {
  return /^[\w.@%+=:,/-]+$/.test(value) ? value : `"${value.replaceAll(/(["\\$`])/g, String.raw`\$1`)}"`
}

/**
 * What to do about a refusal: override it (the credential may, and `command` is how), or ask for
 * the permission. A refusal whose override was denied already says so in its message.
 */
export function gateOverrideHint(answer: PolicyGateAnswer, command: string): string {
  if (answer.override_denied) return ''
  if (answer.can_override) return `\nTo proceed past the policy gate with a reason (audited): ${command}`
  return '\nOverriding the policy gate needs the `workspace:policy` update permission; ask someone who has it.'
}

/** A deploy the policy gate refused: the platform's sentence and the gate's answer. */
export interface GateRefused {
  answer: PolicyGateAnswer
  message: string
}

/**
 * What a command the gate refused prints on stdout: the verdict, or under `-o json` the refusal as
 * `{deployed: false, message, policy_gate}`. The command then exits 2 with the message.
 */
export function gateRefusalOutput(refused: GateRefused, json: boolean): string[] {
  return json
    ? [JSON.stringify({deployed: false, message: refused.message, policy_gate: refused.answer}, null, 2)]
    : gateLines(refused.answer)
}

/** A 403 whose `payload.code` is `code`: its trimmed message (`''` for none) and payload, or `null` for any other failure. The body is left unread. */
async function coded403(response: Response, code: string): Promise<null | {message: string; payload: Record<string, unknown>}> {
  if (response.status !== 403) return null
  let body: unknown
  try {
    body = JSON.parse(await response.clone().text())
  } catch {
    return null
  }

  const payload = body && typeof body === 'object' ? (body as {payload?: unknown}).payload : undefined
  if (!payload || typeof payload !== 'object' || (payload as {code?: unknown}).code !== code) return null
  const {message} = (body as {message?: unknown})
  return {message: typeof message === 'string' ? message.trim() : '', payload: payload as Record<string, unknown>}
}

/** A policy gate's refusal read from a failed response: its message and answer, or `null` for any other failure. */
export async function gateRefusal(response: Response): Promise<GateRefused | null> {
  const refused = await coded403(response, GATE_REFUSAL)
  if (!refused) return null
  const answer = refused.payload as PolicyGateAnswer
  return {answer, message: refused.message || (answer.message ?? 'Refused by the policy gate.')}
}

/**
 * A change refused because it weakens a policy active and mandatory on the branch, from a caller
 * without the `workspace:policy` update permission (`policy_weakening_permission_required`). A
 * release deploy or archive import with set live adds the branch it landed, which stays.
 */
export interface WeakeningRefused {
  message: string
  payload: {branch?: {id?: number; label?: string}; code: string; gate?: string; level?: string; permission?: string; policies?: string[]}
}

/** The weakening refusal read from a failed response, or `null` for any other failure. */
export async function weakeningRefusal(response: Response): Promise<null | WeakeningRefused> {
  const refused = await coded403(response, WEAKENING_REFUSAL)
  if (!refused) return null
  return {message: refused.message || 'Refused: the change weakens a mandatory policy.', payload: refused.payload as WeakeningRefused['payload']}
}

/** What a gate preview needs from the command that asks for it. */
export interface GateHost {
  verboseFetch(url: string, options: RequestInit, verbose: boolean, authToken?: string): Promise<Response>
}

/** A preview the platform could not answer: the HTTP status, its message and the refusal's payload. */
export interface GateUnavailable {
  message: string
  payload?: unknown
  status: number
}

/**
 * `GET workspace/{ws}/tenant/{tenant}/policy_gate?release_name=`: what the gate would decide for the
 * release on the tenant, without deploying. A refusal (the Policies feature is off, the credential
 * cannot read policies, no such tenant or release) is answered as `unavailable` rather than thrown.
 */
export async function fetchPolicyGate(
  host: GateHost,
  target: {profile: ProfileConfig; release: string; tenant: string; verbose: boolean; workspace: string},
): Promise<{answer: PolicyGateAnswer} | {unavailable: GateUnavailable}> {
  const {profile, release, tenant, verbose, workspace} = target
  const query = new URLSearchParams({release_name: release})
  const url = `${profile.instance_origin}/api:meta/workspace/${workspace}/tenant/${encodeURIComponent(tenant)}/policy_gate?${query}`
  const response = await host.verboseFetch(
    url,
    {headers: {accept: 'application/json', Authorization: `Bearer ${profile.access_token}`}, method: 'GET'},
    verbose,
    profile.access_token,
  )
  const text = (await response.text()).replaceAll(profile.access_token, '[REDACTED]')
  if (!response.ok) {
    const {message, payload} = describePolicyError(text, response.status, url)
    return {unavailable: {message, payload, status: response.status}}
  }

  try {
    return {answer: JSON.parse(text) as PolicyGateAnswer}
  } catch {
    return {unavailable: {message: `The policy gate answered a ${response.status} that is not JSON.`, status: response.status}}
  }
}

/** Why a preview is not available, in a few words for a line that must not fail its command. */
export function unavailableReason(unavailable: GateUnavailable): string {
  const code = unavailable.payload && typeof unavailable.payload === 'object' ? (unavailable.payload as {code?: unknown}).code : undefined
  switch (code) {
    case 'policy_feature_disabled': {
      return 'the Policies feature is off on this instance'
    }

    case 'policy_permission_required': {
      return 'your role lacks the `workspace:policy` read permission'
    }

    case 'policy_scope_required': {
      return 'this Metadata API token lacks the `workspace:policy` scope'
    }

    default: {
      if (unavailable.status === 401) return 'the Metadata API token was not accepted'
      return unavailable.message.replace(/^[a-z_]+: /i, '') || `the server answered ${unavailable.status}`
    }
  }
}
