/**
 * Phase 1 Integration Tests - Complete Existing Resources
 *
 * Tests for:
 * - Function delete and security
 * - Workspace get, context, openapi, export/import
 *
 * Run with: npm test
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
  functionId: null as string | null,
}

const testSuffix = `_phase1_${Date.now()}`

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
  input?: Record<string, unknown>
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

  let report = `# Phase 1 Integration Test Report

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
  const reportPath = path.join(process.cwd(), 'test-report-phase1.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\nPhase 1 test report written to: ${reportPath}`)
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

async function runTrackedCommand(command: string, input?: Record<string, unknown>): Promise<{stdout: string; stderr?: string; error?: Error}> {
  currentTest.command = `xano ${command}`
  currentTest.input = input

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

describe('Phase 1 Integration Tests', function () {
  this.timeout(30000)

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
      input: currentTest.input,
      output: currentTest.output,
      error: currentTest.error,
    })
  })

  after(function () {
    writeReport()
  })

  // ============================================
  // FUNCTION TESTS
  // ============================================
  describe('Function Commands', () => {
    describe('Create Function for Testing', () => {
      it('creates a test function', async () => {
        const funcName = `test_func${testSuffix}`
        const xsContent = `function ${funcName} {
  input {
  }
  stack {
  }
  response = "Hello from test function"
}`
        const tmpFile = path.join(os.tmpdir(), `test-func-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `function create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')
          expect(result.name).to.equal(funcName)

          createdResources.functionId = String(result.id)
          console.log(`      Created function ID: ${createdResources.functionId}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('Function Security', () => {
      it('updates function security (clear)', async function () {
        if (!createdResources.functionId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `function security ${createdResources.functionId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })

      it('shows error when no security option provided', async function () {
        if (!createdResources.functionId) {
          this.skip()
          return
        }

        const {error} = await runTrackedCommand(
          `function security ${createdResources.functionId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(error?.message).to.include('Either --apigroup-guid or --clear must be provided')
      })
    })

    describe('Function Delete', () => {
      it('deletes the test function', async function () {
        if (!createdResources.functionId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `function delete ${createdResources.functionId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted function ID: ${createdResources.functionId}`)
      })

      it('shows error for non-existent function', async () => {
        const {error} = await runTrackedCommand(
          `function delete 999999 -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(error).to.exist
      })
    })
  })

  // ============================================
  // WORKSPACE TESTS
  // ============================================
  describe('Workspace Commands', () => {
    describe('Workspace Get', () => {
      it('gets workspace details in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `workspace get ${WORKSPACE_ID} -p ${PROFILE}`,
        )
        expect(stdout).to.include('Workspace:')
        expect(stdout).to.include(`ID: ${WORKSPACE_ID}`)
      })

      it('gets workspace details in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `workspace get ${WORKSPACE_ID} -p ${PROFILE} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(WORKSPACE_ID)
      })
    })

    describe('Workspace Context', () => {
      it('gets workspace context (text format)', async () => {
        const {stdout} = await runTrackedCommand(
          `workspace context ${WORKSPACE_ID} -p ${PROFILE}`,
        )
        // Context returns text format (XanoScript-like), not JSON
        expect(stdout).to.be.a('string')
        expect(stdout.length).to.be.greaterThan(0)
        // Should include workspace info
        expect(stdout).to.include('workspaceId')
      })
    })

    describe('Workspace OpenAPI', () => {
      it('gets workspace OpenAPI spec', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `workspace openapi ${WORKSPACE_ID} -p ${PROFILE}`,
        )
        const result = parseJsonOutput(stdout, stderr) as {openapi?: string; info?: unknown}
        expect(result).to.be.an('object')
        // OpenAPI spec should have openapi version or info
        expect(result.openapi || result.info).to.exist
      })
    })

    describe('Workspace Export/Import Schema', () => {
      let schemaExportFile: string

      it('exports workspace schema to file', async () => {
        schemaExportFile = path.join(os.tmpdir(), `schema-export-${Date.now()}.xano`)
        const {stdout} = await runTrackedCommand(
          `workspace export-schema ${WORKSPACE_ID} -p ${PROFILE} --file ${schemaExportFile}`,
        )
        expect(stdout).to.include('exported')
        expect(fs.existsSync(schemaExportFile)).to.be.true
        // Verify it's a binary file (gzipped archive)
        const fileContent = fs.readFileSync(schemaExportFile)
        expect(fileContent.length).to.be.greaterThan(0)

        // Clean up
        if (fs.existsSync(schemaExportFile)) {
          fs.unlinkSync(schemaExportFile)
        }
      })
    })

    describe('Workspace Export', () => {
      let workspaceExportFile: string

      it('exports workspace to file', async () => {
        workspaceExportFile = path.join(os.tmpdir(), `workspace-export-${Date.now()}.xano`)
        const {stdout} = await runTrackedCommand(
          `workspace export ${WORKSPACE_ID} -p ${PROFILE} --file ${workspaceExportFile}`,
        )
        expect(stdout).to.include('exported')
        expect(fs.existsSync(workspaceExportFile)).to.be.true
        // Verify it's a binary file (gzipped archive)
        const fileContent = fs.readFileSync(workspaceExportFile)
        expect(fileContent.length).to.be.greaterThan(0)

        // Clean up
        if (fs.existsSync(workspaceExportFile)) {
          fs.unlinkSync(workspaceExportFile)
        }
      })
    })
  })
})
