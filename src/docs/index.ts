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
import {agentDocs} from './content/agent.js'
import {apiDocs} from './content/api.js'
import {apigroupDocs} from './content/apigroup.js'
import {auditLogDocs} from './content/audit-log.js'
import {branchDocs} from './content/branch.js'
import {datasourceDocs} from './content/datasource.js'
import {fileDocs} from './content/file.js'
import {functionDocs} from './content/function.js'
import {gettingStartedDocs} from './content/getting-started.js'
import {historyDocs} from './content/history.js'
import {mcpServerDocs} from './content/mcp-server.js'
import {middlewareDocs} from './content/middleware.js'
import {profileDocs} from './content/profile.js'
import {tableDocs} from './content/table.js'
import {taskDocs} from './content/task.js'
import {toolDocs} from './content/tool.js'
import {triggerDocs} from './content/trigger.js'
import {workspaceDocs} from './content/workspace.js'

/**
 * Registry of all available documentation topics
 */
export const docRegistry: Map<string, DocTopic> = new Map([
  ['getting-started', gettingStartedDocs],
  ['addon', addonDocs],
  ['agent', agentDocs],
  ['api', apiDocs],
  ['apigroup', apigroupDocs],
  ['audit-log', auditLogDocs],
  ['branch', branchDocs],
  ['datasource', datasourceDocs],
  ['file', fileDocs],
  ['function', functionDocs],
  ['history', historyDocs],
  ['mcp-server', mcpServerDocs],
  ['middleware', middlewareDocs],
  ['profile', profileDocs],
  ['table', tableDocs],
  ['task', taskDocs],
  ['tool', toolDocs],
  ['trigger', triggerDocs],
  ['workspace', workspaceDocs],
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
