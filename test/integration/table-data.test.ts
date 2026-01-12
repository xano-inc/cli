/**
 * Table Data Operations Integration Tests
 *
 * Tests for:
 * - Table Content (CRUD, bulk operations)
 * - Table Schema (get, column operations)
 * - Table Index (list)
 *
 * Run with: npm test -- --grep "Table Data"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {TestReporter, createTestContext, parseJsonOutput} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

const reporter = new TestReporter('table-data', 'Table Content, Schema, and Index Operations', PROFILE, WORKSPACE_ID)

const createdResources = {
  tableId: null as string | null,
  recordId: null as string | null,
  bulkRecordIds: [] as number[],
}

const testSuffix = `_tbldata_${Date.now()}`

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

describe('Table Data Operations Integration Tests', function () {
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
  // SETUP
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

        const {stdout, stderr} = await runTrackedCommand(
          `table content bulk-create ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --data [{"id":100},{"id":101}] -o json`,
        )
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
  // CLEANUP
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
