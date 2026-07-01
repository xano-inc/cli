import * as fs from 'node:fs'

/**
 * Input assembly for `xano function run`.
 *
 * A run's `input` is a single JSON object sent to the Metadata API. Users can
 * build that object from several sources, which this module normalizes and
 * merges:
 *
 *   --json <inline | @file | ->   a base JSON object
 *   --data key=value              a string field (httpie convention)
 *   --data key:=<json>            a raw-JSON field (numbers, bools, arrays, ...)
 *   --data key@<file>             a field whose value is a file's contents (string)
 *
 * Merge order is: JSON base first, then --data pairs override — so the common
 * "reuse a payload file, tweak one field" flow works without editing the file.
 *
 * Everything here is pure and free of oclif/network deps so it is unit-testable
 * in isolation; the command layer handles fetching, prompting and output.
 */

export type JsonObject = Record<string, unknown>

/** A single declared function input parameter, as returned by the meta API. */
export interface FunctionInputParam {
  children?: FunctionInputParam[]
  default?: unknown
  description?: string
  name: string
  nullable?: boolean
  required?: boolean
  style?: {type?: string}
  type?: string
  values?: unknown[]
}

/**
 * Split a `--data` token into its key, operator and value.
 * Recognizes, in priority order: `:=` (raw json), `@` (file), `=` (string).
 * The operator is the FIRST occurrence scanned left-to-right, but `:=` is
 * detected before a bare `=` at the same position so `k:=1` is raw-json, not
 * a string key `k:` set to `=1`.
 */
export function splitDataToken(token: string): {key: string; op: ':=' | '=' | '@'; value: string} {
  // Find the earliest `=` and `@`; `:=` is an `=` preceded by `:`.
  const eq = token.indexOf('=')
  const at = token.indexOf('@')

  // Neither operator present -> invalid.
  if (eq === -1 && at === -1) {
    throw new Error(`Invalid --data '${token}'. Expected key=value, key:=json, or key@file.`)
  }

  // Choose whichever operator appears first. On a tie an '=' can't tie with '@'
  // at the same index, so a simple "smallest index wins" is unambiguous.
  const useAt = at !== -1 && (eq === -1 || at < eq)
  if (useAt) {
    const key = token.slice(0, at)
    if (!key) throw new Error(`Invalid --data '${token}': missing key before '@'.`)
    return {key, op: '@', value: token.slice(at + 1)}
  }

  // `=` path — check for the `:=` raw-json form (a ':' immediately before '=').
  if (eq > 0 && token[eq - 1] === ':') {
    const key = token.slice(0, eq - 1)
    if (!key) throw new Error(`Invalid --data '${token}': missing key before ':='.`)
    return {key, op: ':=', value: token.slice(eq + 1)}
  }

  const key = token.slice(0, eq)
  if (!key) throw new Error(`Invalid --data '${token}': missing key before '='.`)
  return {key, op: '=', value: token.slice(eq + 1)}
}

/**
 * Parse `--data` tokens into an object, applying httpie-style typing.
 * Later tokens override earlier ones with the same key.
 */
export function parseDataPairs(pairs: string[], readFile: (p: string) => string = defaultReadFile): JsonObject {
  const out: JsonObject = {}
  for (const token of pairs) {
    const {key, op, value} = splitDataToken(token)
    switch (op) {
      case ':=': {
        try {
          out[key] = JSON.parse(value)
        } catch (error) {
          throw new Error(`Invalid JSON for --data '${key}:=': ${(error as Error).message}`)
        }

        break
      }

      case '@': {
        out[key] = readFile(value)
        break
      }

      default: {
        out[key] = value
      }
    }
  }

  return out
}

/**
 * Load the `--json` source: inline JSON, `@file`, or `-` (stdin, supplied by
 * the caller via `stdin`). Must parse to a plain object; arrays/scalars are
 * rejected because a function's input is always a keyed object.
 */
export function loadJsonSource(
  source: string | undefined,
  opts: {readFile?: (p: string) => string; stdin?: () => string} = {},
): JsonObject | undefined {
  if (source === undefined) return undefined
  const readFile = opts.readFile ?? defaultReadFile

  let raw: string
  if (source === '-') {
    if (!opts.stdin) throw new Error('stdin reader not available for --json -')
    raw = opts.stdin()
  } else if (source.startsWith('@')) {
    raw = readFile(source.slice(1))
  } else {
    raw = source
  }

  if (raw.trim() === '') return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON input: ${(error as Error).message}`)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Function input must be a JSON object (e.g. {"name":"..."}), not an array or scalar.')
  }

  return parsed as JsonObject
}

/**
 * Merge a JSON base with --data overrides into the final input object.
 * Precedence: base first, then dataPairs override (shallow).
 */
export function assembleInput(opts: {dataPairs?: JsonObject; jsonBase?: JsonObject}): JsonObject {
  return {...opts.jsonBase, ...opts.dataPairs}
}

/**
 * Validate a supplied input object against a function's declared input schema.
 * Non-destructive: returns lists the caller can act on (prompt for missing
 * required params on a TTY, warn on enum mismatches, etc.). The server remains
 * the source of truth, so type mismatches are warnings, not hard failures.
 */
export function validateAgainstSchema(
  input: JsonObject,
  schema: FunctionInputParam[] | undefined,
): {missingRequired: FunctionInputParam[]; warnings: string[]} {
  const missingRequired: FunctionInputParam[] = []
  const warnings: string[] = []
  if (!schema) return {missingRequired, warnings}

  for (const param of schema) {
    const present = Object.hasOwn(input, param.name)
    if (!present) {
      // A required param with no default must be supplied.
      if (param.required && param.default === undefined) {
        missingRequired.push(param)
      }

      continue
    }

    const value = input[param.name]

    if (value === null && param.nullable === false) {
      warnings.push(`Input '${param.name}' is null but the parameter is not nullable.`)
    }

    // Enum membership check (only for non-null scalar values).
    if (Array.isArray(param.values) && param.values.length > 0 && value !== null && !param.values.includes(value)) {
      warnings.push(
        `Input '${param.name}' = ${JSON.stringify(value)} is not one of the allowed values: ` +
          param.values.map((v) => JSON.stringify(v)).join(', '),
      )
    }
  }

  return {missingRequired, warnings}
}

function defaultReadFile(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (error) {
    throw new Error(`Failed to read file '${p}': ${(error as Error).message}`)
  }
}
