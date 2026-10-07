import {POLICY_KEY_PATTERN} from '../document-parser.js'

/** Templates and sparse parameter seeds come from the instance's catalogue. */
export interface PolicyTemplate {
  /** The id of the group the catalogue files the template under (`access_control`…; labels in `template_categories`). */
  category?: string
  /** Framework tag ids (`soc2`…; labels in `template_frameworks`): topics the template relates to, never a compliance claim. */
  frameworks?: string[]
  id: string
  key: string
  /** `needs`: the param paths the author fills, every one of them unless `needs_any` says one is enough. */
  rules: Array<{check: string; needs: string[]; needs_any?: boolean; params: Record<string, unknown>; title: string}>
  severity: string
  summary: string
  /** Becomes the policy title. */
  title: string
}

/** The catalogue's `document.key`: the platform's key pattern, and its refusal with `%s` for the key. */
export interface PolicyKeyRule {
  message?: string
  pattern?: string
}

/** How a template becomes a policy: the key, the catalogue's key rule and the `--param` assignments. */
export interface TemplatePolicyOptions {
  /** `--key`: the new policy's key; refused when a policy already holds it. */
  key?: string
  /** The fetched catalogue's `document.key`; the offline pattern stands in for an instance that serves none. */
  keyRule?: null | PolicyKeyRule
  /** `--param N.path=JSON` assignments. */
  overrides?: string[]
}

/** The policy document a template becomes, for the parse route's `data`. */
export interface TemplatePolicyDocument {
  key: string
  rules: Array<{check: string; params: Record<string, unknown>; title: string}>
  severity: string
  statement: string
  title: string
}

/**
 * The policy document for a template: its sparse settings with the `--param` assignments applied, every
 * `needs` path filled (at least one of a rule's when it says `needs_any`), and a key no policy on the
 * branch holds (compared case-insensitively). A taken template key gets a free numeric suffix; a taken or
 * malformed `--key` is refused.
 */
export function policyFromTemplate(template: PolicyTemplate, takenKeys: string[], options: TemplatePolicyOptions = {}): TemplatePolicyDocument {
  const {key, keyRule, overrides = []} = options
  const taken = new Set(takenKeys.map(value => value.toLowerCase()))
  let chosen = key ?? template.key
  if (!keyPattern(keyRule).test(chosen)) throw new Error(keyRefusal(keyRule, chosen))
  if (key !== undefined && taken.has(chosen.toLowerCase())) throw new Error(`Policy ${chosen} already exists. Choose a new --key or use policy publish to update it.`)
  for (let suffix = 2; taken.has(chosen.toLowerCase()); suffix++) chosen = `${template.key.slice(0, 63 - String(suffix).length)}-${suffix}`
  const rules = template.rules.map(rule => ({check: rule.check, params: Array.isArray(rule.params) ? {} : structuredClone(rule.params), title: rule.title}))
  for (const assignment of overrides) applyOverride(rules, assignment)

  const missing = template.rules.flatMap((rule, index) => missingNeeds(rule, rules[index].params, index))
  if (missing.length > 0) throw new Error(`Fill the template's required settings with --param 'N.path=JSON': ${missing.join(', ')}.`)
  return {key: chosen, rules, severity: template.severity, statement: template.summary, title: template.title}
}

/** The catalogue's key pattern, or the offline copy when the catalogue serves none (or one that does not compile). */
function keyPattern(rule?: null | PolicyKeyRule): RegExp {
  if (typeof rule?.pattern !== 'string' || rule.pattern === '') return POLICY_KEY_PATTERN
  try {
    return new RegExp(rule.pattern)
  } catch {
    return POLICY_KEY_PATTERN
  }
}

/** The catalogue's refusal for a malformed key, naming it, or the offline sentence. */
function keyRefusal(rule: null | PolicyKeyRule | undefined, key: string): string {
  return typeof rule?.message === 'string' && rule.message.trim()
    ? rule.message.replaceAll('%s', key)
    : 'A policy key must be 1–64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.'
}

/**
 * A rule's unfilled `needs`, each as `N.path`: every unfilled one, or, for a `needs_any` rule with none
 * filled, one entry naming the alternatives (`1.hosts or 1.providers`).
 */
function missingNeeds(rule: PolicyTemplate['rules'][number], params: Record<string, unknown>, index: number): string[] {
  const needs = (rule.needs ?? []).map(path => ({filled: filled(readPath(params, path)), name: `${index + 1}.${path}`}))
  if (rule.needs_any === true && needs.length > 1) return needs.some(need => need.filled) ? [] : [needs.map(need => need.name).join(' or ')]
  return needs.filter(need => !need.filled).map(need => need.name)
}

/** The value at a dotted path of a rule's params, or undefined when any step is missing. */
function readPath(params: Record<string, unknown>, path: string): unknown {
  let value: unknown = params
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined
    value = (value as Record<string, unknown>)[part]
  }

  return value
}

/** Whether a `needs` value is set: not empty, null or blank; `false` and `0` count as set. */
function filled(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(item => filled(item))
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')
}

/** Apply one `--param [N.]path=JSON` assignment to its rule's params, refusing unsafe paths and non-JSON values. */
function applyOverride(rules: Array<{params: Record<string, unknown>}>, assignment: string): void {
  const equals = assignment.indexOf('=')
  if (equals < 1) throw new Error('Use --param path=JSON or --param N.path=JSON (rule numbers start at 1).')
  const parts = assignment.slice(0, equals).split('.')
  let index = 0
  if (/^\d+$/.test(parts[0])) index = Number(parts.shift()) - 1
  else if (rules.length !== 1) throw new Error('Include the rule number in --param N.path=JSON for a template with multiple rules.')
  if (!Number.isSafeInteger(index) || !rules[index]) throw new Error(`Rule ${index + 1} does not exist in this template.`)
  if (parts.length === 0 || parts.some(part => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) || ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('Invalid parameter path. Use parameter names separated by dots.')
  let value: unknown
  try {
    value = JSON.parse(assignment.slice(equals + 1), (_key, parsed: unknown) => {
      if (typeof parsed === 'number' && !Number.isFinite(parsed)) throw new Error('Numbers must be finite.')
      return parsed
    })
  } catch {
    throw new Error(`The value for ${assignment.slice(0, equals)} must be JSON: a quoted string, finite number, boolean, array or object.`)
  }

  let target = rules[index].params
  for (const part of parts.slice(0, -1)) {
    if (target[part] === undefined) target[part] = {}
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) throw new Error(`Cannot set a nested parameter inside ${part}.`)
    target = target[part] as Record<string, unknown>
  }

  target[parts.at(-1)!] = value
}
