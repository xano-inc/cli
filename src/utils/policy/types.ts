/** The shapes the policy routes answer with. Policy grammar belongs to the platform. */
export interface PolicyCatalogueEntry {
  description?: string
  fix_hint?: string
  id: string
  /** The check's human name. */
  label: string
  object_kinds?: string[]
  params?: Record<string, {required?: boolean; type?: string}>
  /** Params of which a rule must set at least one. */
  requires_one_of?: string[]
}

/** One rule as a run snapshot records it: the settings the check ran with, plus the check's label. */
export interface PolicySnapshotRule {
  check?: string
  id?: string
  label?: string
  /** The resolved settings; PHP sends an empty map as `[]`. */
  params?: unknown
  title?: string
}

/** One policy as a run snapshot records it, including the description it carried at run time. */
export interface PolicySnapshotPolicy {
  key?: string
  rules?: PolicySnapshotRule[]
  /** The policy description as written at run time. */
  statement?: string
  title?: string
  /** The Version History index this run evaluated. */
  version?: number
}

export interface PolicyRuleResult {
  check_id?: string
  checked?: number
  message?: string
  policy_key?: string
  status?: string
  warnings?: string[]
}

export interface PolicyFinding {
  /** Stable finding id, used to tell a blocking finding from an advisory one. */
  id?: string
  message?: string
  object?: {name?: string; type?: string}
  policy_key?: string
  policy_title?: string
  rule_id?: string
  rule_title?: string
  severity?: string
}

/** The verdict every `policy_check` carries. */
export interface PolicyVerdict {
  /** True when an active, mandatory policy failed; it decides the exit code whatever the status. */
  blocking?: boolean
  /** The platform's fixed sentence for the status. */
  message?: string
  run_id?: number
  /**
   * `pass`, `fail` or `error` (a check could not run) for an evaluation; `disabled`,
   * `not_applicable`, `forbidden` or `unavailable` when nothing was evaluated.
   */
  status?: string
}

/** A push's `policy_check`: the verdict with its findings and results, since a push answers no run. */
export interface PushPolicyCheck extends PolicyVerdict {
  /** The subset of `findings` that blocks. */
  blocking_findings?: PolicyFinding[]
  findings?: PolicyFinding[]
  results?: PolicyRuleResult[]
}

/** A policy's place in its branch's newest run, as the platform serves it on every policy. */
export interface PolicyCoverage {
  enforcement: null | string
  /** Whether the newest run evaluated this policy at all. */
  included: boolean
  /** 0 when the branch has no run. */
  run_id: number
  /** True only when the newest run evaluated a different version of this policy. */
  stale: boolean
  version: null | number
}

export interface Policy {
  enforcement: string
  id: number
  key: string
  latest_run?: PolicyCoverage
  lifecycle: string
  rules?: Array<{id: string}>
  title?: string
  /** When the policy was last written, as served; sent back as `last_updated_at` to refuse acting on a stale read. */
  updated_at?: number | string
  /** The index of the policy's newest Version History entry; it moves only when the definition changes. */
  version: number
}

/** One stored run as the run list serves it: the verdict and counts, without findings or results. */
export interface PolicyRunSummary {
  counts: {blocking: number; errors: number; findings: number}
  finished_at?: string
  id: number
  objects_checked: number
  started_at?: string
  status: string
  trigger?: string
}

/** One run in full, as `GET run/{id}` serves it. */
export interface PolicyRun {
  findings?: PolicyFinding[]
  finished_at?: number | string
  /** 0 for an evaluation that was not stored. */
  id?: number
  /** How many workspace objects the run inspected. */
  objects_checked?: number
  /** The snapshot of the policies as they were when the run went out. */
  policies?: PolicySnapshotPolicy[]
  results?: PolicyRuleResult[]
  started_at?: number | string
  status?: string
  trigger?: string
}

/**
 * What `policy evaluate` answers: the run as `GET run/{id}` serves it, whether it was stored, and the verdict.
 * With no active policy on the branch it is no run at all: `id` 0, `status` `not_applicable`, nothing evaluated.
 */
export interface PolicyEvaluation extends PolicyRun {
  policy_check?: PolicyVerdict & {blocking_finding_ids?: string[]}
  stored?: boolean
}
