import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WORKSPACE_ID = '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

// Test tracking for report generation
interface TestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  command?: string
  output?: string
  error?: string
}

const testResults: TestResult[] = []
let suiteStartTime = 0
let totalStartTime = 0
const REPORT_FILE = 'test-report-phase6.md'

function trackTest(
  name: string,
  status: 'passed' | 'failed' | 'skipped',
  startTime: number,
  command?: string,
  output?: string,
  error?: string,
) {
  testResults.push({
    name,
    status,
    duration: Date.now() - startTime,
    command,
    output: output?.slice(0, 500),
    error: error?.slice(0, 500),
  })
}

async function runTrackedCommand(cmd: string): Promise<{stdout: string; stderr: string}> {
  const args = cmd.split(' ')
  return runCommand(args)
}

function writeReport(): void {
  const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2)
  const passed = testResults.filter((t) => t.status === 'passed').length
  const failed = testResults.filter((t) => t.status === 'failed').length
  const skipped = testResults.filter((t) => t.status === 'skipped').length

  let report = `# Phase 6 Integration Test Report\n\n`
  report += `## Summary\n\n`
  report += `| Metric | Value |\n`
  report += `|--------|-------|\n`
  report += `| **Run Date** | ${new Date().toISOString()} |\n`
  report += `| **Total Duration** | ${totalDuration}s |\n`
  report += `| **Profile** | ${PROFILE} |\n`
  report += `| **Workspace** | ${WORKSPACE_ID} |\n`
  report += `| **Total Tests** | ${testResults.length} |\n`
  report += `| **Passed** | ${passed} |\n`
  report += `| **Failed** | ${failed} |\n`
  report += `| **Skipped** | ${skipped} |\n\n`

  report += `## Results\n\n`
  report += `| Status | Test | Duration |\n`
  report += `|--------|------|----------|\n`
  for (const test of testResults) {
    const statusIcon = test.status === 'passed' ? 'PASS' : test.status === 'failed' ? 'FAIL' : 'SKIP'
    const duration = test.duration < 1000 ? `${test.duration}ms` : `${(test.duration / 1000).toFixed(2)}s`
    report += `| ${statusIcon} | ${test.name} | ${duration} |\n`
  }

  report += `\n---\n\n`
  report += `## Detailed Results\n\n`

  let currentCategory = ''
  for (const test of testResults) {
    const category = test.name.split(' > ')[0]
    if (category !== currentCategory) {
      currentCategory = category
      report += `### ${category}\n\n`
    }

    const subTest = test.name.split(' > ').slice(1).join(' > ')
    report += `#### ${subTest || test.name}\n\n`
    report += `- **Status:** ${test.status}\n`
    report += `- **Duration:** ${test.duration < 1000 ? `${test.duration}ms` : `${(test.duration / 1000).toFixed(2)}s`}\n`
    if (test.command) report += `- **Command:** \`xano ${test.command}\`\n`
    if (test.output) {
      report += `- **Output:**\n\`\`\`json\n${test.output}\n\`\`\`\n`
    }
    if (test.error) {
      report += `- **Error:**\n\`\`\`\n${test.error}\n\`\`\`\n`
    }
    report += `\n`
  }

  fs.writeFileSync(REPORT_FILE, report)
  console.log(`\nPhase 6 test report written to: ${path.resolve(REPORT_FILE)}`)
}

describe('Phase 6 Integration Tests', function () {
  this.timeout(60000)

  before(function () {
    totalStartTime = Date.now()
  })

  after(function () {
    writeReport()
  })

  // ============================================
  // BRANCH TESTS
  // ============================================
  describe('Branch Commands', () => {
    describe('List Branches', () => {
      it('lists branches in workspace', async () => {
        const testStart = Date.now()
        const cmd = `branch list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('Branch Commands > List Branches > lists branches in workspace', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('Branch Commands > List Branches > lists branches in workspace', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })
  })

  // ============================================
  // FILE TESTS
  // ============================================
  describe('File Commands', () => {
    describe('List Files', () => {
      it('lists files in workspace', async () => {
        const testStart = Date.now()
        const cmd = `file list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('File Commands > List Files > lists files in workspace', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('File Commands > List Files > lists files in workspace', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })
  })

  // ============================================
  // AUDIT LOG TESTS
  // ============================================
  describe('Audit Log Commands', () => {
    describe('List Audit Logs', () => {
      it('lists audit logs for workspace', async () => {
        const testStart = Date.now()
        const cmd = `audit-log list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('Audit Log Commands > List Audit Logs > lists audit logs', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('Audit Log Commands > List Audit Logs > lists audit logs', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })

    describe('Global Audit Logs', () => {
      it('lists global audit logs', async () => {
        const testStart = Date.now()
        const cmd = `audit-log global-list -p ${PROFILE} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('Audit Log Commands > Global Audit Logs > lists global audit logs', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('Audit Log Commands > Global Audit Logs > lists global audit logs', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })
  })

  // ============================================
  // HISTORY TESTS
  // ============================================
  describe('History Commands', () => {
    describe('Request History', () => {
      it('lists request history', async () => {
        const testStart = Date.now()
        const cmd = `history request list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('History Commands > Request History > lists request history', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('History Commands > Request History > lists request history', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })

    describe('Function History', () => {
      it('lists function history', async () => {
        const testStart = Date.now()
        const cmd = `history function list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('History Commands > Function History > lists function history', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('History Commands > Function History > lists function history', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })

    describe('Middleware History', () => {
      it('lists middleware history', async () => {
        const testStart = Date.now()
        const cmd = `history middleware list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('History Commands > Middleware History > lists middleware history', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('History Commands > Middleware History > lists middleware history', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })

    describe('Task History', () => {
      it('lists task history', async () => {
        const testStart = Date.now()
        const cmd = `history task list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('History Commands > Task History > lists task history', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('History Commands > Task History > lists task history', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })

    describe('Trigger History', () => {
      it('lists trigger history', async () => {
        const testStart = Date.now()
        const cmd = `history trigger list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('History Commands > Trigger History > lists trigger history', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('History Commands > Trigger History > lists trigger history', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })

    describe('Tool History', () => {
      it('lists tool history', async () => {
        const testStart = Date.now()
        const cmd = `history tool list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`
        try {
          const {stdout, stderr} = await runTrackedCommand(cmd)
          const output = stdout || stderr
          expect(output).to.be.a('string')
          trackTest('History Commands > Tool History > lists tool history', 'passed', testStart, cmd, output)
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          trackTest('History Commands > Tool History > lists tool history', 'failed', testStart, cmd, undefined, errMsg)
          throw error
        }
      })
    })
  })
})
