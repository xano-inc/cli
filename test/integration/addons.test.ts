/**
 * Addon Integration Tests
 *
 * Tests for:
 * - Addon (create, list, get, edit, delete, security)
 *
 * IMPORTANT: Addons always extend a specific existing table.
 * This test suite automatically creates the required table dependency,
 * tests the full addon lifecycle, then cleans up all resources.
 *
 * Run with: npm test -- --grep "Addon"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {TestReporter, createTestContext, parseJsonOutput} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

const reporter = new TestReporter('addons', 'Addon CRUD with Table Dependencies', PROFILE, WORKSPACE_ID)

const createdResources = {
  addonId: null as string | null,
  tableId: null as string | null,
  tableName: null as string | null,
}

const testSuffix = `_addon_${Date.now()}`

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

/**
 * Creates a test table that the addon will extend.
 */
async function createTestTable(): Promise<{id: string; name: string} | null> {
  const tableName = `addon_test_tbl${testSuffix}`

  const xsContent = `table "${tableName}" {
  auth = false
  schema {
    int id {
      description = "Unique identifier"
    }
    text name? {
      description = "Record name"
    }
    int value? {
      description = "Numeric value"
    }
    text status?="active" {
      description = "Record status"
    }
    timestamp created_at?=now {
      description = "Creation timestamp"
    }
  }
  index = [
    {type: "primary", field: [{name: "id"}]}
  ]
}`

  const tmpFile = path.join(os.tmpdir(), `test-table-${Date.now()}.xs`)
  fs.writeFileSync(tmpFile, xsContent, 'utf8')

  try {
    const result = await runCommand(`table create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`)

    if (result.error) {
      console.log(`      Warning: Failed to create test table: ${result.error.message}`)
      return null
    }

    const table = parseJsonOutput(result.stdout) as {id: number; name: string}
    console.log(`      Created test table: ${table.name} (ID: ${table.id})`)
    return {id: String(table.id), name: table.name}
  } catch (error) {
    console.log(`      Warning: Failed to create test table: ${error}`)
    return null
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

/**
 * Deletes a test table by ID
 */
async function deleteTestTable(tableId: string): Promise<boolean> {
  try {
    const result = await runCommand(`table delete ${tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`)

    if (result.error) {
      console.log(`      Warning: Failed to delete test table: ${result.error.message}`)
      return false
    }

    console.log(`      Deleted test table ID: ${tableId}`)
    return true
  } catch (error) {
    console.log(`      Warning: Failed to delete test table: ${error}`)
    return false
  }
}

/**
 * Generates XanoScript for an addon that extends a table.
 */
function generateAddonXS(addonName: string, tableName: string): string {
  return `addon ${addonName} {
  input {
    int record_id? {
      table = "${tableName}"
    }
  }
  stack {
    db.query ${tableName} {
      where = $db.${tableName}.id == $input.record_id
      return = {type: "single"}
    }
  }
}`
}

/**
 * Generates updated XanoScript for editing an addon
 */
function generateUpdatedAddonXS(addonName: string, tableName: string): string {
  return `addon ${addonName} {
  input {
    int record_id? {
      table = "${tableName}"
    }
  }
  stack {
    db.query ${tableName} {
      where = $db.${tableName}.id == $input.record_id
      return = {type: "count"}
    }
  }
}`
}

describe('Addon Integration Tests', function () {
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
  // SETUP TABLE DEPENDENCY
  // ============================================
  describe('Setup Table Dependency', () => {
    describe('Create Test Table', () => {
      it('creates a table for the addon to extend', async () => {
        const table = await createTestTable()

        if (table) {
          createdResources.tableId = table.id
          createdResources.tableName = table.name
          expect(table.id).to.be.a('string')
          expect(table.name).to.include('addon_test_tbl')
          console.log(`      Table dependency created: ${table.name}`)
        } else {
          throw new Error('Failed to create table dependency - addon tests cannot proceed')
        }
      })
    })
  })

  // ============================================
  // ADDON CREATE
  // ============================================
  describe('Create Addon', () => {
    it('creates an addon that extends the test table', async function () {
      if (!createdResources.tableName) {
        this.skip()
        return
      }

      const addonName = `test_addon${testSuffix}`
      const xsContent = generateAddonXS(addonName, createdResources.tableName)
      const tmpFile = path.join(os.tmpdir(), `test-addon-${Date.now()}.xs`)
      fs.writeFileSync(tmpFile, xsContent, 'utf8')

      try {
        const {stdout, stderr} = await runTrackedCommand(
          `addon create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

        expect(result).to.have.property('id')
        expect(result.name).to.equal(addonName)

        createdResources.addonId = String(result.id)
        console.log(`      Created addon ID: ${createdResources.addonId} (extends table: ${createdResources.tableName})`)
      } finally {
        fs.unlinkSync(tmpFile)
      }
    })
  })

  // ============================================
  // ADDON LIST & GET
  // ============================================
  describe('List and Get Addon', () => {
    describe('List Addons', () => {
      it('lists addons in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(`addon list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists addons in summary format', async () => {
        const {stdout} = await runTrackedCommand(`addon list -p ${PROFILE} -w ${WORKSPACE_ID}`)
        expect(stdout).to.be.a('string')
      })

      it('lists addons with search filter', async function () {
        if (!createdResources.addonId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `addon list -p ${PROFILE} -w ${WORKSPACE_ID} --search test_addon -o json`,
        )
        const result = parseJsonOutput(stdout, stderr) as Array<{name: string}>
        expect(result).to.be.an('array')
        const found = result.some((a) => a.name.includes('test_addon'))
        expect(found).to.be.true
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
        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string; guid: string}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(createdResources.addonId)
        expect(result).to.have.property('guid')
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
  })

  // ============================================
  // ADDON EDIT
  // ============================================
  describe('Edit Addon', () => {
    it('edits addon with updated XanoScript', async function () {
      if (!createdResources.addonId || !createdResources.tableName) {
        this.skip()
        return
      }

      const addonName = `test_addon${testSuffix}`
      const xsContent = generateUpdatedAddonXS(addonName, createdResources.tableName)
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

    it('verifies addon was updated', async function () {
      if (!createdResources.addonId) {
        this.skip()
        return
      }

      const {stdout, stderr} = await runTrackedCommand(
        `addon get ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
      )
      const result = parseJsonOutput(stdout, stderr) as {id: number; updated_at: string}
      expect(result).to.have.property('id')
      expect(result).to.have.property('updated_at')
    })
  })

  // ============================================
  // ADDON SECURITY
  // ============================================
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

  // ============================================
  // ERROR HANDLING
  // ============================================
  describe('Error Handling', () => {
    it('handles get with non-existent addon ID', async () => {
      const {error} = await runTrackedCommand(`addon get 999999999 -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
      expect(error).to.exist
    })

    it('handles create with invalid XanoScript', async () => {
      const tmpFile = path.join(os.tmpdir(), `test-addon-invalid-${Date.now()}.xs`)
      fs.writeFileSync(tmpFile, 'invalid xanoscript content {{{', 'utf8')

      try {
        const {error} = await runTrackedCommand(`addon create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`)
        expect(error).to.exist
      } finally {
        fs.unlinkSync(tmpFile)
      }
    })

    it('handles create with missing file', async () => {
      const {error} = await runTrackedCommand(
        `addon create -p ${PROFILE} -w ${WORKSPACE_ID} -f /nonexistent/path.xs -o json`,
      )
      expect(error).to.exist
    })
  })

  // ============================================
  // CLEANUP (Addon first, then Table)
  // ============================================
  describe('Cleanup', () => {
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

    describe('Delete Table Dependency', () => {
      it('deletes the test table after addon is removed', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const deleted = await deleteTestTable(createdResources.tableId)
        expect(deleted).to.be.true
      })
    })
  })

  // ============================================
  // VERIFICATION
  // ============================================
  describe('Verification', () => {
    it('verifies addon was deleted', async function () {
      if (!createdResources.addonId) {
        this.skip()
        return
      }

      const {error} = await runTrackedCommand(
        `addon get ${createdResources.addonId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
      )
      expect(error).to.exist
    })
  })
})
