import type {PolicyTemplate} from './template.js'
import type {PolicyCatalogueEntry} from './types.js'

/**
 * `--check` narrows the catalogue to one check. An id that is not in it names the closest matches
 * instead of reprinting the whole list: the usual mistake is a typo one character from a real id.
 */
export function selectCatalogueCheck(checks: PolicyCatalogueEntry[], id: string): PolicyCatalogueEntry[] {
  const wanted = id.trim().toLowerCase()
  const exact = checks.filter(check => check.id.toLowerCase() === wanted)
  if (exact.length > 0) return exact
  const near = checks.map(check => check.id).filter(known => {
    const lower = known.toLowerCase()
    return lower.includes(wanted) || wanted.includes(lower) || editDistanceWithin(lower, wanted, 2)
  }).sort()
  throw new Error(`"${id}" is not a policy check.${near.length > 0
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
  return rows.flatMap(row => {
    const cells = row.map((cell, column) => cell.split('\n').flatMap(paragraph => {
      const lines = ['']
      for (const word of paragraph.split(/\s+/)) {
        const last = lines.length - 1
        if (lines[last] && lines[last].length + word.length + 1 > widths[column]) lines.push(word)
        else lines[last] += `${lines[last] ? ' ' : ''}${word}`
      }

      return lines
    }))
    return Array.from({length: Math.max(...cells.map(cell => cell.length))}, (_, line) =>
      cells.map((cell, column) => (cell[line] ?? '').padEnd(widths[column])).join('  ').trimEnd())
  })
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
export function policyTemplateSummary(templates: PolicyTemplate[], categories: PolicyTemplateCategory[] = [], frameworks: PolicyTemplateFramework[] = [], frameworksNote = ''): string[] {
  if (templates.length === 0) return []
  const labels = new Map(categories.map(category => [category.id, category.label]))
  const frameworkLabels = new Map(frameworks.map(framework => [framework.id, framework.label]))
  // Tags are shown only beside the platform's sentence on what they mean; without it, none.
  const tags = (template: PolicyTemplate) => frameworksNote.trim() === '' ? [] : (template.frameworks ?? []).map(id => frameworkLabels.get(id) ?? id)
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
      ...members.map(template => {
        const rules = template.rules.length === 1 ? '1 rule' : `${template.rules.length} rules`
        const tagged = tags(template).length > 0 ? ` [${tags(template).join(', ')}]` : ''
        return `  ${template.id.padEnd(width)}  ${template.title} (${template.key}, ${template.severity}, ${rules})${tagged}`
      }),
    ]),
  ]
}
