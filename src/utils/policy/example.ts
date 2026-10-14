/**
 * A minimal policy file, shown where a person first looks for one: `policy parse --help` and the head of
 * `policy catalogue`'s summary. It parses clean on the platform (header, title, statement, severity and
 * one rule whose params hold a check param and a scope field); `active` and `enforcement` take their
 * defaults (true, advisory).
 */
export const EXAMPLE_POLICY = [
  'policy "AUTH-010" {',
  '  title = "Admin endpoints check the caller\'s role"',
  '  statement = "Every endpoint under admin calls require_admin first."',
  '  severity = "high"',
  '',
  '  rule {',
  '    title = "Admin endpoints call require_admin first"',
  '    check = "object.statement_required"',
  '    params = {',
  '      functions: ["require_admin"]',
  '      placement: "first"',
  '      paths: ["admin"]',
  '      object_kinds: ["query"]',
  '    }',
  '  }',
  '}',
]

/** What the example's parts are, after it. */
export const EXAMPLE_POLICY_NOTE = 'functions and placement are the check\'s own params; paths and object_kinds are scope fields, written beside them. '
  + 'active (default true) and enforcement (default "advisory") may be left out.'

/** One policy field as the catalogue's `document.fields` serves it. */
export interface PolicyDocumentField {
  default?: unknown
  description?: string
  values?: unknown[]
}

/**
 * `severity` and `enforcement` for an instance that serves no `document` (and for `policy parse --help`,
 * which reads no catalogue): the platform's values, defaults and sentences as of this CLI.
 */
const OFFLINE_FIELDS: Record<'enforcement' | 'severity', PolicyDocumentField> = {
  enforcement: {
    default: 'advisory',
    description: 'An advisory policy only reports its findings. An active blocking policy\'s findings also stop a gated change that introduces them or changes the objects they are on: a merge, a set-live, a publish or push to the live branch, an archive import or a tenant deploy, unless someone allowed to override gives a reason.',
    values: ['advisory', 'blocking'],
  },
  severity: {
    default: 'medium',
    description: 'How much a violation of this policy matters. It orders findings in reports and never blocks anything; enforcement does.',
    values: ['critical', 'high', 'medium', 'low'],
  },
}

/**
 * The example as a block of lines, indented by `indent`, under `heading`, followed by its note and what
 * `severity` and `enforcement` take and do, each wrapped at 100 characters. `fields` is the catalogue's
 * `document.fields`, so the platform words them; a field it does not serve uses the offline copy.
 */
export function examplePolicyLines(heading: string, indent = '  ', fields: Record<string, PolicyDocumentField | undefined> = {}): string[] {
  const field = (name: 'enforcement' | 'severity'): string => {
    const served = fields[name] && typeof fields[name] === 'object' ? fields[name]! : {}
    // Values and their default come together, from the instance or from the offline copy.
    const isServed = Array.isArray(served.values) && served.values.length > 0
    const values = isServed ? served.values! : OFFLINE_FIELDS[name].values!
    const byDefault = isServed ? served.default : OFFLINE_FIELDS[name].default
    const listed = values.map(value => `${JSON.stringify(value)}${value === byDefault ? ' (default)' : ''}`)
    const description = typeof served.description === 'string' && served.description.trim() ? served.description.trim() : OFFLINE_FIELDS[name].description
    return `${name} is ${listed.slice(0, -1).join(', ')} or ${listed.at(-1)}. ${description}`
  }

  return [heading, '', ...EXAMPLE_POLICY.map(line => line === '' ? '' : `${indent}${line}`), '', ...[EXAMPLE_POLICY_NOTE, field('severity'), field('enforcement')].flatMap(text => wrapAt(text, 100))]
}

/** Words wrapped at `width`. */
function wrapAt(text: string, width: number): string[] {
  const lines = ['']
  for (const word of text.split(' ')) {
    if (lines.at(-1)!.length + word.length + 1 > width && lines.at(-1)) lines.push(word)
    else lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${word}`
  }

  return lines
}
