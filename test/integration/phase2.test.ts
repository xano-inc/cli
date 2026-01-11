/**
 * Phase 2 Integration Tests - Core Development Resources
 *
 * Tests for:
 * - Middleware (list, get, create, edit, delete, security)
 * - Task (list, get, create, edit, delete, security)
 * - Addon (list, get, create, edit, delete, security)
 * - Datasource (list, create, edit, delete)
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
  middlewareId: null as string | null,
  taskId: null as string | null,
  addonId: null as string | null,
  datasourceLabel: null as string | null,
}

const testSuffix = `_phase2_${Date.now()}`

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

  let report = `# Phase 2 Integration Test Report

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
  const reportPath = path.join(process.cwd(), 'test-report-phase2.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\nPhase 2 test report written to: ${reportPath}`)
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

describe('Phase 2 Integration Tests', function () {
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
  // MIDDLEWARE TESTS
  // ============================================
  describe('Middleware Commands', () => {
    describe('Create Middleware', () => {
      it('creates a middleware from XanoScript', async () => {
        const mwName = `test_mw${testSuffix}`
        const xsContent = `middleware ${mwName} {
  input {
    int score
  }
  stack {
    var $x1 {
      value = $input.score + 1
    }
  }
  response = $x1
}`
        const tmpFile = path.join(os.tmpdir(), `test-mw-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `middleware create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')
          expect(result.name).to.equal(mwName)

          createdResources.middlewareId = String(result.id)
          console.log(`      Created middleware ID: ${createdResources.middlewareId}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('List Middleware', () => {
      it('lists middleware in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `middleware list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists middleware in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `middleware list -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Get Middleware', () => {
      it('gets middleware details in JSON format', async function () {
        if (!createdResources.middlewareId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `middleware get ${createdResources.middlewareId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.middlewareId)
      })

      it('gets middleware in summary format', async function () {
        if (!createdResources.middlewareId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `middleware get ${createdResources.middlewareId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Middleware:')
        expect(stdout).to.include(`ID: ${createdResources.middlewareId}`)
      })
    })

    describe('Edit Middleware', () => {
      it('edits middleware description', async function () {
        if (!createdResources.middlewareId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `middleware edit ${createdResources.middlewareId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "Updated by test"`,
        )
        expect(stdout).to.include('updated successfully')
      })
    })

    describe('Middleware Security', () => {
      it('clears middleware security', async function () {
        if (!createdResources.middlewareId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `middleware security ${createdResources.middlewareId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })
    })

    describe('Delete Middleware', () => {
      it('deletes the test middleware', async function () {
        if (!createdResources.middlewareId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `middleware delete ${createdResources.middlewareId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted middleware ID: ${createdResources.middlewareId}`)
      })
    })
  })

  // ============================================
  // TASK TESTS
  // ============================================
  describe('Task Commands', () => {
    describe('Create Task', () => {
      it('creates a task from XanoScript', async () => {
        const taskName = `test_task${testSuffix}`
        const xsContent = `task ${taskName} {
  stack {
    var $x1 {
      value = 1
    }
  }
  schedule = [{starts_on: 2030-01-01 00:00:00+0000, freq: 900}]
}`
        const tmpFile = path.join(os.tmpdir(), `test-task-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `task create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')
          expect(result.name).to.equal(taskName)

          createdResources.taskId = String(result.id)
          console.log(`      Created task ID: ${createdResources.taskId}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('List Tasks', () => {
      it('lists tasks in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `task list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists tasks in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `task list -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Get Task', () => {
      it('gets task details in JSON format', async function () {
        if (!createdResources.taskId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `task get ${createdResources.taskId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.taskId)
      })

      it('gets task in summary format', async function () {
        if (!createdResources.taskId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `task get ${createdResources.taskId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Task:')
        expect(stdout).to.include(`ID: ${createdResources.taskId}`)
      })
    })

    describe('Edit Task', () => {
      it('edits task description', async function () {
        if (!createdResources.taskId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `task edit ${createdResources.taskId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "Updated by test"`,
        )
        expect(stdout).to.include('updated successfully')
      })
    })

    describe('Task Security', () => {
      it('clears task security', async function () {
        if (!createdResources.taskId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `task security ${createdResources.taskId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })
    })

    describe('Delete Task', () => {
      it('deletes the test task', async function () {
        if (!createdResources.taskId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `task delete ${createdResources.taskId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted task ID: ${createdResources.taskId}`)
      })
    })
  })

  // ============================================
  // ADDON TESTS
  // Note: Addon creation requires db.query with specific table setup,
  // which is complex to test. We focus on list/get operations.
  // ============================================
  describe('Addon Commands', () => {

    describe('List Addons', () => {
      it('lists addons in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `addon list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists addons in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `addon list -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Get Addon', () => {
      it('gets addon details in JSON format', async function () {
        if (!createdResources.addonId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `addon get ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.addonId)
      })

      it('gets addon in summary format', async function () {
        if (!createdResources.addonId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `addon get ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Addon:')
        expect(stdout).to.include(`ID: ${createdResources.addonId}`)
      })
    })

    describe('Edit Addon', () => {
      it('edits addon with XanoScript', async function () {
        if (!createdResources.addonId) {
          this.skip()
          return
        }

        const addonName = `test_addon${testSuffix}`
        const xsContent = `addon ${addonName} {
  description = "Updated by test"
  input {
    int score
  }
  stack {
    var $x1 {
      value = $input.score + 2
    }
  }
  response = $x1
}`
        const tmpFile = path.join(os.tmpdir(), `test-addon-edit-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout} = await runTrackedCommand(
            `addon edit ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile}`,
          )
          expect(stdout).to.include('updated successfully')
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('Addon Security', () => {
      it('clears addon security', async function () {
        if (!createdResources.addonId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `addon security ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })
    })

    describe('Delete Addon', () => {
      it('deletes the test addon', async function () {
        if (!createdResources.addonId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `addon delete ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted addon ID: ${createdResources.addonId}`)
      })
    })
  })

  // ============================================
  // DATASOURCE TESTS
  // ============================================
  describe('Datasource Commands', () => {
    describe('Create Datasource', () => {
      it('creates a datasource', async () => {
        const dsLabel = `test_ds${testSuffix}`

        const {stdout, stderr} = await runTrackedCommand(
          `datasource create -p ${PROFILE} -w ${WORKSPACE_ID} --label ${dsLabel} --color "#e74c3c" -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {label: string}

        expect(result).to.have.property('label')
        expect(result.label).to.equal(dsLabel)

        createdResources.datasourceLabel = dsLabel
        console.log(`      Created datasource label: ${createdResources.datasourceLabel}`)
      })
    })

    describe('List Datasources', () => {
      it('lists datasources in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `datasource list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists datasources in summary format', async () => {
        const {stdout} = await runTrackedCommand(
          `datasource list -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.be.a('string')
      })
    })

    describe('Edit Datasource', () => {
      it('edits datasource color', async function () {
        if (!createdResources.datasourceLabel) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `datasource edit ${createdResources.datasourceLabel} -p ${PROFILE} -w ${WORKSPACE_ID} --color "#3498db"`,
        )
        expect(stdout).to.include('updated successfully')
      })
    })

    describe('Delete Datasource', () => {
      it('deletes the test datasource', async function () {
        if (!createdResources.datasourceLabel) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `datasource delete ${createdResources.datasourceLabel} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted datasource label: ${createdResources.datasourceLabel}`)
      })
    })
  })
})
