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

/** The example as a block of lines, indented by `indent`, under `heading`, followed by its note wrapped at 100 characters. */
export function examplePolicyLines(heading: string, indent = '  '): string[] {
  const note = ['']
  for (const word of EXAMPLE_POLICY_NOTE.split(' ')) {
    if (note.at(-1)!.length + word.length + 1 > 100) note.push(word)
    else note[note.length - 1] += `${note.at(-1) ? ' ' : ''}${word}`
  }

  return [heading, '', ...EXAMPLE_POLICY.map(line => line === '' ? '' : `${indent}${line}`), '', ...note]
}
