import type {PolicyCatalogueEntry, PolicyCheckUse, PolicyParamSchema} from './types.js'

import {type PolicyTemplate, templateCreateCommand} from './template.js'

/**
 * The catalogue's other kinds of entry, by the flag that shows one: an id given to the wrong flag
 * (a recipe id to `--template`) is pointed at the right one.
 */
export interface CatalogueIds {
  check?: string[]
  recipe?: string[]
  template?: string[]
}

const NOUNS = {check: 'a policy check', recipe: 'a recipe', template: 'a template'} as const

/**
 * `--check` narrows the catalogue to one check. An id that is not in it names the closest matches
 * instead of reprinting the whole list: the usual mistake is a typo one character from a real id.
 */
export function selectCatalogueCheck(checks: PolicyCatalogueEntry[], id: string, others: CatalogueIds = {}): PolicyCatalogueEntry[] {
  return selectById(checks, id, 'check', others)
}

/** `--recipe` narrows the catalogue's recipes to one, refusing an unknown id as `--check` does. */
export function selectCatalogueRecipe(recipes: PolicyRecipe[], id: string, others: CatalogueIds = {}): PolicyRecipe[] {
  return selectById(recipes, id, 'recipe', others)
}

/** `--template` narrows the catalogue's templates to one, refusing an unknown id as `--check` does. */
export function selectCatalogueTemplate(templates: PolicyTemplate[], id: string, others: CatalogueIds = {}): PolicyTemplate[] {
  return selectById(templates, id, 'template', others)
}

function selectById<T extends {id: string}>(entries: T[], id: string, flag: keyof typeof NOUNS, others: CatalogueIds): T[] {
  const noun = NOUNS[flag]
  const wanted = id.trim().toLowerCase()
  const exact = entries.filter(entry => entry.id.toLowerCase() === wanted)
  if (exact.length > 0) return exact
  for (const other of ['check', 'template', 'recipe'] as const) {
    const known = other === flag ? undefined : others[other]?.find(entry => entry.toLowerCase() === wanted)
    if (known) throw new Error(`"${id}" is not ${noun}; it is ${NOUNS[other]}: run \`xano policy catalogue --${other} ${known}\`.`)
  }

  const near = entries.map(entry => entry.id).filter(known => {
    const lower = known.toLowerCase()
    return lower.includes(wanted) || wanted.includes(lower) || editDistanceWithin(lower, wanted, 2)
  }).sort()
  throw new Error(`"${id}" is not ${noun}.${near.length > 0
    ? ` Did you mean ${near.join(', ')}?`
    : ' Run `xano policy catalogue` for the full list.'}`)
}

/** Cheap bounded Levenshtein: true when `a` and `b` are at most `max` edits apart. */
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let previous = Array.from({length: b.length + 1}, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : 1 + Math.min(previous[j - 1], previous[j], current[j - 1])
    }

    if (Math.min(...current) > max) return false
    previous = current
  }

  return previous[b.length] <= max
}

/** How wide a full-width line (a use, a recipe) is wrapped; the check table is its own columns. */
const LINE_WIDTH = 120

/**
 * The checks as a table of id, label and description, object kinds and required params, each row
 * followed by the check's own params (each with its type, default, example and description, an
 * object param's parts under it), the scope fields it takes, and its `uses`: a goal, the params that
 * achieve it (one line of JSON to copy) and its note.
 */
export function policyCatalogueSummary(checks: PolicyCatalogueEntry[]): string[] {
  if (checks.length === 0) return ['No policy checks found.']
  const rows = [
    ['Check ID', 'Label / Description', 'Object kinds', 'Required params'],
    ...checks.map(check => [
      check.id,
      [check.label.trim(), check.description, check.fix_hint && `Fix hint: ${check.fix_hint}`].filter(Boolean).join('\n'),
      (check.object_kinds ?? []).join(', ') || '—',
      requiredParams(check),
    ]),
  ]
  const widths = rows[0].map((_, column) => Math.min([36, 46, 24, 32][column], Math.max(...rows.map(row => row[column].length))))
  return rows.flatMap((row, index) => {
    const cells = row.map((cell, column) => cell.split('\n').flatMap(paragraph => wrap(paragraph, widths[column])))
    const lines = Array.from({length: Math.max(...cells.map(cell => cell.length))}, (_, line) =>
      cells.map((cell, column) => (cell[line] ?? '').padEnd(widths[column])).join('  ').trimEnd())
    return index === 0 ? lines : [...lines, ...paramLines(checks[index - 1]), ...useLines(checks[index - 1].uses)]
  })
}

/**
 * A check's own params under its row, the scope fields left to the scope section and named on one
 * line: `    name (type, required, one of: …, default …, min …, e.g. …): description`, then an object
 * param's parts by their dotted path (`referenced_by.age_field`), as a template's needs name them.
 */
function paramLines(check: PolicyCatalogueEntry): string[] {
  const scope = (Array.isArray(check.scope_fields) ? check.scope_fields : []).map(field => field?.name).filter((name): name is string => typeof name === 'string' && name !== '')
  const own = Object.entries(check.params && !Array.isArray(check.params) ? check.params : {}).filter(([name]) => !scope.includes(name))
  return [
    ...(own.length > 0 ? ['  Params:', ...own.flatMap(([name, schema]) => paramEntry(name, schema))] : []),
    ...(scope.length > 0 ? hanging('  Scope fields: ', scope.join(', '), '    ') : []),
  ]
}

/** One param, or one part of an object param by its dotted path, and its parts after it. */
function paramEntry(path: string, schema: PolicyParamSchema): string[] {
  const facts = [schema.type ?? 'any']
  if (schema.required) facts.push('required')
  if (Array.isArray(schema.values) && schema.values.length > 0) facts.push(`one of: ${schema.values.map(value => JSON.stringify(value)).join(' | ')}`)
  if (shown(schema.default)) facts.push(`default ${JSON.stringify(schema.default)}`)
  if (typeof schema.minimum === 'number') facts.push(`min ${schema.minimum}`)
  if (schema.example !== undefined) facts.push(`e.g. ${JSON.stringify(schema.example)}`)
  const head = `    ${path} (${facts.join(', ')})`
  const description = schema.description?.trim() ?? ''
  const parts = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties) ? Object.entries(schema.properties) : []
  // A long head (a list of values, an object example) puts the description on the lines below it.
  const described = description === '' ? [head] : head.length > 60 ? [`${head}:`, ...hanging('      ', description)] : flow(`${head}: `, description, '      ')
  return [...described, ...parts.flatMap(([part, partSchema]) => paramEntry(`${path}.${part}`, partSchema ?? {}))]
}

/** A default worth printing: not absent and not an empty list, map or text. */
function shown(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  return typeof value !== 'object' || Object.keys(value).length > 0
}

/** A check's uses under its row: `Use: goal`, the params as JSON, then `Note: …` when it has one. */
function useLines(uses: PolicyCheckUse[] | undefined): string[] {
  if (!Array.isArray(uses)) return []
  return uses.flatMap(use => [
    ...hanging('  Use: ', use.goal),
    `       ${JSON.stringify(Array.isArray(use.params) ? {} : use.params ?? {})}`,
    ...(use.note ? hanging('       Note: ', use.note, '       ') : []),
  ])
}

/** Words wrapped at `width`; a word longer than the width keeps a line of its own. */
function wrap(text: string, width: number): string[] {
  const lines = ['']
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1
    if (lines[last] && lines[last].length + word.length + 1 > width) lines.push(word)
    else lines[last] += `${lines[last] ? ' ' : ''}${word}`
  }

  return lines
}

/** `text` after `first`, wrapped at the line width, its later lines indented as `rest` (default: as wide as `first`). */
function hanging(first: string, text: string, rest = ' '.repeat(first.length)): string[] {
  return wrap(text, LINE_WIDTH - first.length).map((line, index) => `${index === 0 ? first : rest}${line}`)
}

/** `text` after `first`, each line filled to the line width, its later lines indented as `rest`. */
function flow(first: string, text: string, rest: string): string[] {
  const lines = [first]
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1
    const bare = lines[last] === first || lines[last] === rest
    if (!bare && lines[last].length + word.length + 1 > LINE_WIDTH) lines.push(`${rest}${word}`)
    else lines[last] += `${bare ? '' : ' '}${word}`
  }

  return lines
}

/** The params a rule must set: each required one, and any "one of" group. */
function requiredParams(check: PolicyCatalogueEntry): string {
  const required = Object.entries(check.params ?? {}).filter(([, schema]) => schema.required)
    .map(([name, schema]) => `${name}: ${schema.type ?? 'any'}`)
  const oneOf = check.requires_one_of ?? []
  if (oneOf.length > 0) required.push(`one of: ${oneOf.join(' | ')}`)
  return required.join(', ') || 'none'
}

/** The catalogue's `template_categories`: the groups templates are filed under, in the order to offer them. */
export interface PolicyTemplateCategory {
  id: string
  label: string
}

/** The catalogue's `template_frameworks`: the framework tags a template can carry, in order, with their labels. */
export interface PolicyTemplateFramework {
  id: string
  label: string
}

/**
 * The catalogue's templates, grouped under their `category` in the order `template_categories`
 * lists them, each group named by its label. A category the list does not name follows in the order
 * first seen, named by its id; a template without one (an older instance) is listed under "Other".
 * Each row names the id `policy create --template` takes, the title, what it would create and its
 * framework tags by label (an unknown id as itself). When any row has a tag, the catalogue's
 * `template_frameworks_note` follows the heading, worded by the platform rather than here; an
 * instance that serves no note gets no tags, since a tag must never show without it.
 */
export function policyTemplateSummary(templates: PolicyTemplate[], context: PolicyTemplateContext = {}): string[] {
  const {categories = [], detail, frameworks = [], frameworksNote = ''} = context
  if (templates.length === 0) return []
  const labels = new Map(categories.map(category => [category.id, category.label]))
  const tags = frameworkTags(frameworks, frameworksNote)
  const note = templates.some(template => tags(template).length > 0) ? [frameworksNote.trim()] : []
  const groups = new Map<string, PolicyTemplate[]>(categories.map(category => [category.id, []]))
  for (const template of templates) {
    const category = template.category?.trim() || ''
    groups.set(category, [...(groups.get(category) ?? []), template])
  }

  const width = Math.min(36, Math.max(...templates.map(template => template.id.length)))
  return [
    'Templates (xano policy create --template <id>):',
    ...note,
    ...[...groups].filter(([, members]) => members.length > 0).flatMap(([category, members]) => [
      '',
      labels.get(category) ?? (category || 'Other'),
      ...members.flatMap(template => {
        const rules = template.rules.length === 1 ? '1 rule' : `${template.rules.length} rules`
        const tagged = tags(template).length > 0 ? ` [${tags(template).join(', ')}]` : ''
        const row = `  ${template.id.padEnd(width)}  ${template.title} (${template.key}, ${template.severity}, ${rules})${tagged}`
        return detail ? [row, ...templateDetailLines(template, detail)] : [row, ...templateRuleLines(template)]
      }),
    ]),
  ]
}

/** What the template section reads beside the templates; `detail` shows each in full, as `--template` does. */
export interface PolicyTemplateContext {
  categories?: PolicyTemplateCategory[]
  detail?: PolicyTemplateDetail
  frameworks?: PolicyTemplateFramework[]
  frameworksNote?: string
}

/** What `--template` adds to one template's row: the fetched checks, for examples the template gives none of. */
export interface PolicyTemplateDetail {
  checks?: PolicyCatalogueEntry[]
}

/**
 * One template in full under its row (`--template`): its summary, which becomes the policy's
 * statement, its rules, the example values it suggests for what you fill, what its rules cannot see
 * (`limits`), and the `policy create` command with those examples to edit.
 */
function templateDetailLines(template: PolicyTemplate, detail: PolicyTemplateDetail): string[] {
  const examples = template.examples && typeof template.examples === 'object' && !Array.isArray(template.examples) ? Object.entries(template.examples) : []
  const limits = typeof template.limits === 'string' ? template.limits.trim() : ''
  return [
    ...(template.summary?.trim() ? hanging('    Statement: ', template.summary.trim(), '      ') : []),
    `    Severity ${template.severity}; a policy created from it starts with enforcement advisory.`,
    '    Rules:',
    ...templateRuleLines(template),
    ...(examples.length > 0 ? hanging('    Examples: ', examples.map(([path, value]) => `${path}=${JSON.stringify(value)}`).join(', '), '      ') : []),
    ...(limits ? hanging('    Cannot see: ', limits, '      ') : []),
    // Never wrapped: it is copied whole.
    '    Create it (edit the example values):',
    `      ${templateCreateCommand(template, detail.checks ?? [])}`,
  ]
}

/**
 * A template's rules under its row: each rule's number (as `--param N.path` takes it), title and check,
 * its preset params as one line of JSON, and what the author fills (`Fill: functions, and tags or paths`).
 */
function templateRuleLines(template: PolicyTemplate): string[] {
  const rules = Array.isArray(template.rules) ? template.rules : []
  return rules.flatMap((rule, index) => {
    const needs = needsSentence(rule.needs, rule.needs_any)
    return [
      ...hanging(`      ${index + 1}. `, `${rule.title ? `${rule.title}: ` : ''}${rule.check}`, '         '),
      `         ${JSON.stringify(Array.isArray(rule.params) ? {} : rule.params ?? {})}`,
      ...(needs ? hanging('         Fill: ', needs, '           ') : []),
    ]
  })
}

/**
 * A rule's `needs` as one sentence: every need outside its `needs_any` group, then the group as one
 * choice (`functions, and tags or paths`; `hosts or providers` when the group is every need). An older
 * instance's `needs_any: true` groups every need.
 */
export function needsSentence(needs: unknown, needsAny: unknown): string {
  const all = Array.isArray(needs) ? needs.filter((need): need is string => typeof need === 'string') : []
  const listed = needsAny === true ? all : Array.isArray(needsAny) ? all.filter(need => needsAny.includes(need)) : []
  const group = listed.length > 1 ? listed : []
  const required = all.filter(need => !group.includes(need))
  const choice = group.length > 0 ? `${group.slice(0, -1).join(', ')} or ${group.at(-1)}` : ''
  if (!choice) return required.join(', ')
  return required.length > 0 ? `${required.join(', ')}, and ${choice}` : choice
}

/**
 * The scope fields the catalogue serves, each with the description its first check gives it: the
 * shared params that narrow which objects a rule inspects, written at the top level of `params` beside
 * the check's own. Worded by the platform (path matching included), never here; a field served
 * without a description is listed by name.
 */
export function policyScopeSummary(checks: PolicyCatalogueEntry[]): string[] {
  const fields = new Map<string, string>()
  // The check with the most scope fields sets the order, so the fields read as one list rather than in first-seen order.
  const ordered = [...checks].sort((a, b) => (Array.isArray(b.scope_fields) ? b.scope_fields.length : 0) - (Array.isArray(a.scope_fields) ? a.scope_fields.length : 0))
  for (const check of ordered) {
    for (const field of Array.isArray(check.scope_fields) ? check.scope_fields : []) {
      const name = field?.name
      if (typeof name !== 'string' || name === '') continue
      const description = check.params?.[name]?.description?.trim() ?? ''
      if (!fields.has(name) || (fields.get(name) === '' && description !== '')) fields.set(name, description)
    }
  }

  if (fields.size === 0) return []
  return [
    'Scope fields (top level of a rule\'s params, beside the check\'s own; a check takes those its --check entry lists):',
    ...[...fields].flatMap(([name, description]) => ['', `  ${name}`, ...(description ? hanging('    ', description) : [])]),
  ]
}

/** What the index names beside the checks: the templates and their categories, the recipes and the not-checkable topics. */
export interface PolicyCatalogueIndexSections {
  categories?: PolicyTemplateCategory[]
  notCheckable?: PolicyNotCheckable[]
  recipes?: PolicyRecipe[]
  templates?: PolicyTemplate[]
}

/**
 * A short index at the head of the summary: the check ids by their category, the template ids by
 * category label, the recipe ids and how many topics no check can see, each detailed further down.
 */
export function policyCatalogueIndex(checks: PolicyCatalogueEntry[], sections: PolicyCatalogueIndexSections = {}): string[] {
  const {categories = [], notCheckable = [], recipes = [], templates = []} = sections
  const byCategory = <T>(entries: T[], category: (entry: T) => string): Map<string, T[]> => {
    const groups = new Map<string, T[]>()
    for (const entry of entries) groups.set(category(entry), [...(groups.get(category(entry)) ?? []), entry])
    return groups
  }

  const labels = new Map(categories.map(category => [category.id, category.label]))
  const checkGroups = byCategory(checks, check => check.category?.trim() || 'other')
  const templateGroups = byCategory(templates, template => template.category?.trim() || '')
  const templateOrder = [...categories.map(category => category.id).filter(id => templateGroups.has(id)), ...[...templateGroups.keys()].filter(id => !labels.has(id))]
  return [
    'Index (each entry is detailed below):',
    ...(checks.length > 0 ? ['  Checks by category (xano policy catalogue --check <id>):', ...[...checkGroups].flatMap(([category, members]) =>
      hanging(`    ${category}: `, members.map(check => check.id).join(', '), '      '))] : []),
    ...(templates.length > 0 ? ['  Templates by category (xano policy catalogue --template <id>):', ...templateOrder.flatMap(category =>
      hanging(`    ${labels.get(category) ?? (category || 'Other')}: `, (templateGroups.get(category) ?? []).map(template => template.id).join(', '), '      '))] : []),
    ...(recipes.length > 0 ? ['  Recipes (xano policy catalogue --recipe <id>):', ...hanging('    ', recipes.map(recipe => recipe.id).join(', '))] : []),
    ...(notCheckable.length > 0 ? [`  What no check can see: ${notCheckable.length} ${notCheckable.length === 1 ? 'topic' : 'topics'}, at the end.`] : []),
  ]
}

/**
 * Framework tag labels for a template or recipe (an unknown id as itself). Tags are shown only
 * beside the platform's sentence on what they mean: an instance that serves no note gets none.
 */
function frameworkTags(frameworks: PolicyTemplateFramework[], frameworksNote: string): (entry: {frameworks?: string[]}) => string[] {
  const labels = new Map(frameworks.map(framework => [framework.id, framework.label]))
  return entry => frameworksNote.trim() === '' || !Array.isArray(entry.frameworks) ? [] : entry.frameworks.map(id => labels.get(id) ?? id)
}

/**
 * One of a recipe's `builds`: an enforcement object to build, or a change to existing objects, in words.
 * `fills` are the rule params that name it, each `<template id>.<param>` or `rules[<n>].<param>`.
 */
export interface PolicyRecipeBuild {
  fills?: string[]
  /** An object to build (`table`, `function`, `middleware`, `task`, `tool`, `endpoint`) or a change (`tag`, `field`, `field_attribute`, `attach_middleware`). */
  kind: string
  /** The suggested name. */
  name: string
  /** What it does, where it attaches, the statements it uses and which rule checks it. */
  role?: string
}

/**
 * One of the catalogue's `recipes`: a goal spanning several templates, served as data. There is no
 * recipe object and no create action: an agent builds its `builds` and creates its `templates` in
 * order, one policy each, then its `rules` together in a policy of their own, in the same change.
 */
export interface PolicyRecipe {
  /** The enforcement objects and changes to existing objects the rules point at. */
  builds?: PolicyRecipeBuild[]
  /** Framework tag ids, as a template's: topics it relates to, never a compliance claim. */
  frameworks?: string[]
  id: string
  keywords?: string[]
  /** `not_checkable` ids: what no rule in the recipe can see. */
  limits?: string[]
  /** Rules no template covers, shaped like a template's; a build or `user_fills` fills their `needs`. */
  rules?: Array<{check: string; needs?: string[]; params?: Record<string, unknown> | unknown[]; title: string}>
  summary?: string
  /** Template ids, in the order to create them. */
  templates?: string[]
  /** The goal, never a framework name. */
  title: string
  /** The params the user's own objects and choices fill, in the same form as a build's `fills`. */
  user_fills?: string[]
}

/** One of the catalogue's `not_checkable` entries: a topic no check can see, and why. */
export interface PolicyNotCheckable {
  id: string
  keywords?: string[]
  topic: string
  why: string
}

/** What the recipe section reads beside the recipes: templates by id, tags, and the not-checkable topics. */
export interface PolicyRecipeContext {
  frameworks?: PolicyTemplateFramework[]
  frameworksNote?: string
  notCheckable?: PolicyNotCheckable[]
  templates?: PolicyTemplate[]
}

/**
 * The catalogue's recipes, each with its title, tags, summary, the objects to build (kind, name, role
 * and the params each fills), the params the user's own objects fill, its templates in order (each with
 * its key and title, so `policy create --template` can take it from here), the rules no template covers
 * (numbered as the fills name them, `rules[0]`, with their params as JSON and needs) and the topics no
 * rule in it can see. The framework note follows the heading when any recipe shows a tag, as for templates.
 */
export function policyRecipeSummary(recipes: PolicyRecipe[], context: PolicyRecipeContext = {}): string[] {
  if (recipes.length === 0) return []
  const {frameworks = [], frameworksNote = '', notCheckable = [], templates = []} = context
  const tags = frameworkTags(frameworks, frameworksNote)
  const note = recipes.some(recipe => tags(recipe).length > 0) ? [frameworksNote.trim()] : []
  const byId = new Map(templates.map(template => [template.id, template]))
  const topics = new Map(notCheckable.map(entry => [entry.id, entry.topic]))
  return [
    'Recipes (goals that span several templates; nothing creates a recipe: build its objects, then create its templates and rules, in one change):',
    ...note,
    ...recipes.flatMap(recipe => {
      const tagged = tags(recipe).length > 0 ? ` [${tags(recipe).join(', ')}]` : ''
      const steps = recipe.templates ?? []
      const rules = recipe.rules ?? []
      const limits = recipe.limits ?? []
      const builds = Array.isArray(recipe.builds) ? recipe.builds : []
      const userFills = Array.isArray(recipe.user_fills) ? recipe.user_fills : []
      return [
        '',
        `  ${recipe.id}  ${recipe.title}${tagged}`,
        ...(recipe.summary ? hanging('    ', recipe.summary) : []),
        ...(builds.length > 0 ? ['    Build (the enforcement; the rules point at it):', ...builds.flatMap(build => [
          ...hanging('      - ', `${build.kind} ${build.name}${build.role ? `: ${build.role}` : ''}`, '        '),
          ...(Array.isArray(build.fills) && build.fills.length > 0 ? hanging('        Fills: ', build.fills.join(', '), '          ') : []),
        ])] : []),
        ...(userFills.length > 0 ? hanging('    You fill in: ', userFills.join(', '), '      ') : []),
        ...(steps.length > 0 ? ['    Templates, in order (xano policy create --template <id>, one policy each):', ...steps.map((id, index) => {
          const template = byId.get(id)
          return `      ${index + 1}. ${id}${template ? `  ${template.title} (${template.key})` : ''}`
        })] : []),
        ...(rules.length > 0 ? ['    Rules no template covers, together in one policy of your own:', ...rules.flatMap((rule, index) => [
          ...hanging(`      rules[${index}] `, `${rule.title}: ${rule.check}`, '        '),
          `        ${JSON.stringify(Array.isArray(rule.params) ? {} : rule.params ?? {})}`,
          ...((rule.needs ?? []).length > 0 ? [`        Needs: ${(rule.needs ?? []).join(', ')}`] : []),
        ])] : []),
        ...(limits.length > 0 ? hanging('    No rule here can see: ', `${limits.map(id => topics.get(id) ?? id).join('; ')}.`, '      ') : []),
      ]
    }),
  ]
}

/** The catalogue's `not_checkable`: each topic no check can see, by id, with why. */
export function policyNotCheckableSummary(entries: PolicyNotCheckable[]): string[] {
  if (entries.length === 0) return []
  return [
    'What no check can see (recipes name these under "No rule here can see"):',
    ...entries.flatMap(entry => ['', `  ${entry.id}  ${entry.topic}`, ...hanging('    ', entry.why)]),
  ]
}
