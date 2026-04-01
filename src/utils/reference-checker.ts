import {parseDocument} from './document-parser.js'

/**
 * A reference from one document to another (e.g., function.run "bad" references function "bad").
 */
export interface BadReference {
  /** Name of the source document containing the reference */
  source: string
  /** Type of the source document (e.g., "function") */
  sourceType: string
  /** The statement type that creates the reference (e.g., "function.run") */
  statementType: string
  /** The referenced name that doesn't exist */
  target: string
  /** The target type being referenced (e.g., "function") */
  targetType: string
}

/**
 * Definition of a reference pattern to scan for in XanoScript documents.
 * Each pattern maps a statement keyword to the type of object it references.
 */
interface ReferencePattern {
  /** The statement keyword (e.g., "function.run") for display purposes */
  keyword: string
  /** Regex to extract the referenced name from the statement line */
  regex: RegExp
  /** The type of object being referenced (used to look up in the registry) */
  targetType: string
}

/**
 * All known cross-reference patterns in XanoScript.
 *
 * Each pattern matches a statement keyword followed by a quoted or unquoted name.
 * The first capture group extracts the name (stripping quotes if present).
 */
const REFERENCE_PATTERNS: ReferencePattern[] = [
  {keyword: 'function.run', regex: /^\s*function\.run\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'function'},
  {keyword: 'function.call', regex: /^\s*function\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'function'},
  {keyword: 'addon.call', regex: /^\s*addon\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'addon'},
  {keyword: 'task.call', regex: /^\s*task\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'task'},
  {keyword: 'tool.call', regex: /^\s*tool\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'tool'},
  {keyword: 'middleware.call', regex: /^\s*middleware\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'middleware'},
  {keyword: 'ai.agent.run', regex: /^\s*ai\.agent\.run\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'agent'},
  {keyword: 'trigger.call', regex: /^\s*trigger\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'trigger'},
  {keyword: 'action.call', regex: /^\s*action\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm, targetType: 'action'},
  {
    keyword: 'workflow_test.call',
    regex: /^\s*workflow_test\.call\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm,
    targetType: 'workflow_test',
  },
  // db.* statements reference tables: db.get, db.query, db.add, db.edit, db.add_or_edit, db.delete, db.bulk_add, db.bulk_delete, db.count
  {
    keyword: 'db.*',
    regex:
      /^\s*db\.(?:get|query|add|edit|add_or_edit|delete|bulk_add|bulk_delete|count)\s+("(?:[^"\\]|\\.)*"|[^\s{]+)/gm,
    targetType: 'table',
  },
  // Schema foreign key references: table = "name" inside field definitions
  {keyword: 'table (FK)', regex: /\btable\s*=\s*"([^"]*)"/gm, targetType: 'table'},
]

/**
 * Strip surrounding quotes from a name if present.
 */
function stripQuotes(name: string): string {
  if (name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1)
  }

  return name
}

/**
 * Map from XanoScript document types to the canonical type used in the registry.
 * Some types are aliases (agent, mcp_server → toolset bucket, but referenced as "agent").
 */
/* eslint-disable camelcase */
const TYPE_ALIASES: Record<string, string> = {
  agent: 'agent',
  mcp_server: 'agent',
  toolset: 'agent',
}
/* eslint-enable camelcase */

/**
 * Normalize a document type to its canonical registry type.
 */
function normalizeType(type: string): string {
  return TYPE_ALIASES[type] ?? type
}

/**
 * Build a registry of all defined object names from parsed documents.
 * Returns a Map of type → Set of names.
 */
export function buildRegistry(documents: Array<{content: string}>): Map<string, Set<string>> {
  const registry = new Map<string, Set<string>>()

  for (const doc of documents) {
    const parsed = parseDocument(doc.content)
    if (!parsed) continue

    const type = normalizeType(parsed.type)
    if (!registry.has(type)) {
      registry.set(type, new Set())
    }

    registry.get(type)!.add(parsed.name)
  }

  return registry
}

/**
 * Build a registry of server-known object names from dry-run operations.
 * Any object that appears in the dry-run (create, update, unchanged, delete) exists
 * either locally or on the server.
 */
export function buildServerRegistry(operations: Array<{name: string; type: string}>): Map<string, Set<string>> {
  const registry = new Map<string, Set<string>>()

  for (const op of operations) {
    const type = normalizeType(op.type)
    if (!registry.has(type)) {
      registry.set(type, new Set())
    }

    // Operation names for queries include the verb (e.g., "path/{id} DELETE")
    // but references use just the name, so strip the verb suffix
    const name = op.name.replace(/\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/, '')
    registry.get(type)!.add(name)
  }

  return registry
}

/**
 * Check all documents for cross-references that point to names not in the registry.
 *
 * When serverOperations is provided (from dry-run), references are checked against
 * both local files AND server-known objects, eliminating false positives for objects
 * that exist on the server but aren't in the push set.
 */
export function checkReferences(
  documents: Array<{content: string; filePath: string}>,
  serverOperations?: Array<{name: string; type: string}>,
): BadReference[] {
  const registry = buildRegistry(documents)

  // Merge server-known names into the registry
  if (serverOperations) {
    const serverRegistry = buildServerRegistry(serverOperations)
    for (const [type, names] of serverRegistry) {
      if (!registry.has(type)) {
        registry.set(type, new Set())
      }

      for (const name of names) {
        registry.get(type)!.add(name)
      }
    }
  }
  const badRefs: BadReference[] = []

  for (const doc of documents) {
    const parsed = parseDocument(doc.content)
    if (!parsed) continue

    for (const pattern of REFERENCE_PATTERNS) {
      // Reset regex state for each document
      pattern.regex.lastIndex = 0

      let match: null | RegExpExecArray
      while ((match = pattern.regex.exec(doc.content)) !== null) {
        const rawName = stripQuotes(match[1])

        // Skip empty names only for action.call (valid for integration actions)
        if (!rawName && pattern.keyword === 'action.call') continue

        const {targetType} = pattern
        const knownNames = registry.get(targetType)

        if (!knownNames || !knownNames.has(rawName)) {
          badRefs.push({
            source: parsed.name,
            sourceType: parsed.type,
            statementType: pattern.keyword,
            target: rawName,
            targetType,
          })
        }
      }
    }
  }

  return badRefs
}
