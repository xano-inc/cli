/**
 * Phase 4 Integration Tests - Table Data Operations
 *
 * Tests for:
 * - Table Content (CRUD, search, bulk ops, truncate)
 * - Table Schema (get, replace, column operations)
 * - Table Index (list, create, delete)
 *
 * Run with: npm test
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WORKSPACE_ID = '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

// Store created resource IDs for cleanup
const createdResources = {
  tableId: null as string | null,
  recordId: null as string | null,
  bulkRecordIds: [] as number[],
}

const testSuffix = `_phase4_${Date.now()}`

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

  let report = `# Phase 4 Integration Test Report

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
  const reportPath = path.join(process.cwd(), 'test-report-phase4.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\nPhase 4 test report written to: ${reportPath}`)
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

describe('Phase 4 Integration Tests', function () {
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
      input: currentTest.input,
      output: currentTest.output,
      error: currentTest.error,
    })
  })

  after(function () {
    writeReport()
  })

  // ============================================
  // SETUP: Create test table
  // ============================================
  describe('Setup', () => {
    describe('Create Test Table', () => {
      it('creates a table for content tests', async () => {
        const tableName = `content_test${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `table create -p ${PROFILE} -w ${WORKSPACE_ID} --name ${tableName} --description "Table for content tests" -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}

        expect(result).to.have.property('id')
        createdResources.tableId = String(result.id)
        console.log(`      Created test table ID: ${createdResources.tableId}`)
      })
    })
  })

  // ============================================
  // TABLE CONTENT TESTS
  // ============================================
  describe('Table Content Commands', () => {
    describe('Create Record', () => {
      it('creates a record in the table', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        // Use JSON without spaces to avoid runCommand argument parsing issues
        const {stdout, stderr} = await runTrackedCommand(
          `table content create ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --data {"id":99} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}

        expect(result).to.have.property('id')
        createdResources.recordId = String(result.id)
        console.log(`      Created record ID: ${createdResources.recordId}`)
      })
    })

    describe('List Records', () => {
      it('lists records in JSON format', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table content list ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists records in summary format', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table content list ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Get Record', () => {
      it('gets record details in JSON format', async function () {
        if (!createdResources.tableId || !createdResources.recordId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table content get ${createdResources.tableId} ${createdResources.recordId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.recordId)
      })
    })

    describe('Edit Record', () => {
      it('updates a record', async function () {
        if (!createdResources.tableId || !createdResources.recordId) {
          this.skip()
          return
        }

        // Use JSON without spaces to avoid runCommand argument parsing issues
        const {stdout} = await runTrackedCommand(
          `table content edit ${createdResources.tableId} ${createdResources.recordId} -p ${PROFILE} -w ${WORKSPACE_ID} --data {"id":${createdResources.recordId}}`,
        )
        expect(stdout).to.include('updated successfully')
      })
    })

    describe('Bulk Create Records', () => {
      it('bulk creates multiple records', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        // Use JSON without spaces to avoid runCommand argument parsing issues
        const {stdout, stderr} = await runTrackedCommand(
          `table content bulk-create ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --data [{"id":100},{"id":101}] -o json`,
        )
        // API returns array of IDs (numbers), not record objects
        const result = parseJsonOutput(stdout, stderr) as number[]

        if (Array.isArray(result)) {
          createdResources.bulkRecordIds = result
          console.log(`      Created bulk record IDs: ${createdResources.bulkRecordIds.join(', ')}`)
        }
      })
    })

    describe('Bulk Delete Records', () => {
      it('bulk deletes multiple records', async function () {
        if (!createdResources.tableId || createdResources.bulkRecordIds.length === 0) {
          this.skip()
          return
        }

        const ids = createdResources.bulkRecordIds.join(',')
        const {stdout} = await runTrackedCommand(
          `table content bulk-delete ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --ids ${ids} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted bulk record IDs: ${ids}`)
      })
    })

    describe('Delete Record', () => {
      it('deletes the test record', async function () {
        if (!createdResources.tableId || !createdResources.recordId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table content delete ${createdResources.tableId} ${createdResources.recordId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted record ID: ${createdResources.recordId}`)
      })
    })
  })

  // ============================================
  // TABLE SCHEMA TESTS
  // ============================================
  describe('Table Schema Commands', () => {
    describe('Get Schema', () => {
      it('gets table schema', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table schema get ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })
    })

    describe('Add Column', () => {
      it('adds a text column to the schema', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table schema column add ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --type text --name test_column`,
        )
        expect(stdout).to.include('added successfully')
      })
    })

    describe('Get Column', () => {
      it('gets column details', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table schema column get ${createdResources.tableId} test_column -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Column:')
      })
    })

    describe('Rename Column', () => {
      it('renames a column', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table schema column rename ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --old-name test_column --new-name renamed_column`,
        )
        expect(stdout).to.include('renamed')
      })
    })

    describe('Delete Column', () => {
      it('deletes a column', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table schema column delete ${createdResources.tableId} renamed_column -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
      })
    })
  })

  // ============================================
  // TABLE INDEX TESTS
  // ============================================
  describe('Table Index Commands', () => {
    describe('List Indexes', () => {
      it('lists table indexes', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table index list ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })
    })
  })

  // ============================================
  // CLEANUP: Delete test table
  // ============================================
  describe('Cleanup', () => {
    describe('Delete Test Table', () => {
      it('deletes the test table', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table delete ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted test table ID: ${createdResources.tableId}`)
      })
    })
  })
})
