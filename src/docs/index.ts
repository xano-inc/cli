/**
 * Documentation Registry
 *
 * Central registry for all CLI documentation content.
 * Documentation is organized by topic and can include:
 * - Overview and concepts
 * - XanoScript syntax
 * - Command-specific guides
 * - Examples and best practices
 * - Troubleshooting
 */

export interface DocTopic {
  name: string
  title: string
  description: string
  content: string
  relatedTopics?: string[]
}

// Import documentation content
import {addonDocs} from './content/addon.js'
import {apiDocs} from './content/api.js'
import {apigroupDocs} from './content/apigroup.js'
import {functionDocs} from './content/function.js'
import {gettingStartedDocs} from './content/getting-started.js'
import {tableDocs} from './content/table.js'

/**
 * Registry of all available documentation topics
 */
export const docRegistry: Map<string, DocTopic> = new Map([
  ['getting-started', gettingStartedDocs],
  ['addon', addonDocs],
  ['table', tableDocs],
  ['api', apiDocs],
  ['apigroup', apigroupDocs],
  ['function', functionDocs],
])

/**
 * Get documentation for a specific topic
 */
export function getDoc(topic: string): DocTopic | undefined {
  return docRegistry.get(topic.toLowerCase())
}

/**
 * Get all available documentation topics
 */
export function listDocs(): DocTopic[] {
  return Array.from(docRegistry.values())
}

/**
 * Search documentation content for a query
 */
export function searchDocs(query: string): DocTopic[] {
  const lowerQuery = query.toLowerCase()
  return Array.from(docRegistry.values()).filter(
    (doc) =>
      doc.name.toLowerCase().includes(lowerQuery) ||
      doc.title.toLowerCase().includes(lowerQuery) ||
      doc.description.toLowerCase().includes(lowerQuery) ||
      doc.content.toLowerCase().includes(lowerQuery),
  )
}
