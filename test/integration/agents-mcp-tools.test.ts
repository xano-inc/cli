/**
 * Agents, MCP Servers & Tools Integration Tests
 *
 * Tests for:
 * - Tools (create, list, get, edit, delete)
 * - Agents (create, list, get, edit, delete)
 * - MCP Servers (create, list, get, edit, delete)
 * - Realtime (get config)
 * - Workflow Tests (list)
 *
 * Run with: npm test -- --grep "Agents, MCP Servers & Tools"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {TestReporter, createTestContext, parseJsonOutput} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

const reporter = new TestReporter(
  'agents-mcp-tools',
  'AI Agents, MCP Servers, Tools, and Realtime',
  PROFILE,
  WORKSPACE_ID,
)

const createdResources = {
  agentId: null as string | null,
  mcpServerId: null as string | null,
  toolId: null as string | null,
}

const tempFiles: string[] = []

const testSuffix = `_amt_${Date.now()}`

function createTempXsFile(content: string, prefix: string): string {
  const tempDir = os.tmpdir()
  const filePath = path.join(tempDir, `${prefix}_${Date.now()}.xs`)
  fs.writeFileSync(filePath, content, 'utf8')
  tempFiles.push(filePath)
  return filePath
}

function cleanupTempFiles(): void {
  for (const file of tempFiles) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }
}

async function runTrackedCommand(command: string): Promise<{stdout: string; stderr?: string; error?: Error}> {
  reporter.recordCommand(command)
  const result = await runCommand(command)

  if (result.stdout) {
    try {
      reporter.recordOutput(JSON.parse(result.stdout))
    } catch {
      reporter.recordOutput(result.stdout.trim())
    }
  }

  if (result.error) {
    reporter.recordError(result.error.message)
  }

  return result
}

describe('Agents, MCP Servers & Tools Integration Tests', function () {
  this.timeout(60000)

  const ctx = createTestContext(reporter)

  beforeEach(function () {
    ctx.beforeEach(this)
  })

  afterEach(function () {
    ctx.afterEach(this)
  })

  after(function () {
    ctx.after()
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
  description = "Test tool for integration tests"
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
        const tmpFile = createTempXsFile(toolXsContent, 'tool')

        const {stdout, stderr} = await runTrackedCommand(
          `tool create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
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

        const {stdout, stderr} = await runTrackedCommand(`tool list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
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

        const updatedToolXs = `tool "test_tool${testSuffix}" {
  description = "Updated description for integration tests"
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
  description = "Test agent for integration tests"
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
        const tmpFile = createTempXsFile(agentXsContent, 'agent')

        const {stdout, stderr} = await runTrackedCommand(
          `agent create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
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

        const {stdout, stderr} = await runTrackedCommand(`agent list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
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

        const agentName = `Test Agent ${testSuffix}`
        const agentCanonical = `test-agent${testSuffix}`
        const updatedAgentXs = `agent "${agentName}" {
  canonical = "${agentCanonical}"
  description = "Updated agent description for integration tests"
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
  description = "Test MCP server for integration tests"
  instructions = "This is a test MCP server for CLI integration testing."
  tags = ["test", "integration"]
  tools = []
}`
        const tmpFile = createTempXsFile(mcpXsContent, 'mcp_server')

        const {stdout, stderr} = await runTrackedCommand(
          `mcp-server create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
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

        const {stdout, stderr} = await runTrackedCommand(`mcp-server list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
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

        const serverName = `Test MCP ${testSuffix}`
        const serverCanonical = `test-mcp${testSuffix}`
        const updatedMcpXs = `mcp_server "${serverName}" {
  canonical = "${serverCanonical}"
  description = "Updated MCP server description for integration tests"
  instructions = "Updated instructions for CLI integration testing."
  tags = ["test", "integration", "updated"]
  tools = []
}`
        const editFile = createTempXsFile(updatedMcpXs, 'mcp_edit')

        const {stdout} = await runTrackedCommand(
          `mcp-server edit ${createdResources.mcpServerId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${editFile}`,
        )
        expect(stdout).to.include('updated successfully')
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
  // REALTIME TESTS (read-only)
  // ============================================
  describe('Realtime Commands', () => {
    describe('Get Realtime Config', () => {
      it('gets realtime configuration', async () => {
        const {stdout, error} = await runTrackedCommand(`realtime get -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
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
        const {stdout, error} = await runTrackedCommand(`workflow-test list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        expect(error).to.be.undefined
        const result = parseJsonOutput(stdout)
        expect(result).to.be.an('array')
      })
    })
  })
})
