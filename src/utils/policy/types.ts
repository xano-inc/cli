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
  object?: {id?: number; name?: string; type?: string}
  policy_key?: string
  policy_title?: string
  rule_id?: string
  rule_title?: string
  severity?: string
}

/**
 * A finding as the platform trims it for a caller without `workspace:policy` read (`access:
 * "coverage"`): no rule id, severity, params or `allow`, but the check's label, first description
 * sentence and fix hint, and whether it blocks.
 */
export interface CoverageFinding extends PolicyFinding {
  blocking?: boolean
  /** `null` when the rule can no longer be resolved (a deleted policy, a rule removed since the run). */
  check?: null | {description?: string; fix_hint?: string; label?: string}
  /** Coverage only: the run evaluated a policy the branch no longer holds. */
  deleted?: boolean
}

/** The verdict every `policy_check` carries. */
export interface PolicyVerdict {
  /** True when an active, blocking policy failed; it decides the exit code whatever the status. */
  blocking?: boolean
  /** The platform's verdict, including the names of rules that checked no objects. */
  message?: string
  run_id?: number
  /**
   * `pass`, `fail` or `error` (a check could not run) for an evaluation; `disabled`,
   * `not_applicable` or `unavailable` when nothing was evaluated. An older platform answers
   * `forbidden` to a caller without `workspace:policy` read, which is reported like any other
   * status it has no headline for.
   */
  status?: string
}

/** A run's finding counts: every finding, the blocking ones, and the rules that could not run. */
export interface PolicyCounts {
  /** The findings that do not block; the run summary serves it, a push's feedback does not. */
  advisory?: number
  blocking: number
  errors: number
  findings: number
}

/**
 * A push's `policy_check`: the verdict with its findings and results, since a push answers no run.
 * The lists hold the first 100 each, in the platform's order; the stored run (`run_id`) has them all.
 */
export interface PushPolicyCheck extends PolicyVerdict {
  /**
   * `coverage` for a caller without `workspace:policy` read: the findings are only those on the
   * objects the push carried that the caller may read (the workspace too, for a push that carried
   * the workspace document and a caller with `workspace:settings` read), trimmed (`CoverageFinding`),
   * with `run_id` 0, `results` empty and a `note`. `counts` are about those findings, except
   * `counts.errors` (the branch's); `blocking` is what a reader's push of the same change says, so
   * the exit code is the same whoever pushed.
   */
  access?: string
  /** The first blocking findings. */
  blocking_findings?: PolicyFinding[]
  /** What the lists are out of. */
  counts?: PolicyCounts
  /**
   * A trimmed answer's count of the findings on the objects the push does not list (never named).
   * `basis` `introduced`: those the push introduced (not in the push gate's evaluation of the branch
   * before it on the live branch; elsewhere not in the newest run that still described the branch);
   * `all`: no baseline was known, so every finding there. An older platform sends no `basis`.
   */
  elsewhere?: {basis?: string; blocking?: number; total?: number}
  /** The first findings, blocking first. */
  findings?: PolicyFinding[]
  /** The platform's sentence on what a trimmed answer leaves out (`access: "coverage"`). */
  note?: string
  results?: PolicyRuleResult[]
  /** `pushed_objects` beside `access: "coverage"`: the findings are about the pushed objects only. */
  scope?: string
  /** Every finding, listed or not. */
  total?: number
  /** Whether either list was cut. */
  truncated?: boolean
}

/** One policy that applies to an object, as the coverage route serves it. */
export interface ObjectCoveragePolicy {
  blocking?: boolean
  /** `blocking` or `advisory`. */
  enforcement?: string
  key?: string
  /** Why it applies here, one plain sentence per rule. */
  reasons?: string[]
  /** `failing`, `passing` or `not_checked`. */
  status?: string
  title?: string
}

/**
 * `GET policy/object/coverage`: which active policies apply to one object, and its findings in the
 * branch's newest run, trimmed for anyone who may read the object (`workspace:policy` read is not
 * needed). The same trimmed shape for every caller.
 */
export interface ObjectCoverage {
  access?: string
  findings?: CoverageFinding[]
  note?: string
  object?: {app_id?: number; id?: number; name?: string; type?: string}
  policies?: ObjectCoveragePolicy[]
  /** The branch's newest ended run, `null` before the first. */
  run?: null | {started_at?: string; status?: string}
  summary?: {
    advisory?: number
    applies?: number
    blocking?: number
    not_checked?: number
    passing?: number
    /** `none_apply`, `findings`, `not_checked`, `check_failed` or `pass`. */
    state?: string
  }
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
  active: boolean
  enforcement: string
  id: number
  key: string
  latest_run?: PolicyCoverage
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
  /** The summary answer's counts (`--summary`). */
  counts?: PolicyCounts
  /** `blocking_total`: every blocking finding, beside the summary answer's listed ones. */
  policy_check?: PolicyVerdict & {blocking_finding_ids?: string[]; blocking_total?: number}
  stored?: boolean
  /** The summary answer: every finding, and whether `findings` lists only the first. */
  total?: number
  truncated?: boolean
}

/** One run without its findings, as `GET run/{id}/summary` serves it. */
export interface PolicyRunHead extends PolicyRun {
  counts?: PolicyCounts
  /** The snapshot, each policy with its verdict in this run. */
  policies?: Array<PolicySnapshotPolicy & {blocking?: boolean; findings?: number; objects_checked?: number; status?: string}>
}

/** One page of a run's findings, as `GET run/{id}/findings` serves it. */
export interface PolicyFindingsPage {
  items: PolicyFinding[]
  limit: number
  offset: number
  /** The findings that match the filters, listed or not. */
  total: number
}
