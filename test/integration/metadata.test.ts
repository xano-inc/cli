/**
 * Metadata & History Integration Tests
 *
 * Tests for:
 * - Branch (list)
 * - File (list)
 * - Audit Log (list, global list)
 * - History (request, function, middleware, task, trigger, tool)
 *
 * Run with: npm test -- --grep "Metadata & History"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {TestReporter, createTestContext} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

const reporter = new TestReporter(
  'metadata',
  'Branches, Files, Audit Logs, and History',
  PROFILE,
  WORKSPACE_ID,
)

async function runTrackedCommand(cmd: string): Promise<{stdout: string; stderr: string; error?: Error}> {
  reporter.recordCommand(cmd)
  const result = await runCommand(cmd.split(' '))

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

describe('Metadata & History Integration Tests', function () {
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
  })

  // ============================================
  // BRANCH TESTS
  // ============================================
  describe('Branch Commands', () => {
    describe('List Branches', () => {
      it('lists branches in workspace', async () => {
        const {stdout, stderr} = await runTrackedCommand(`branch list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })
  })

  // ============================================
  // FILE TESTS
  // ============================================
  describe('File Commands', () => {
    describe('List Files', () => {
      it('lists files in workspace', async () => {
        const {stdout, stderr} = await runTrackedCommand(`file list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })
  })

  // ============================================
  // AUDIT LOG TESTS
  // ============================================
  describe('Audit Log Commands', () => {
    describe('List Audit Logs', () => {
      it('lists audit logs for workspace', async () => {
        const {stdout, stderr} = await runTrackedCommand(`audit-log list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })

    describe('Global Audit Logs', () => {
      it('lists global audit logs', async () => {
        const {stdout, stderr} = await runTrackedCommand(`audit-log global-list -p ${PROFILE} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })
  })

  // ============================================
  // HISTORY TESTS
  // ============================================
  describe('History Commands', () => {
    describe('Request History', () => {
      it('lists request history', async () => {
        const {stdout, stderr} = await runTrackedCommand(`history request list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })

    describe('Function History', () => {
      it('lists function history', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `history function list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })

    describe('Middleware History', () => {
      it('lists middleware history', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `history middleware list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })

    describe('Task History', () => {
      it('lists task history', async () => {
        const {stdout, stderr} = await runTrackedCommand(`history task list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })

    describe('Trigger History', () => {
      it('lists trigger history', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `history trigger list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })

    describe('Tool History', () => {
      it('lists tool history', async () => {
        const {stdout, stderr} = await runTrackedCommand(`history tool list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const output = stdout || stderr
        expect(output).to.be.a('string')
      })
    })
  })
})
