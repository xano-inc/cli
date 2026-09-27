/** Goals and sparse parameter seeds come from the instance's catalogue. */
export interface PolicyGoal {
  goal: string
  id: string
  key: string
  rules: Array<{check: string; needs: string[]; params: Record<string, unknown>; title: string}>
  severity: string
  summary: string
}

export function policy_from_goal(goal: PolicyGoal, taken_keys: string[], key?: string, overrides: string[] = []) {
  const taken = new Set(taken_keys.map(value => value.toLowerCase()))
  let chosen = key ?? goal.key
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(chosen)) throw new Error('A policy key must be 1–64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.')
  if (key !== undefined && taken.has(chosen.toLowerCase())) throw new Error(`Policy ${chosen} already exists. Choose a new --key or use policy publish to update it.`)
  for (let suffix = 2; taken.has(chosen.toLowerCase()); suffix++) chosen = `${goal.key.slice(0, 63 - String(suffix).length)}-${suffix}`
  const rules = goal.rules.map(rule => ({check: rule.check, params: Array.isArray(rule.params) ? {} : structuredClone(rule.params), title: rule.title}))
  for (const assignment of overrides) apply_override(rules, assignment)

  const missing = goal.rules.flatMap((rule, index) => (rule.needs ?? []).filter(path => !filled(read_path(rules[index].params, path))).map(path => `${index + 1}.${path}`))
  if (missing.length > 0) throw new Error(`Fill the goal's required settings with --param 'N.path=JSON': ${missing.join(', ')}.`)
  return {key: chosen, rules, severity: goal.severity, statement: goal.summary, title: goal.goal}
}

function read_path(params: Record<string, unknown>, path: string): unknown {
  let value: unknown = params
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined
    value = (value as Record<string, unknown>)[part]
  }

  return value
}

function filled(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(item => filled(item))
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')
}

function apply_override(rules: Array<{params: Record<string, unknown>}>, assignment: string): void {
  const equals = assignment.indexOf('=')
  if (equals < 1) throw new Error('Use --param path=JSON or --param N.path=JSON (rule numbers start at 1).')
  const parts = assignment.slice(0, equals).split('.')
  let index = 0
  if (/^\d+$/.test(parts[0])) index = Number(parts.shift()) - 1
  else if (rules.length !== 1) throw new Error('Include the rule number in --param N.path=JSON for a goal with multiple rules.')
  if (!Number.isSafeInteger(index) || !rules[index]) throw new Error(`Rule ${index + 1} does not exist in this goal.`)
  if (parts.length === 0 || parts.some(part => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) || ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('Invalid parameter path. Use parameter names separated by dots.')
  let value: unknown
  try {
    value = JSON.parse(assignment.slice(equals + 1))
  } catch {
    throw new Error(`The value for ${assignment.slice(0, equals)} must be JSON: a quoted string, number, boolean, array or object.`)
  }

  let target = rules[index].params
  for (const part of parts.slice(0, -1)) {
    if (target[part] === undefined) target[part] = {}
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) throw new Error(`Cannot set a nested parameter inside ${part}.`)
    target = target[part] as Record<string, unknown>
  }

  target[parts.at(-1)!] = value
}
