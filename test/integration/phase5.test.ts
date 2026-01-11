/**
 * Phase 5 Integration Tests - Advanced Resources
 *
 * Tests for:
 * - Agents (list, get, create, edit, delete)
 * - MCP Servers (list, get, create, edit, delete)
 * - Tools (list, get, create, edit, delete)
 *
 * Run with: npm test -- --grep "Phase 5"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const WORKSPACE_ID = '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

// Store created resource IDs for cleanup
const createdResources = {
  agentId: null as string | null,
  mcpServerId: null as string | null,
  toolId: null as string | null,
}

// Temporary files for XanoScript content
const tempFiles = {
  toolXs: null as string | null,
  agentXs: null as string | null,
  mcpServerXs: null as string | null,
}

const testSuffix = `_phase5_${Date.now()}`

// Helper to create temp XanoScript files
function createTempXsFile(content: string, prefix: string): string {
  const tempDir = os.tmpdir()
  const filePath = path.join(tempDir, `${prefix}_${Date.now()}.xs`)
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
}

// Cleanup temp files
function cleanupTempFiles(): void {
  for (const key of Object.keys(tempFiles) as Array<keyof typeof tempFiles>) {
    if (tempFiles[key] && fs.existsSync(tempFiles[key]!)) {
      fs.unlinkSync(tempFiles[key]!)
      tempFiles[key] = null
    }
  }
}

// ============================================
// TEST REPORT TRACKING
// ============================================
interface TestResult {
  name: string
  phase: string
  category: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  command?: string
  output?: unknown
  error?: string
}

const testResults: TestResult[] = []
const testStartTime = Date.now()
let currentTest: Partial<TestResult> = {}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function truncateOutput(output: unknown, maxLength = 500): string {
  const str = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '... (truncated)'
}

function generateMarkdownReport(): string {
  const endTime = Date.now()
  const totalDuration = endTime - testStartTime
  const passed = testResults.filter((t) => t.status === 'passed').length
  const failed = testResults.filter((t) => t.status === 'failed').length
  const skipped = testResults.filter((t) => t.status === 'skipped').length

  let report = `# Phase 5 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | ${new Date().toISOString()} |
| **Total Duration** | ${formatDuration(totalDuration)} |
| **Profile** | ${PROFILE} |
| **Workspace** | ${WORKSPACE_ID} |
| **Total Tests** | ${testResults.length} |
| **Passed** | ${passed} |
| **Failed** | ${failed} |
| **Skipped** | ${skipped} |

## Results

| Status | Test | Duration |
|--------|------|----------|
`

  for (const test of testResults) {
    const statusIcon = test.status === 'passed' ? 'PASS' : test.status === 'failed' ? 'FAIL' : 'SKIP'
    report += `| ${statusIcon} | ${test.phase} > ${test.category} > ${test.name} | ${formatDuration(test.duration)} |\n`
  }

  report += `\n---\n\n## Detailed Results\n\n`

  const phases = [...new Set(testResults.map((t) => t.phase))]

  for (const phase of phases) {
    report += `### ${phase}\n\n`
    const phaseTests = testResults.filter((t) => t.phase === phase)
    const categories = [...new Set(phaseTests.map((t) => t.category))]

    for (const category of categories) {
      report += `#### ${category}\n\n`
      const categoryTests = phaseTests.filter((t) => t.category === category)

      for (const test of categoryTests) {
        const statusIcon = test.status === 'passed' ? 'PASS' : test.status === 'failed' ? 'FAIL' : 'SKIP'
        report += `##### ${statusIcon} ${test.name}\n\n`
        report += `- **Status:** ${test.status}\n`
        report += `- **Duration:** ${formatDuration(test.duration)}\n`

        if (test.command) {
          report += `- **Command:** \`${test.command}\`\n`
        }

        if (test.output !== undefined) {
          report += `- **Output:**\n\`\`\`json\n${truncateOutput(test.output)}\n\`\`\`\n`
        }

        if (test.error) {
          report += `- **Error:**\n\`\`\`\n${test.error}\n\`\`\`\n`
        }

        report += '\n'
      }
    }
  }

  return report
}

function writeReport(): void {
  const report = generateMarkdownReport()
  const reportPath = path.join(process.cwd(), 'test-report-phase5.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\nPhase 5 test report written to: ${reportPath}`)
}

function parseJsonOutput(stdout: string, stderr?: string): unknown {
  if (!stdout || stdout.trim() === '') {
    throw new Error(`Command returned empty output. stderr: ${stderr || 'none'}`)
  }
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`Failed to parse JSON output: ${stdout.substring(0, 500)}`)
  }
}

async function runTrackedCommand(command: string): Promise<{stdout: string; stderr?: string; error?: Error}> {
  currentTest.command = `xano ${command}`

  const result = await runCommand(command)

  if (result.stdout) {
    try {
      currentTest.output = JSON.parse(result.stdout)
    } catch {
      currentTest.output = result.stdout.trim()
    }
  }

  if (result.error) {
    currentTest.error = result.error.message
  }

  return result
}

describe('Phase 5 Integration Tests', function () {
  this.timeout(60000)

  let currentPhase = ''
  let currentCategory = ''
  let testStartMs = 0

  beforeEach(function () {
    const titlePath = this.currentTest?.titlePath() || []
    currentPhase = titlePath[1] || 'Unknown Phase'
    currentCategory = titlePath[2] || 'Unknown Category'
    currentTest = {}
    testStartMs = Date.now()
  })

  afterEach(function () {
    const duration = Date.now() - testStartMs
    const state = this.currentTest?.state
    let status: 'passed' | 'failed' | 'skipped' = 'passed'

    if (state === 'failed') {
      status = 'failed'
      if (!currentTest.error && this.currentTest?.err) {
        currentTest.error = this.currentTest.err.message
      }
    } else if (this.currentTest?.pending) {
      status = 'skipped'
    }

    testResults.push({
      name: this.currentTest?.title || 'Unknown Test',
      phase: currentPhase,
      category: currentCategory,
      status,
      duration,
      command: currentTest.command,
      output: currentTest.output,
      error: currentTest.error,
    })
  })

  after(function () {
    writeReport()
    cleanupTempFiles()
  })

  // ============================================
  // TOOL TESTS
  // ============================================
  describe('Tool Commands', () => {
    describe('Create Tool', () => {
      it('creates a new tool', async () => {
        const toolName = `test_tool${testSuffix}`
        const toolXsContent = `tool "${toolName}" {
  description = "Test tool for phase 5 integration tests"
  instructions = "Use this tool to test the CLI create functionality."
  input {
    text test_input? {
      description = "Optional test input parameter"
    }
  }
  stack {
    var $result {
      value = "test_response"
    }
  }
  response = $result
}`
        tempFiles.toolXs = createTempXsFile(toolXsContent, 'tool')

        const {stdout, stderr} = await runTrackedCommand(
          `tool create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tempFiles.toolXs} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(result).to.have.property('name', toolName)
        createdResources.toolId = String(result.id)
        console.log(`      Created tool ID: ${createdResources.toolId}`)
      })
    })

    describe('List Tools', () => {
      it('lists tools and finds created tool', async function () {
        if (!createdResources.toolId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `tool list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string}>

        expect(result).to.be.an('array')
        const found = result.find((t) => String(t.id) === createdResources.toolId)
        expect(found).to.not.be.undefined
        console.log(`      Found tool in list: ${found?.name}`)
      })
    })

    describe('Get Tool', () => {
      it('gets tool details', async function () {
        if (!createdResources.toolId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `tool get ${createdResources.toolId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.toolId)
      })
    })

    describe('Edit Tool', () => {
      it('updates tool via XanoScript file', async function () {
        if (!createdResources.toolId) {
          this.skip()
          return
        }

        // Create updated XanoScript for the tool
        const updatedToolXs = `tool "test_tool${testSuffix}" {
  description = "Updated description for phase 5 integration tests"
  instructions = "Updated instructions for testing the CLI edit functionality."
  input {
    text test_input? {
      description = "Updated test input parameter"
    }
  }
  stack {
    var $result {
      value = "updated_test_response"
    }
  }
  response = $result
}`
        const editFile = createTempXsFile(updatedToolXs, 'tool_edit')

        const {stdout} = await runTrackedCommand(
          `tool edit ${createdResources.toolId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${editFile}`,
        )
        expect(stdout).to.include('updated successfully')

        // Cleanup edit file
        if (fs.existsSync(editFile)) {
          fs.unlinkSync(editFile)
        }
      })
    })

    describe('Delete Tool', () => {
      it('deletes the test tool', async function () {
        if (!createdResources.toolId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `tool delete ${createdResources.toolId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted tool ID: ${createdResources.toolId}`)
        createdResources.toolId = null
      })
    })
  })

  // ============================================
  // AGENT TESTS
  // ============================================
  describe('Agent Commands', () => {
    describe('Create Agent', () => {
      it('creates a new agent', async () => {
        const agentName = `Test Agent ${testSuffix}`
        const agentCanonical = `test-agent${testSuffix}`
        const agentXsContent = `agent "${agentName}" {
  canonical = "${agentCanonical}"
  description = "Test agent for phase 5 integration tests"
  llm = {
    type: "xano-free"
    system_prompt: "You are a test AI Agent. Respond clearly and concisely."
    prompt: "{{ $args.message }}"
    max_steps: 3
    temperature: 0
    search_grounding: false
  }
  tools = []
}`
        tempFiles.agentXs = createTempXsFile(agentXsContent, 'agent')

        const {stdout, stderr} = await runTrackedCommand(
          `agent create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tempFiles.agentXs} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(result).to.have.property('name', agentName)
        createdResources.agentId = String(result.id)
        console.log(`      Created agent ID: ${createdResources.agentId}`)
      })
    })

    describe('List Agents', () => {
      it('lists agents and finds created agent', async function () {
        if (!createdResources.agentId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `agent list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string}>

        expect(result).to.be.an('array')
        const found = result.find((a) => String(a.id) === createdResources.agentId)
        expect(found).to.not.be.undefined
        console.log(`      Found agent in list: ${found?.name}`)
      })
    })

    describe('Get Agent', () => {
      it('gets agent details', async function () {
        if (!createdResources.agentId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `agent get ${createdResources.agentId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.agentId)
      })
    })

    describe('Edit Agent', () => {
      it('updates agent via XanoScript file', async function () {
        if (!createdResources.agentId) {
          this.skip()
          return
        }

        // Create updated XanoScript for the agent
        const agentName = `Test Agent ${testSuffix}`
        const agentCanonical = `test-agent${testSuffix}`
        const updatedAgentXs = `agent "${agentName}" {
  canonical = "${agentCanonical}"
  description = "Updated agent description for phase 5 integration tests"
  llm = {
    type: "xano-free"
    system_prompt: "You are an updated test AI Agent. Respond clearly and concisely."
    prompt: "{{ $args.message }}"
    max_steps: 5
    temperature: 0.1
    search_grounding: false
  }
  tools = []
}`
        const editFile = createTempXsFile(updatedAgentXs, 'agent_edit')

        const {stdout} = await runTrackedCommand(
          `agent edit ${createdResources.agentId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${editFile}`,
        )
        expect(stdout).to.include('updated successfully')

        // Cleanup edit file
        if (fs.existsSync(editFile)) {
          fs.unlinkSync(editFile)
        }
      })
    })

    describe('Delete Agent', () => {
      it('deletes the test agent', async function () {
        if (!createdResources.agentId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `agent delete ${createdResources.agentId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted agent ID: ${createdResources.agentId}`)
        createdResources.agentId = null
      })
    })
  })

  // ============================================
  // MCP SERVER TESTS
  // ============================================
  describe('MCP Server Commands', () => {
    describe('Create MCP Server', () => {
      it('creates a new MCP server', async () => {
        const serverName = `Test MCP ${testSuffix}`
        const serverCanonical = `test-mcp${testSuffix}`
        const mcpXsContent = `mcp_server "${serverName}" {
  canonical = "${serverCanonical}"
  description = "Test MCP server for phase 5 integration tests"
  instructions = "This is a test MCP server for CLI integration testing."
  tags = ["test", "integration"]
  tools = []
}`
        tempFiles.mcpServerXs = createTempXsFile(mcpXsContent, 'mcp_server')

        const {stdout, stderr} = await runTrackedCommand(
          `mcp-server create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tempFiles.mcpServerXs} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(result).to.have.property('name', serverName)
        createdResources.mcpServerId = String(result.id)
        console.log(`      Created MCP server ID: ${createdResources.mcpServerId}`)
      })
    })

    describe('List MCP Servers', () => {
      it('lists MCP servers and finds created server', async function () {
        if (!createdResources.mcpServerId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `mcp-server list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string}>

        expect(result).to.be.an('array')
        const found = result.find((s) => String(s.id) === createdResources.mcpServerId)
        expect(found).to.not.be.undefined
        console.log(`      Found MCP server in list: ${found?.name}`)
      })
    })

    describe('Get MCP Server', () => {
      it('gets MCP server details', async function () {
        if (!createdResources.mcpServerId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `mcp-server get ${createdResources.mcpServerId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.mcpServerId)
      })
    })

    describe('Edit MCP Server', () => {
      it('updates MCP server via XanoScript file', async function () {
        if (!createdResources.mcpServerId) {
          this.skip()
          return
        }

        // Create updated XanoScript for the MCP server
        const serverName = `Test MCP ${testSuffix}`
        const serverCanonical = `test-mcp${testSuffix}`
        const updatedMcpXs = `mcp_server "${serverName}" {
  canonical = "${serverCanonical}"
  description = "Updated MCP server description for phase 5 integration tests"
  instructions = "Updated instructions for CLI integration testing."
  tags = ["test", "integration", "updated"]
  tools = []
}`
        const editFile = createTempXsFile(updatedMcpXs, 'mcp_edit')

        const {stdout} = await runTrackedCommand(
          `mcp-server edit ${createdResources.mcpServerId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${editFile}`,
        )
        expect(stdout).to.include('updated successfully')

        // Cleanup edit file
        if (fs.existsSync(editFile)) {
          fs.unlinkSync(editFile)
        }
      })
    })

    describe('Delete MCP Server', () => {
      it('deletes the test MCP server', async function () {
        if (!createdResources.mcpServerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `mcp-server delete ${createdResources.mcpServerId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted MCP server ID: ${createdResources.mcpServerId}`)
        createdResources.mcpServerId = null
      })
    })
  })

  // ============================================
  // REALTIME TESTS (read-only since it requires enabling)
  // ============================================
  describe('Realtime Commands', () => {
    describe('Get Realtime Config', () => {
      it('gets realtime configuration', async () => {
        const {stdout, error} = await runTrackedCommand(
          `realtime get -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        expect(error).to.be.undefined
        const result = parseJsonOutput(stdout) as {enabled: boolean}
        expect(result).to.have.property('enabled')
      })
    })
  })

  // ============================================
  // WORKFLOW TEST TESTS (read-only)
  // ============================================
  describe('Workflow Test Commands', () => {
    describe('List Workflow Tests', () => {
      it('lists workflow tests', async () => {
        const {stdout, error} = await runTrackedCommand(
          `workflow-test list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        expect(error).to.be.undefined
        const result = parseJsonOutput(stdout)
        expect(result).to.be.an('array')
      })
    })
  })
})
