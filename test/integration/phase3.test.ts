/**
 * Phase 3 Integration Tests - Trigger Resources
 *
 * Tests for:
 * - Workspace Trigger (list, get, create, edit, delete, security)
 * - Table Trigger (list, get, create, edit, delete, security)
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
  triggerId: null as string | null,
  tableTriggerTableId: null as string | null,
  tableTriggerId: null as string | null,
}

const testSuffix = `_phase3_${Date.now()}`

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

  let report = `# Phase 3 Integration Test Report

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
  const reportPath = path.join(process.cwd(), 'test-report-phase3.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\nPhase 3 test report written to: ${reportPath}`)
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

describe('Phase 3 Integration Tests', function () {
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
  // WORKSPACE TRIGGER TESTS
  // ============================================
  describe('Workspace Trigger Commands', () => {
    describe('Create Trigger', () => {
      it('creates a workspace trigger from XanoScript', async () => {
        const triggerName = `test_trigger${testSuffix}`
        // Workspace triggers respond to branch events (branch_live, branch_merge, branch_new)
        const xsContent = `workspace_trigger ${triggerName} {
  input {
    object to_branch? {
      schema {
        int id?
        text label?
      }
    }
    object from_branch? {
      schema {
        int id?
        text label?
      }
    }
    enum action {
      values = ["branch_live", "branch_merge", "branch_new"]
    }
  }
  stack {
    var $x1 {
      value = 1
    }
  }
  actions = {branch_live: true, branch_merge: true, branch_new: true}
}`
        const tmpFile = path.join(os.tmpdir(), `test-trigger-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `trigger create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')
          expect(result.name).to.equal(triggerName)

          createdResources.triggerId = String(result.id)
          console.log(`      Created trigger ID: ${createdResources.triggerId}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('List Triggers', () => {
      it('lists triggers in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `trigger list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists triggers in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `trigger list -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Get Trigger', () => {
      it('gets trigger details in JSON format', async function () {
        if (!createdResources.triggerId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `trigger get ${createdResources.triggerId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.triggerId)
      })

      it('gets trigger in summary format', async function () {
        if (!createdResources.triggerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `trigger get ${createdResources.triggerId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Trigger:')
        expect(stdout).to.include(`ID: ${createdResources.triggerId}`)
      })
    })

    describe('Edit Trigger', () => {
      it('edits trigger using XanoScript file', async function () {
        if (!createdResources.triggerId) {
          this.skip()
          return
        }

        // Trigger edit requires XanoScript file
        const triggerName = `test_trigger${testSuffix}`
        const xsContent = `workspace_trigger ${triggerName} {
  input {
    object to_branch? { schema { int id? } }
    object from_branch? { schema { int id? } }
    enum action { values = ["branch_live", "branch_merge", "branch_new"] }
  }
  stack {
    var $updated { value = "Updated by test" }
  }
  actions = {branch_live: true, branch_merge: true, branch_new: true}
}`
        const tmpFile = path.join(os.tmpdir(), `test-trigger-edit-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout} = await runTrackedCommand(
            `trigger edit ${createdResources.triggerId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile}`,
          )
          expect(stdout).to.include('updated successfully')
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('Trigger Security', () => {
      it('clears trigger security', async function () {
        if (!createdResources.triggerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `trigger security ${createdResources.triggerId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })
    })

    describe('Delete Trigger', () => {
      it('deletes the test trigger', async function () {
        if (!createdResources.triggerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `trigger delete ${createdResources.triggerId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted trigger ID: ${createdResources.triggerId}`)
      })
    })
  })

  // ============================================
  // TABLE TRIGGER TESTS
  // ============================================
  describe('Table Trigger Commands', () => {
    // First, create a table to use for table triggers
    describe('Setup Test Table', () => {
      it('creates a table for table trigger tests', async () => {
        const tableName = `trigger_test_table${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `table create -p ${PROFILE} -w ${WORKSPACE_ID} --name ${tableName} --description "Table for trigger tests" -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        createdResources.tableTriggerTableId = String(result.id)
        console.log(`      Created test table ID: ${createdResources.tableTriggerTableId}`)
      })
    })

    describe('Create Table Trigger', () => {
      it('creates a table trigger from XanoScript', async function () {
        if (!createdResources.tableTriggerTableId) {
          this.skip()
          return
        }

        const triggerName = `test_table_trigger${testSuffix}`
        // Table triggers respond to insert/update/delete/truncate on a specific table
        // Use the table name that was created (trigger_test_table + suffix)
        const tableName = `trigger_test_table${testSuffix}`
        const xsContent = `table_trigger ${triggerName} {
  table = "${tableName}"
  input {
    json new
    json old
    enum action {
      values = ["insert", "update", "delete", "truncate"]
    }
    text datasource
  }
  stack {
    var $x1 {
      value = 1
    }
  }
  actions = {insert: true, update: false}
}`
        const tmpFile = path.join(os.tmpdir(), `test-table-trigger-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `table trigger create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')

          createdResources.tableTriggerId = String(result.id)
          console.log(`      Created table trigger ID: ${createdResources.tableTriggerId}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('List Table Triggers', () => {
      it('lists table triggers in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `table trigger list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists table triggers in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `table trigger list -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Get Table Trigger', () => {
      it('gets table trigger details in JSON format', async function () {
        if (!createdResources.tableTriggerId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table trigger get ${createdResources.tableTriggerId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.tableTriggerId)
      })

      it('gets table trigger in summary format', async function () {
        if (!createdResources.tableTriggerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table trigger get ${createdResources.tableTriggerId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Table Trigger:')
        expect(stdout).to.include(`ID: ${createdResources.tableTriggerId}`)
      })
    })

    describe('Edit Table Trigger', () => {
      it('edits table trigger using XanoScript file', async function () {
        if (!createdResources.tableTriggerId) {
          this.skip()
          return
        }

        // Table trigger edit requires XanoScript file
        const triggerName = `test_table_trigger${testSuffix}`
        const tableName = `trigger_test_table${testSuffix}`
        const xsContent = `table_trigger ${triggerName} {
  table = "${tableName}"
  input {
    json new
    json old
    enum action { values = ["insert", "update", "delete", "truncate"] }
    text datasource
  }
  stack {
    var $updated { value = "Updated by test" }
  }
  actions = {insert: true, update: true}
}`
        const tmpFile = path.join(os.tmpdir(), `test-table-trigger-edit-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout} = await runTrackedCommand(
            `table trigger edit ${createdResources.tableTriggerId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile}`,
          )
          expect(stdout).to.include('updated successfully')
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('Table Trigger Security', () => {
      it('clears table trigger security', async function () {
        if (!createdResources.tableTriggerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table trigger security ${createdResources.tableTriggerId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })
    })

    describe('Delete Table Trigger', () => {
      it('deletes the test table trigger', async function () {
        if (!createdResources.tableTriggerId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table trigger delete ${createdResources.tableTriggerId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted table trigger ID: ${createdResources.tableTriggerId}`)
      })
    })

    describe('Cleanup Test Table', () => {
      it('deletes the test table', async function () {
        if (!createdResources.tableTriggerTableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table delete ${createdResources.tableTriggerTableId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted test table ID: ${createdResources.tableTriggerTableId}`)
      })
    })
  })
})
