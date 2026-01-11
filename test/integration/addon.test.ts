/**
 * Addon Integration Tests with Auto-Generated Dependencies
 *
 * IMPORTANT: Addons always extend a specific existing table.
 * They must be created independently, then can be referenced by functions/APIs.
 *
 * Dependency Chain:
 * 1. Table must exist first
 * 2. Addon is created to extend that table
 * 3. Functions/APIs can then use the addon
 *
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

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

// Store created resource IDs for cleanup
const createdResources = {
  // The addon being tested
  addonId: null as string | null,
  // Required table dependency
  tableId: null as string | null,
  tableName: null as string | null,
}

const testSuffix = `_addon_test_${Date.now()}`

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

  let report = `# Addon Integration Test Report

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

## Test Approach

Addons always extend a specific existing table. This test suite:

1. **Creates a test table** (required dependency)
2. **Creates an addon** that extends the table
3. **Tests full lifecycle** - list, get, edit, security, delete
4. **Cleans up** - deletes addon first, then table

## Dependency Chain

\`\`\`
Table (created first)
  └── Addon (extends the table)
        └── Can be used by Functions/APIs
\`\`\`

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

  // Add created resources section
  report += `## Created Resources\n\n`
  report += `| Resource Type | ID | Name |\n`
  report += `|---------------|----|----- |\n`
  if (createdResources.tableId) {
    report += `| Table (dependency) | ${createdResources.tableId} | ${createdResources.tableName} |\n`
  }
  if (createdResources.addonId) {
    report += `| Addon | ${createdResources.addonId} | test_addon${testSuffix} |\n`
  }

  return report
}

function writeReport(): void {
  const report = generateMarkdownReport()
  const reportPath = path.join(process.cwd(), 'test-report-addon.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\nAddon test report written to: ${reportPath}`)
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

// ============================================
// HELPER FUNCTIONS FOR DEPENDENCY MANAGEMENT
// ============================================

/**
 * Creates a test table that the addon will extend.
 * Returns the table ID and name.
 */
async function createTestTable(): Promise<{id: string; name: string} | null> {
  const tableName = `addon_test_tbl${testSuffix}`

  // XanoScript for creating a table that the addon will extend
  // Table syntax requires schema block containing columns
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
    const result = await runCommand(
      `table create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
    )

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
    const result = await runCommand(
      `table delete ${tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
    )

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
 *
 * ADDON RULES:
 * - Must have exactly ONE db.query statement (no other operations allowed)
 * - Input can reference table with `table = "table_name"` attribute
 * - No response block
 * - Used to fetch related data efficiently
 */
function generateAddonXS(addonName: string, tableName: string, description = 'Test addon'): string {
  // Note: description is stored separately, not in XanoScript body
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
 * Uses a count return type to test different query patterns
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

// ============================================
// TEST SUITE
// ============================================

describe('Addon Integration Tests', function () {
  this.timeout(60000) // Extended timeout for dependency creation

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
  // PHASE 1: CREATE TABLE DEPENDENCY
  // ============================================
  describe('Phase 1: Setup Table Dependency', () => {
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
  // PHASE 2: ADDON CREATE
  // ============================================
  describe('Phase 2: Create Addon', () => {
    describe('Create Addon', () => {
      it('creates an addon that extends the test table', async function () {
        if (!createdResources.tableName) {
          this.skip()
          return
        }

        const addonName = `test_addon${testSuffix}`
        const xsContent = generateAddonXS(addonName, createdResources.tableName, 'Test addon for CLI integration testing')
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
  })

  // ============================================
  // PHASE 3: ADDON LIST & GET
  // ============================================
  describe('Phase 3: List and Get Addon', () => {
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
        // Should find our created addon
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
        expect(result).to.have.property('guid') // Addons have a unique GUID
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
  // PHASE 4: ADDON EDIT
  // ============================================
  describe('Phase 4: Edit Addon', () => {
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
        expect(result).to.have.property('updated_at') // Verify the addon has an updated timestamp
      })
    })
  })

  // ============================================
  // PHASE 5: ADDON SECURITY
  // ============================================
  describe('Phase 5: Addon Security', () => {
    describe('Security Operations', () => {
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
  })

  // ============================================
  // PHASE 6: ERROR HANDLING
  // ============================================
  describe('Phase 6: Error Handling', () => {
    describe('Invalid Operations', () => {
      it('handles get with non-existent addon ID', async () => {
        const {error} = await runTrackedCommand(
          `addon get 999999999 -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        expect(error).to.exist
      })

      it('handles create with invalid XanoScript', async () => {
        const tmpFile = path.join(os.tmpdir(), `test-addon-invalid-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, 'invalid xanoscript content {{{', 'utf8')

        try {
          const {error} = await runTrackedCommand(
            `addon create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
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
  })

  // ============================================
  // PHASE 7: CLEANUP (Addon first, then Table)
  // ============================================
  describe('Phase 7: Cleanup', () => {
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
  // PHASE 8: VERIFICATION
  // ============================================
  describe('Phase 8: Verification', () => {
    describe('Verify Cleanup', () => {
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
})
