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

export interface PolicyCheck {
  blocking?: boolean
  /** The subset of `findings` that blocks. The platform sends both; both are shown. */
  blocking_findings?: PolicyFinding[]
  findings?: PolicyFinding[]
  message?: string
  results?: PolicyRuleResult[]
  /**
   * `pass` or `fail` for a completed evaluation; otherwise why there is none: `disabled`,
   * `not_applicable`, `forbidden`, `unavailable` or `error`.
   */
  status?: string
}

export interface Policy {
  enforcement: string
  id: number
  key: string
  lifecycle: string
  rules?: Array<{id: string}>
  title?: string
  updated_at?: number | string
  /** The index of the policy's newest Version History entry; it moves only when the definition changes. */
  version: number
}

export interface PolicyRun {
  findings?: PolicyFinding[]
  finished_at?: number | string
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
