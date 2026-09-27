import type {PolicyRunHead} from './types.js'

import {quoted} from './gate.js'

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
  if (blocking > 0 && releaseName?.trim()) lines.push(`    Each tenant's deploy is gated on the ones it introduces: xano tenant deploy_release <tenant> --release ${name} --check`)
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
