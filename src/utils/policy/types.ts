/** The shapes the policy routes answer with. Policy grammar belongs to the platform. */
export interface PolicyCatalogueEntry {
  /** The catalogue's group for the check (`security`, `data_access`…), served as an id with no label. */
  category?: string
  description?: string
  fix_hint?: string
  id: string
  /** The check's human name. */
  label: string
  object_kinds?: string[]
  params?: Record<string, PolicyParamSchema>
  /** Params of which a rule must set at least one. */
  requires_one_of?: string[]
  /** The shared scope params that can narrow this check; each is described in `params`. */
  scope_fields?: Array<{applies_when?: Record<string, unknown>; name: string}>
  /** Goals in a customer's words, each with the complete params (scope params included) that achieve it. */
  uses?: PolicyCheckUse[]
}

/** One of a check's `uses`: a goal and a rule's params its check accepts as written. */
export interface PolicyCheckUse {
  goal: string
  /** What to know before using it, when the goal alone could mislead. */
  note?: string
  /** PHP sends an empty map as `[]`. */
  params: Record<string, unknown> | unknown[]
}

/** One param as the catalogue describes it: a nested object's parts are its `properties`. */
export interface PolicyParamSchema {
  /** The value an unset param takes; PHP sends an empty map as `[]`. */
  default?: unknown
  description?: string
  /** A value that fits the param, shown as a hint; never filled in. */
  example?: unknown
  /**
   * An exception list's kind (`type: "exception[]"`): `tag`, `path`, `entry` or `object`. Each entry is
   * `{value, reason}`, or for `object` (`except_objects`) `{kind, guid, name, reason}`, the server
   * stamping `by` and `at`.
   */
  exception?: string
  /** An exception list's rule for each entry's `value`, as the param's items were described before. */
  items?: PolicyParamSchema
  /** The smallest whole number an `integer` param takes. */
  minimum?: number
  /** A nested object's parts; a `<name>` key stands for a key the author chooses. */
  properties?: Record<string, PolicyParamSchema>
  required?: boolean
  type?: string
  /** The values a `string` param takes, or a `string[]` param's entries. */
  values?: unknown[]
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
  /** `warn` or `block` as the run evaluated it (an `off` policy is not evaluated). */
  enforcement?: string
  guid?: string
  key?: string
  rules?: PolicySnapshotRule[]
  /** The policy description as written at run time. */
  statement?: string
  /** The template id the policy was created from; empty for one built from scratch or by the agent. */
  template?: string
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
  /** Stable finding id, used to tell a Block finding from a Warn one. */
  id?: string
  /** The technical sentence: the detail behind `reason`. */
  message?: string
  object?: {guid?: string; id?: number; name?: string; type?: string}
  policy_key?: string
  policy_title?: string
  /** What the object does wrong, in a few plain words; an older stored run's finding has none. */
  reason?: string
  rule_id?: string
  rule_title?: string
  severity?: string
}

/**
 * A finding as the platform trims it for a caller without `workspace:policy` read (`access:
 * "coverage"`): no rule id, severity, params or `allow`, but the check's label, first description
 * sentence and fix hint, and whether its policy is a Block one.
 */
export interface CoverageFinding extends PolicyFinding {
  block?: boolean
  /** `null` when the rule can no longer be resolved (a deleted policy, a rule removed since the run). */
  check?: null | {description?: string; fix_hint?: string; label?: string}
  /** Coverage only: the run evaluated a policy the branch no longer holds. */
  deleted?: boolean
}

/** The verdict every `policy_check` carries. */
export interface PolicyVerdict {
  /** True when a Block policy failed; it decides the exit code whatever the status. */
  block?: boolean
  /** The platform's verdict, including the names of rules that checked no objects. */
  message?: string
  /** A gate's outcome for the run it stored: `allowed`, `blocked` or `allowed_with_override`. */
  outcome?: null | string
  run_id?: number
  /**
   * `pass`, `fail` or `error` (a check could not run) for an evaluation; `disabled`,
   * `not_applicable` or `unavailable` when nothing was evaluated. An older platform answers
   * `forbidden` to a caller without `workspace:policy` read, which is reported like any other
   * status it has no headline for.
   */
  status?: string
}

/** A run's finding counts: every finding, the Block ones, and the rules that could not run. */
export interface PolicyCounts {
  /** The findings of Block policies. */
  block: number
  errors: number
  findings: number
  objects_checked?: number
  /** Distinct objects with a finding, in all and per mode; a run summary serves it, a push's feedback does not. */
  objects_failing?: {block?: number; total?: number; warn?: number}
  policies_checked?: number
  policies_failing?: number
  /** The policies the run skipped because they are off. */
  policies_off?: number
  /** The findings of Warn policies; the run summary serves it, a push's feedback does not. */
  warn?: number
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
   * `counts.errors` (the branch's); `block` is what a reader's push of the same change says, so
   * the exit code is the same whoever pushed.
   */
  access?: string
  /** The first Block findings. */
  block_findings?: PolicyFinding[]
  /** What the lists are out of. */
  counts?: PolicyCounts
  /**
   * A trimmed answer's count of the findings on the objects the push does not list (never named).
   * `basis` `introduced`: those the push introduced (not in the push gate's evaluation of the branch
   * before it on the live branch; elsewhere not in the newest run that still described the branch);
   * `all`: no baseline was known, so every finding there. An older platform sends no `basis`.
   */
  elsewhere?: {basis?: string; block?: number; total?: number}
  /** The first findings, Block first. */
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
  block?: boolean
  /** `block` or `warn`: an off policy is never evaluated, so it applies nowhere. */
  enforcement?: string
  key?: string
  /** Why it applies here, one plain sentence per rule. */
  reasons?: string[]
  /**
   * `failing` (a finding of it here), `not_checked` (no run, or the run did not evaluate it as it now
   * stands), `could_not_check` (the run could not check it: a rule of it could not run, or the run
   * stopped on an error before it) or `passing`, which a run that errored on another policy still gives.
   */
  status?: string
  title?: string
}

/**
 * `GET policy/object/coverage`: which policies that are on apply to one object, and its findings in the
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
    applies?: number
    block?: number
    /** The policies that apply whose status is `could_not_check`; an older platform does not send it. */
    could_not_check?: number
    not_checked?: number
    passing?: number
    /**
     * `none_apply`, `findings`, `not_checked`, `check_failed` (only when a policy that applies here
     * could not be checked) or `pass`.
     */
    state?: string
    warn?: number
  }
}

/** A policy's place in its branch's newest run, as the platform serves it on every policy. */
export interface PolicyCoverage {
  /** When the newest run finished. */
  checked_at?: null | string
  /** The enforcement the newest run evaluated this policy with; `null` when it did not. */
  enforcement: null | string
  /** Whether the newest run evaluated this policy at all. */
  included: boolean
  /** Distinct objects the newest run examined for this policy, and those with a finding of it. */
  objects_checked?: number
  objects_failing?: number
  rules_failing?: number
  /** 0 when the branch has no run. */
  run_id: number
  /** True only when the newest run evaluated a different version of this policy. */
  stale: boolean
  version: null | number
}

export interface Policy {
  /** `off` (never evaluated), `warn` (reports only) or `block` (its findings gate changes). */
  enforcement: string
  id: number
  key: string
  latest_run?: PolicyCoverage
  rules?: Array<{id: string}>
  /** `critical`, `high`, `medium` or `low`; the parse route always answers it, its default included. */
  severity?: string
  /** The template id the policy was created from (`endpoints_need_login`); empty for one built from scratch or by the agent. */
  template?: string
  title?: string
  /** When the policy was last written, as served; sent back as `last_updated_at` to refuse acting on a stale read. */
  updated_at?: number | string
  /** The index of the policy's newest Version History entry; it moves only when the definition changes. */
  version: number
}

/** Who started a run, or overrode a gate. */
export interface PolicyActor {
  id?: number
  /** `user`, `cli` or `agent`. */
  kind?: string
  name?: string
}

/** A gate's override: why, by whom, when. */
export interface PolicyOverride {
  at?: string
  by?: PolicyActor
  reason?: string
}

/** What a run covered: the whole branch, or (`partial`) the objects a publish carried. */
export interface PolicyRunScope {
  count?: number
  kind?: string
  objects?: Array<{guid?: string; id?: number; name?: string; type?: string}>
}

/** One stored run as the run list serves it: the verdict and counts, without findings or results. */
export interface PolicyRunSummary {
  actor?: null | PolicyActor
  branch?: null | {id?: number; label?: string}
  counts: PolicyCounts
  created_at?: number
  finished_at?: string
  /** The merge source, or the branch a set live replaced; else null. */
  from_branch?: null | {id?: number; label?: string}
  id: number
  /** The gate's refusal or override sentence. */
  note?: null | string
  objects_checked?: number
  /** A gate's verdict: `allowed`, `blocked`, `allowed_with_override`; `null` for a check that gated nothing. */
  outcome?: null | string
  override?: null | PolicyOverride
  scope?: PolicyRunScope
  started_at?: string
  status: string
  /** `manual`, `push`, `merge`, `set_live`, `install`, `release`, `deploy`, `publish` or `save`. */
  trigger?: string
}

/** One page of the run list (`GET policy/run`). */
export interface PolicyRunListPage {
  curPage?: number
  items: PolicyRunSummary[]
  itemsTotal?: number
  nextPage?: null | number
  prevPage?: null | number
}

/** One run in full, as `GET run/{id}` serves it. */
export interface PolicyRun {
  findings?: PolicyFinding[]
  finished_at?: number | string
  /** 0 for an evaluation that was not stored. */
  id?: number
  note?: null | string
  /** How many workspace objects the run inspected. */
  objects_checked?: number
  outcome?: null | string
  override?: null | PolicyOverride
  /** The snapshot of the policies as they were when the run went out. */
  policies?: PolicySnapshotPolicy[]
  results?: PolicyRuleResult[]
  scope?: PolicyRunScope
  started_at?: number | string
  status?: string
  trigger?: string
}

/**
 * What `policy evaluate` answers: the run as `GET run/{id}` serves it, whether it was stored, and the verdict.
 * With no policy that is on in the branch it is no run at all: `id` 0, `status` `not_applicable`, nothing evaluated.
 */
export interface PolicyEvaluation extends PolicyRun {
  /** The summary answer's counts (`--summary`). */
  counts?: PolicyCounts
  /** `block_total`: every Block finding, beside the summary answer's listed ones. */
  policy_check?: PolicyVerdict & {block_finding_ids?: string[]; block_total?: number}
  stored?: boolean
  /** The summary answer: every finding, and whether `findings` lists only the first. */
  total?: number
  truncated?: boolean
}

/** One run without its findings, as `GET run/{id}/summary` serves it. */
export interface PolicyRunHead extends PolicyRun {
  actor?: null | PolicyActor
  branch?: null | {id?: number; label?: string}
  counts?: PolicyCounts
  from_branch?: null | {id?: number; label?: string}
  /** The snapshot, each policy with its verdict in this run. */
  policies?: Array<PolicySnapshotPolicy & {block?: boolean; findings?: number; objects_checked?: number; objects_failing?: number; status?: string}>
}

/** One page of a run's findings, as `GET run/{id}/findings` serves it. */
export interface PolicyFindingsPage {
  items: PolicyFinding[]
  limit: number
  offset: number
  /** The findings that match the filters, listed or not. */
  total: number
}
