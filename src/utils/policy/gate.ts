import type {ProfileConfig} from '../../base-command.js'
import type {PolicyFinding} from './types.js'

import {describePolicyError} from './errors.js'
import {findingLine} from './findings.js'

/** A release as the tenant deploy gate compares it. */
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

/** A mandatory policy of the base release that the release weakens: every one blocks. */
export interface GateRegression {
  change?: string
  enforcement?: string
  key?: string
  rules?: Array<string | {check?: string; id?: string; title?: string}>
  title?: string
}

/** A policy the base release shipped that the release does not. */
export interface GateRemoved {
  active?: boolean
  enforcement?: string
  key?: string
  title?: string
}

/**
 * The tenant deploy gate's answer: what `GET tenant/{name}/policy_gate` previews, and the payload of
 * the 403 a refused deploy answers (with `code: policy_gate`). The findings, regressions and removed
 * policies come only to a credential that reads the workspace's policies.
 */
export interface PolicyGateAnswer {
  base_release?: GateRelease | null
  can_override?: boolean
  changed?: number
  code?: string
  existing?: number
  /** The first blocking findings the release introduces. */
  findings?: PolicyFinding[]
  /** `tenant_deploy`, or `tenant_approve` when an approval completes the deploy. */
  gate?: string
  /** False for an ephemeral or sandbox tenant: the verdict is reported but never refuses. */
  gated?: boolean
  introduced?: number
  message?: string
  override_denied?: boolean
  regressions?: GateRegression[]
  regressions_total?: number
  release?: GateRelease | null
  removed?: GateRemoved[]
  removed_total?: number
  run_id?: number
  /** `pass`, `blocked`, `overridden`, `not_applicable`, `not_carried`, `disabled` or `unavailable`. */
  status?: string
  /** Every blocking finding the release introduces, listed or not. */
  total?: number
  truncated?: boolean
}

/** The refusal code a policy gate's 403 carries in `payload.code`. */
export const GATE_REFUSAL = 'policy_gate'

/** 2 when the gate refuses this deploy (blocked on a gated tenant); every other verdict is 0. */
export function gateExitCode(answer?: null | PolicyGateAnswer): number {
  return answer?.status === 'blocked' && answer.gated !== false ? 2 : 0
}

const CHANGES: Record<string, string> = {
  deactivated: 'deactivated',
  demoted: 'no longer mandatory',
  removed: 'removed',
  rules_changed: 'rules removed or changed',
}

function named(item: {key?: string; title?: string}): string {
  const key = item.key?.trim() || 'policy'
  const title = item.title?.trim()
  return title && title !== key ? `${key} (${title})` : key
}

function ruleName(rule: string | {check?: string; id?: string; title?: string}): string {
  if (typeof rule === 'string') return rule
  const id = rule.id?.trim() || rule.check?.trim() || 'rule'
  const title = rule.title?.trim()
  return title && title !== id ? `${id} ${title}` : id
}

function releaseLine(label: string, release?: GateRelease | null): string {
  if (!release) return `  ${label}: none (the tenant has no release yet, so only this release's own policies apply)`
  const name = release.name?.trim() || (release.id ? `#${release.id}` : 'unknown')
  const detail = release.status === 'not_carried'
    ? 'cut without its policies'
    : [release.run_id ? `policy run ${release.run_id}` : '', release.status ?? ''].filter(Boolean).join(', ')
  return `  ${label}: ${name}${detail ? ` (${detail})` : ''}`
}

/** The mandatory policies of the tenant's current release that the release weakens: each one blocks. */
function regressionLines(answer: PolicyGateAnswer): string[] {
  const regressions = answer.regressions ?? []
  if (regressions.length === 0) {
    return (answer.regressions_total ?? 0) > 0 ? [`  Mandatory policies this release weakens: ${answer.regressions_total}`] : []
  }

  return [
    `  Mandatory policies this release weakens (${regressions.length}), each of which blocks:`,
    ...regressions.map(regression => {
      const rules = (regression.rules ?? []).map(rule => ruleName(rule))
      const change = CHANGES[regression.change ?? ''] ?? regression.change ?? 'changed'
      return `    ${named(regression)}: ${change}${rules.length > 0 ? ` (${rules.join(', ')})` : ''}`
    }),
  ]
}

/** The policies the tenant's current release ships and the release does not, called out rather than diffed. */
function removedLines(answer: PolicyGateAnswer): string[] {
  const removed = answer.removed ?? []
  if (removed.length === 0) {
    return (answer.removed_total ?? 0) > 0 ? [`  Policies the current release ships and this release does not: ${answer.removed_total}`] : []
  }

  return [
    `  Policies the current release ships and this release does not (${removed.length}):`,
    ...removed.map(policy => `    ${named(policy)}: ${policy.enforcement ?? 'advisory'}, ${policy.active === false ? 'Inactive' : 'Active'}`),
  ]
}

/** The first blocking findings the release introduces, and where the rest of its findings are. */
function findingLines(answer: PolicyGateAnswer): string[] {
  const findings = answer.findings ?? []
  if (findings.length === 0) {
    const withheld = answer.findings === undefined && ((answer.introduced ?? 0) > 0 || (answer.regressions_total ?? 0) > 0)
    return withheld ? ['  The findings and policy names are listed only for a credential that reads policies (workspace:policy read).'] : []
  }

  const total = answer.total ?? findings.length
  const releaseName = answer.release?.name?.trim()
  return [
    `  Introduced findings (${total > findings.length ? `first ${findings.length} of ${total}` : findings.length}):`,
    ...findings.map(finding => `  ${findingLine(finding, new Map())}`),
    ...(releaseName ? [`  Every finding of the release: xano policy runs --release ${quoted(releaseName)}`] : []),
  ]
}

/**
 * The gate's verdict on stdout: a headline with its sentence, the releases it compared, what blocks
 * (the findings the release introduces, and the tenant's mandatory policies it weakens), the policies
 * it stops shipping, and the first introduced findings.
 */
export function gateLines(answer: PolicyGateAnswer): string[] {
  const status = answer.status?.trim() || 'unknown'
  const lines = [`Policy gate: ${status}`]
  if (answer.message?.trim()) lines.push(`  ${answer.message.trim()}`)
  if (answer.release !== undefined) lines.push(releaseLine('Release', answer.release))
  if (answer.release !== undefined && answer.base_release !== undefined) {
    lines.push(releaseLine('Compared with the tenant\'s current release', answer.base_release))
  }

  if (['blocked', 'overridden', 'pass'].includes(status) && typeof answer.introduced === 'number') {
    lines.push(`  Blocking findings: ${answer.introduced} introduced by this release, ${answer.existing ?? 0} already in the current release (those never block)`)
  }

  lines.push(...regressionLines(answer), ...removedLines(answer), ...findingLines(answer))
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
 * The set-live verdict: its status, what blocks, and the first blocking findings. `subject` is what
 * is set live: a branch, or the branch a release was deployed as (`release deploy --set_live`).
 */
export function setLiveGateLines(answer: PolicyGateAnswer, subject: 'branch' | 'release'): string[] {
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

/** A policy gate's refusal read from a failed response: its message and answer, or `null` for any other failure. */
export async function gateRefusal(response: Response): Promise<GateRefused | null> {
  if (response.status !== 403) return null
  let body: unknown
  try {
    body = JSON.parse(await response.clone().text())
  } catch {
    return null
  }

  const payload = body && typeof body === 'object' ? (body as {payload?: unknown}).payload : undefined
  if (!payload || typeof payload !== 'object' || (payload as {code?: unknown}).code !== GATE_REFUSAL) return null
  const answer = payload as PolicyGateAnswer
  const {message} = (body as {message?: unknown})
  return {answer, message: typeof message === 'string' && message.trim() ? message.trim() : (answer.message ?? 'Refused by the policy gate.')}
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
