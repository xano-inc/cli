import type {PolicyRecipe} from './catalogue.js'
import type {PolicyCatalogueEntry, PolicyParamSchema} from './types.js'

import {POLICY_KEY_PATTERN} from '../document-parser.js'

/** Templates and sparse parameter seeds come from the instance's catalogue. */
export interface PolicyTemplate {
  /** The id of the group the catalogue files the template under (`access_control`…; labels in `template_categories`). */
  category?: string
  /** Example values that fit this template, by `needs` path: a hint for `--param`, never a value it fills. */
  examples?: Record<string, unknown>
  /** Framework tag ids (`soc2`…; labels in `template_frameworks`): topics the template relates to, never a compliance claim. */
  frameworks?: string[]
  id: string
  key: string
  /** One sentence on what the template's rules cannot see. */
  limits?: string
  /**
   * `needs`: the param paths the author fills (a dotted path names an object param's property, as in
   * `referenced_by.max_age_days`). Every one is required except those `needs_any` groups: of the group,
   * one is enough. An older instance serves `needs_any: true`, the whole of `needs` as the group.
   */
  rules: Array<{check: string; needs: string[]; needs_any?: boolean | string[]; params: Record<string, unknown>; title: string}>
  severity: string
  summary: string
  /** Becomes the policy title. */
  title: string
}

/**
 * The refusal of a recipe id given to `--template`: recipes have no create action, so it names the
 * recipe's templates in the order to create them and, when it has rules no template covers, where
 * they are shown.
 */
export function recipeRefusal(recipe: PolicyRecipe): string {
  const templates = Array.isArray(recipe.templates) ? recipe.templates : []
  const rules = Array.isArray(recipe.rules) ? recipe.rules.length : 0
  const steps = templates.length > 0
    ? ` Create its templates in order with --template, one policy each: ${templates.join(', ')}.`
    : ''
  const own = rules > 0 ? ` ${rules === 1 ? 'The rule' : `The ${rules} rules`} no template covers ${rules === 1 ? 'goes' : 'go'} in a policy of your own (\`xano policy publish\`).` : ''
  return `"${recipe.id}" is a recipe (${recipe.title}), not a template, and a recipe has no create action.${steps}${own} Run \`xano policy catalogue --recipe ${recipe.id}\` for the objects to build and the rules.`
}

/** The catalogue's `document.key`: the platform's key pattern, and its refusal with `%s` for the key. */
export interface PolicyKeyRule {
  message?: string
  pattern?: string
}

/** How a template becomes a policy: the key, the catalogue's key rule and the `--param` assignments. */
export interface TemplatePolicyOptions {
  /** The fetched catalogue's checks: a need the template gives no example for shows its check's own `example`. */
  checks?: PolicyCatalogueEntry[]
  /** `--key`: the new policy's key; refused when a policy already holds it. */
  key?: string
  /** The fetched catalogue's `document.key`; the offline pattern stands in for an instance that serves none. */
  keyRule?: null | PolicyKeyRule
  /** `--param N.path=JSON` assignments. */
  overrides?: string[]
}

/**
 * The policy document a template becomes, for the parse route's `data`. It carries the template's id,
 * and leaves the key and title to the platform unless `--key` names one: it takes the template's key
 * (with a free `-2`, `-3`… suffix when taken) and title (`Title (2)` when the branch already has a
 * policy from the template), as Studio's adds do.
 */
export interface TemplatePolicyDocument {
  key?: string
  rules: Array<{check: string; params: Record<string, unknown>; title: string}>
  severity: string
  statement: string
  template: string
}

/**
 * The policy document for a template: its id, its sparse settings with the `--param` assignments
 * applied and every `needs` path filled (of a rule's `needs_any` group, at least one). A `--key` that is
 * malformed or that a policy on the branch holds (compared case-insensitively) is refused; without one
 * the platform names the policy.
 */
export function policyFromTemplate(template: PolicyTemplate, takenKeys: string[], options: TemplatePolicyOptions = {}): TemplatePolicyDocument {
  const {checks = [], key, keyRule, overrides = []} = options
  const taken = new Set(takenKeys.map(value => value.toLowerCase()))
  if (key !== undefined) {
    if (!keyPattern(keyRule).test(key)) throw new Error(keyRefusal(keyRule, key))
    if (taken.has(key.toLowerCase())) throw new Error(`Policy ${key} already exists. Choose a new --key or use policy publish to update it.`)
  }

  const rules = template.rules.map(rule => ({check: rule.check, params: Array.isArray(rule.params) ? {} : structuredClone(rule.params), title: rule.title}))
  for (const assignment of overrides) applyOverride(rules, assignment)

  const missing = template.rules.flatMap((rule, index) => missingNeeds(rule, rules[index].params, index))
  if (missing.length > 0) throw new Error(`Fill the template's required settings with --param 'N.path=JSON': ${listMissing(missing)}.${exampleHint(template, checks, missing)}`)
  return {...(key === undefined ? {} : {key}), rules, severity: template.severity, statement: template.summary, template: template.id}
}

/**
 * The unfilled needs as one list: `1.functions`, or `1.functions, and 1.tags or 1.paths` when a
 * `needs_any` group's options follow other entries, so the group reads as one choice.
 */
function listMissing(missing: string[]): string {
  if (missing.length < 2 || !missing.some(entry => entry.includes(' or '))) return missing.join(', ')
  return `${missing.slice(0, -1).join(', ')}, and ${missing.at(-1)}`
}

/**
 * An example for the first unfilled need that has one, as a `--param` to copy
 * (` For example: --param '1.names=["audit_log"]'.`), or '' when none has: the template's own example
 * for the path, else the example its check's catalogue entry gives for that param, as Studio shows it.
 * The rule number is left off for a single-rule template, as `--param` takes it.
 */
function exampleHint(template: PolicyTemplate, checks: PolicyCatalogueEntry[], missing: string[]): string {
  const examples = template.examples && typeof template.examples === 'object' && !Array.isArray(template.examples) ? template.examples : {}
  for (const entry of missing.flatMap(item => item.split(' or '))) {
    const dot = entry.indexOf('.')
    const path = entry.slice(dot + 1)
    const rule = template.rules[Number(entry.slice(0, dot)) - 1]
    const example = Object.hasOwn(examples, path) ? examples[path] : checkExample(checks.find(check => check.id === rule?.check), path)
    if (example === undefined) continue
    const name = template.rules.length === 1 ? path : entry
    return ` For example: --param '${name}=${JSON.stringify(example)}'.`
  }

  return ''
}

/**
 * The `policy create` command for a template, with a `--param` for each need it requires (of a
 * `needs_any` group, its first option): the template's example for the path, else its check's, else
 * `<JSON>` to replace. The rule number is left off for a single-rule template, as `--param` takes it.
 */
export function templateCreateCommand(template: PolicyTemplate, checks: PolicyCatalogueEntry[] = []): string {
  const examples = template.examples && typeof template.examples === 'object' && !Array.isArray(template.examples) ? template.examples : {}
  const rules = Array.isArray(template.rules) ? template.rules : []
  const params = rules.flatMap((rule, index) => {
    const needs = Array.isArray(rule.needs) ? rule.needs : []
    const group = needsAnyGroup(rule.needs_any, needs)
    return needs.filter(need => !group.includes(need) || need === group[0]).map(path => {
      const example = Object.hasOwn(examples, path) ? examples[path] : checkExample(checks.find(check => check.id === rule.check), path)
      const value = example === undefined ? '<JSON>' : JSON.stringify(example)
      return ` --param '${rules.length === 1 ? path : `${index + 1}.${path}`}=${value}'`
    })
  })
  return `xano policy create --template ${template.id}${params.join('')}`
}

/** The catalogue's `example` for a param path of a check (`table_selector.has_field` reads a part's), or undefined. */
function checkExample(check: PolicyCatalogueEntry | undefined, path: string): unknown {
  let schemas = check?.params
  let schema: PolicyParamSchema | undefined
  for (const part of path.split('.')) {
    if (!schemas || typeof schemas !== 'object' || !Object.hasOwn(schemas, part)) return undefined
    schema = schemas[part]
    schemas = schema?.properties
  }

  return schema?.example
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
 * A rule's unfilled `needs`, each as `N.path`: every unfilled need outside its `needs_any` group, then,
 * when no need of the group is filled, one entry naming the group's options (`1.tags or 1.paths`).
 */
function missingNeeds(rule: PolicyTemplate['rules'][number], params: Record<string, unknown>, index: number): string[] {
  const needs = Array.isArray(rule.needs) ? rule.needs : []
  const group = new Set(needsAnyGroup(rule.needs_any, needs))
  const state = needs.map(path => ({filled: filled(readPath(params, path)), name: `${index + 1}.${path}`, path}))
  const required = state.filter(need => !group.has(need.path) && !need.filled).map(need => need.name)
  const options = state.filter(need => group.has(need.path))
  return options.length === 0 || options.some(need => need.filled) ? required : [...required, options.map(need => need.name).join(' or ')]
}

/**
 * The needs of a rule's `needs_any` group, two or more for it to group anything: the list the instance
 * serves, or every need for an older instance's `needs_any: true`.
 */
function needsAnyGroup(needsAny: PolicyTemplate['rules'][number]['needs_any'], needs: string[]): string[] {
  const group = needsAny === true ? needs : Array.isArray(needsAny) ? needsAny.filter(need => needs.includes(need)) : []
  return group.length > 1 ? group : []
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
