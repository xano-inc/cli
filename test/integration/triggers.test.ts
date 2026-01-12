/**
 * Triggers Integration Tests
 *
 * Tests for:
 * - Workspace Triggers (create, list, get, edit, delete, security)
 * - Table Triggers (create, list, get, edit, delete, security)
 *
 * Run with: npm test -- --grep "Triggers"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {TestReporter, createTestContext, parseJsonOutput} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

const reporter = new TestReporter('triggers', 'Workspace and Table Triggers', PROFILE, WORKSPACE_ID)

const createdResources = {
  triggerId: null as string | null,
  tableTriggerTableId: null as string | null,
  tableTriggerId: null as string | null,
}

const testSuffix = `_trig_${Date.now()}`

async function runTrackedCommand(
  command: string,
  input?: Record<string, unknown>,
): Promise<{stdout: string; stderr?: string; error?: Error}> {
  reporter.recordCommand(command, input)
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

describe('Triggers Integration Tests', function () {
  this.timeout(30000)

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
  // WORKSPACE TRIGGER TESTS
  // ============================================
  describe('Workspace Trigger Commands', () => {
    describe('Create Trigger', () => {
      it('creates a workspace trigger from XanoScript', async () => {
        const triggerName = `test_trigger${testSuffix}`
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
        const {stdout} = await runTrackedCommand(`trigger list -p ${PROFILE} -w ${WORKSPACE_ID}`)
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
        const {stdout} = await runTrackedCommand(`table trigger list -p ${PROFILE} -w ${WORKSPACE_ID}`)
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
