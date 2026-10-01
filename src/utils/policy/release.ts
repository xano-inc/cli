import type {PolicyRunHead} from './types.js'

import {describePolicyError} from './errors.js'
import {quoted} from './gate.js'
import {policyPermissionGuidance} from './permission.js'
import {policyRequest, type PolicyRequestHost, type PolicyRequestRoute} from './request.js'

/**
 * One release's stored check as `GET release/policy_check` lists it, the read behind Studio's
 * Policies column: the run, its status, when it finished, its finding counts and how many policies
 * the release ships. A release without a stored run is not listed at all.
 */
export interface ReleasePolicyCheck {
  counts?: {advisory?: number; blocking?: number; errors?: number; findings?: number}
  finished_at?: string
  /** How many policies the release ships, inactive ones included. */
  policies?: number
  release_id?: number
  run_id?: number
  /** `pass`, `fail` (a rule found something, advisory or not) or `error` (a rule could not run). */
  status?: string
}

/** The most releases one `release/policy_check` request may name (the platform refuses more). */
const CHECKS_PER_REQUEST = 200

/** A request host's `error` that throws instead of exiting, for a read that may fail quietly. */
function fail(message: string): never {
  throw new Error(message)
}

/**
 * The stored checks of these releases, by release id, or `null` when they could not be read: the
 * Policies feature is off, the credential lacks `workspace:policy` read, the platform has no such
 * route, or the request failed. A release the answer leaves out has no stored check. The read
 * stores nothing and never checks a release on demand.
 */
export async function readReleasePolicyChecks(
  host: Omit<PolicyRequestHost, 'error'>,
  route: Omit<PolicyRequestRoute, 'label' | 'path'>,
  releaseIds: number[],
): Promise<Map<number, ReleasePolicyCheck> | null> {
  const ids = [...new Set(releaseIds.filter(id => Number.isSafeInteger(id) && id > 0))]
  const checks = new Map<number, ReleasePolicyCheck>()
  if (ids.length === 0) return checks
  const request = policyRequest({...host, error: fail}, {...route, label: 'Release policy check', path: ''})
  try {
    for (let start = 0; start < ids.length; start += CHECKS_PER_REQUEST) {
      const batch = ids.slice(start, start + CHECKS_PER_REQUEST).map(String)
      // Each batch is one request; the list is far shorter than a batch in practice.
      // eslint-disable-next-line no-await-in-loop
      const answer = await request('/release/policy_check', 'GET', undefined, {release_id: batch})
      const items = answer && typeof answer === 'object' ? (answer as {items?: unknown}).items : undefined
      if (!Array.isArray(items)) return null
      for (const item of items as ReleasePolicyCheck[]) {
        if (item && typeof item === 'object' && typeof item.release_id === 'number') checks.set(item.release_id, item)
      }
    }
  } catch {
    return null
  }

  return checks
}

/**
 * A release's stored check as a tag on its list line, worded as Studio's Policies column: the
 * findings it holds (`2 blocking, 1 advisory`, or `11 advisory`), `passed` when it holds none,
 * `none shipped` when the release carries no policies, `could not check` when a rule could not
 * run, and `not checked` for a release with no stored check. The tag is the release's own check,
 * its code against the policies it ships; whether a deploy is held is each tenant's question
 * (`tenant deploy_release --check`), so it never says blocked.
 */
export function releasePolicyCheckTag(check: null | ReleasePolicyCheck | undefined): string {
  return `[policies: ${releasePolicyCheckLabel(check)}]`
}

function releasePolicyCheckLabel(check: null | ReleasePolicyCheck | undefined): string {
  if (!check) return 'not checked'
  const findings = Math.max(0, check.counts?.findings ?? 0)
  const blocking = Math.max(0, check.counts?.blocking ?? 0)
  const advisory = Math.max(0, check.counts?.advisory ?? findings - blocking)
  const counts = [blocking > 0 ? `${blocking} blocking` : '', advisory > 0 ? `${advisory} advisory` : ''].filter(Boolean)
  if (check.status === 'error') return ['could not check', ...counts].join(', ')
  if (counts.length > 0) return counts.join(', ')
  return (check.policies ?? 0) > 0 ? 'passed' : 'none shipped'
}

/**
 * The policy check a release cut stored (`policy_run` on the create, multidoc push and import
 * answers): whether one was recorded (`recorded`, or `disabled`, `skipped` or `error` with a
 * message), the run, its verdict and how many of its findings block. `null` for a credential that
 * cannot read policies; absent from a platform that does not check releases.
 */
export interface ReleasePolicyRun {
  advisory?: number
  blocking?: number
  message?: string
  run_id?: number
  /** `pass`, `fail` or `error`; empty when nothing was recorded. */
  run_status?: string
  status?: string
}

/** A release's stored run, as `GET release/{id}/policy_run` serves it: a run summary plus the release's own keys. */
export interface ReleaseRunHead extends PolicyRunHead {
  release?: {branch?: {id?: number; label?: string}; id?: number}
  /** Every policy the release carries, inactive ones included. */
  shipped?: Array<{active?: boolean; enforcement?: string; key?: string; title?: string}>
}

/**
 * The cut's policy check as summary lines under a release's own (indented), or none when the answer
 * carries none. A cut is never refused: blocking findings are judged per tenant at deploy, so the
 * lines point at the deploy preview and the release's findings.
 */
export function releasePolicyRunLines(policyRun: unknown, releaseName?: string, releaseId?: number): string[] {
  if (!policyRun || typeof policyRun !== 'object') return []
  const check = policyRun as ReleasePolicyRun
  const status = check.status?.trim() || 'unknown'
  if (status !== 'recorded') {
    return [`  Policy check ${status}: ${check.message?.trim() || 'no message returned.'}`]
  }

  const blocking = check.blocking ?? 0
  const advisory = check.advisory ?? 0
  const findings = blocking + advisory === 0 ? 'no findings' : `${blocking} blocking, ${advisory} advisory ${blocking + advisory === 1 ? 'finding' : 'findings'}`
  const lines = [`  Policy check: ${check.run_status || 'recorded'} (run ${check.run_id ?? '?'}), ${findings}`]
  if (check.message?.trim()) lines.push(`    ${check.message.trim()}`)
  const name = releaseName?.trim() ? quoted(releaseName.trim()) : '<release_name>'
  const target = releaseName?.trim() || !releaseId ? `--release ${name}` : `--release-id ${releaseId}`
  if (blocking + advisory > 0) lines.push(`    Findings: xano policy runs ${target}`)
  if (blocking > 0 && releaseName?.trim()) lines.push(`    Its blocking findings block a deploy to a standard or run tenant: xano tenant deploy_release <tenant> --release ${name} --check`)
  return lines
}

/** The release's own facts about its check: where it was cut from and the policies it ships. */
export function releaseRunLines(releaseName: string, releaseId: number, run: ReleaseRunHead): string[] {
  const shipped = run.shipped ?? []
  const keys = shipped.map(policy => policy.key ?? '').filter(Boolean)
  const from = run.release?.branch?.label?.trim()
  return [
    `Release ${releaseName} (ID ${releaseId}): ships ${keys.length} ${keys.length === 1 ? 'policy' : 'policies'}${
      keys.length > 0 ? ` (${keys.join(', ')})` : ''}${from ? `; checked as cut from branch ${from}` : ''}`,
  ]
}

/**
 * A `release import` the platform refused for the policies the archive carries, as one message with
 * its remedy, or `null` for any other failure. An archive that says it carries policies needs the
 * `workspace:policy` create and update permission to import (`policy_permission_required` for the
 * role, `policy_scope_required` for the token), and nothing is stored without it.
 */
export function releaseImportRefusal(text: string, status: number, url: string): null | string {
  const {message, payload} = describePolicyError(text, status, url)
  const code = payload && typeof payload === 'object' ? (payload as {code?: unknown}).code : undefined
  if (typeof code !== 'string' || !code.startsWith('policy_')) return null
  return `${message}${policyPermissionGuidance(status, payload)}`
}
