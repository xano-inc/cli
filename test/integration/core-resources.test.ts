/**
 * Core Resources Integration Tests
 *
 * Tests for fundamental Xano resources:
 * - Tables (create, list, get, edit, delete)
 * - API Groups (create, list, get, edit, delete)
 * - API Endpoints (create, list, get, edit, delete)
 *
 * Run with: npm test -- --grep "Core Resources"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {TestReporter, createTestContext, parseJsonOutput} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

// Initialize test reporter
const reporter = new TestReporter(
  'core-resources',
  'Tables, API Groups, and API Endpoints',
  PROFILE,
  WORKSPACE_ID,
)

// Store created resource IDs for cleanup
const createdResources = {
  tableId: null as string | null,
  tableId2: null as string | null,
  apiGroupId: null as string | null,
  apiId: null as string | null,
  apiId2: null as string | null,
}

// Unique suffix to avoid conflicts with existing resources
const testSuffix = `_test_${Date.now()}`

// Helper to run command and track results
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

describe('Core Resources Integration Tests', function () {
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
  // CREATE RESOURCES
  // ============================================
  describe('Create Resources', () => {
    describe('Tables', () => {
      it('creates a table with name and description', async () => {
        const tableName = `integration_table${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `table create -p ${PROFILE} -w ${WORKSPACE_ID} --name ${tableName} --description "Integration test table" -o json`,
          {name: tableName, description: 'Integration test table'},
        )

        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string; description: string}
        expect(result).to.have.property('id')
        expect(result).to.have.property('created_at')
        expect(result).to.have.property('updated_at')
        expect(result.name).to.equal(tableName)
        expect(result.description).to.equal('Integration test table')

        createdResources.tableId = String(result.id)
        console.log(`      Created table ID: ${createdResources.tableId}`)
      })

      it('creates a table from XanoScript file', async () => {
        const tableName = `xs_table${testSuffix}`
        const xsContent = `table ${tableName} {
  description = "Created from XanoScript"
  schema {
    int id
    text name
    text email
  }
  index = [
    {type: "primary", field: [{name: "id"}]}
  ]
}`
        const tmpFile = path.join(os.tmpdir(), `test-table-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `table create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
            {file: tmpFile, xanoscript: xsContent},
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')
          expect(result.name).to.equal(tableName)

          createdResources.tableId2 = String(result.id)
          console.log(`      Created XanoScript table ID: ${createdResources.tableId2}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })

      it('shows error when creating table without required fields', async () => {
        const {error} = await runTrackedCommand(`table create -p ${PROFILE} -w ${WORKSPACE_ID}`)
        expect(error?.message).to.include('Either --name or --file must be provided')
      })
    })

    describe('API Groups', () => {
      it('creates an API group with swagger enabled', async () => {
        const groupName = `integration_group${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `apigroup create -p ${PROFILE} -w ${WORKSPACE_ID} --name ${groupName} --description "Integration test API group" --swagger -o json`,
        )

        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string; swagger: boolean; canonical: string}
        expect(result).to.have.property('id')
        expect(result).to.have.property('canonical')
        expect(result.name).to.equal(groupName)
        expect(result.swagger).to.equal(true)

        createdResources.apiGroupId = String(result.id)
        console.log(`      Created API group ID: ${createdResources.apiGroupId}`)
      })

      it('shows error when creating API group without required fields', async () => {
        const {error} = await runTrackedCommand(`apigroup create -p ${PROFILE} -w ${WORKSPACE_ID}`)
        expect(error?.message).to.include('Either --name or --file must be provided')
      })
    })

    describe('API Endpoints', () => {
      it('creates a GET API endpoint', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const apiName = `get_endpoint${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `api create ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --name ${apiName} --verb GET --description "GET endpoint test" -o json`,
        )

        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string; verb: string}
        expect(result).to.have.property('id')
        expect(result.name).to.equal(apiName)
        expect(result.verb).to.equal('GET')

        createdResources.apiId = String(result.id)
        console.log(`      Created GET API ID: ${createdResources.apiId}`)
      })

      it('creates a POST API endpoint', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const apiName = `post_endpoint${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `api create ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --name ${apiName} --verb POST --description "POST endpoint test" -o json`,
        )

        const result = parseJsonOutput(stdout, stderr) as {id: number; name: string; verb: string}
        expect(result).to.have.property('id')
        expect(result.name).to.equal(apiName)
        expect(result.verb).to.equal('POST')

        createdResources.apiId2 = String(result.id)
        console.log(`      Created POST API ID: ${createdResources.apiId2}`)
      })

      it('shows error when creating API without verb', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const {error} = await runTrackedCommand(
          `api create ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --name test_api`,
        )
        expect(error?.message).to.include('Either --name and --verb, --file, or --stdin must be provided')
      })
    })
  })

  // ============================================
  // LIST RESOURCES
  // ============================================
  describe('List Resources', () => {
    describe('Tables', () => {
      it('lists tables in JSON format and finds created tables', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(`table list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const tables = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string}>

        expect(tables).to.be.an('array')
        expect(tables.length).to.be.greaterThan(0)

        const found = tables.find((t) => String(t.id) === createdResources.tableId)
        expect(found).to.exist
        expect(found?.name).to.include('integration_table')
      })

      it('lists tables in summary format', async () => {
        const {stdout} = await runTrackedCommand(`table list -p ${PROFILE} -w ${WORKSPACE_ID}`)
        expect(stdout).to.include('Available tables:')
        expect(stdout).to.include('(ID:')
      })

      it('lists tables with search filter', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table list -p ${PROFILE} -w ${WORKSPACE_ID} --search integration -o json`,
        )
        const tables = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string}>

        expect(tables).to.be.an('array')
        const found = tables.find((t) => String(t.id) === createdResources.tableId)
        expect(found).to.exist
      })

      it('lists tables with pagination', async () => {
        const {stdout, stderr} = await runTrackedCommand(
          `table list -p ${PROFILE} -w ${WORKSPACE_ID} --page 1 --per_page 5 -o json`,
        )
        const tables = parseJsonOutput(stdout, stderr) as Array<{id: number}>

        expect(tables).to.be.an('array')
        expect(tables.length).to.be.at.most(5)
      })
    })

    describe('API Groups', () => {
      it('lists API groups in JSON format', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(`apigroup list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const groups = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string; canonical: string}>

        expect(groups).to.be.an('array')
        const found = groups.find((g) => String(g.id) === createdResources.apiGroupId)
        expect(found).to.exist
        expect(found?.canonical).to.exist
      })

      it('lists API groups in summary format', async () => {
        const {stdout} = await runTrackedCommand(`apigroup list -p ${PROFILE} -w ${WORKSPACE_ID}`)
        expect(stdout).to.include('Available API groups:')
        expect(stdout).to.include('canonical:')
      })
    })

    describe('API Endpoints', () => {
      it('lists APIs in JSON format', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `api list ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const apis = parseJsonOutput(stdout, stderr) as Array<{id: number; name: string; verb: string}>

        expect(apis).to.be.an('array')
        expect(apis.length).to.be.greaterThanOrEqual(2)

        const getApi = apis.find((a) => String(a.id) === createdResources.apiId)
        const postApi = apis.find((a) => String(a.id) === createdResources.apiId2)
        expect(getApi).to.exist
        expect(postApi).to.exist
      })

      it('lists APIs in summary format', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `api list ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Available APIs')
        expect(stdout).to.include('GET')
        expect(stdout).to.include('POST')
      })
    })
  })

  // ============================================
  // GET INDIVIDUAL RESOURCES
  // ============================================
  describe('Get Individual Resources', () => {
    describe('Tables', () => {
      it('gets table details in JSON format', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `table get ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const table = parseJsonOutput(stdout, stderr) as {id: number; name: string; description: string; guid: string}

        expect(String(table.id)).to.equal(createdResources.tableId)
        expect(table.name).to.include('integration_table')
        expect(table.description).to.equal('Integration test table')
        expect(table.guid).to.exist
      })

      it('gets table details in summary format', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table get ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('Table:')
        expect(stdout).to.include('integration_table')
        expect(stdout).to.include('Created:')
        expect(stdout).to.include('Updated:')
      })

      it('gets table as XanoScript', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table get ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} -o xs`,
        )
        expect(stdout).to.include('table')
        expect(stdout).to.include('integration_table')
      })

      it('gets XanoScript table with schema', async function () {
        if (!createdResources.tableId2) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table get ${createdResources.tableId2} -p ${PROFILE} -w ${WORKSPACE_ID} -o xs`,
        )
        expect(stdout).to.include('table')
        expect(stdout).to.include('schema')
      })
    })

    describe('API Groups', () => {
      it('gets API group details in JSON format', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `apigroup get ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const group = parseJsonOutput(stdout, stderr) as {id: number; name: string; swagger: boolean; canonical: string}

        expect(String(group.id)).to.equal(createdResources.apiGroupId)
        expect(group.name).to.include('integration_group')
        expect(group.swagger).to.equal(true)
        expect(group.canonical).to.exist
      })

      it('gets API group details in summary format', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `apigroup get ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('API Group:')
        expect(stdout).to.include('Canonical:')
        expect(stdout).to.include('Swagger: enabled')
      })

      it('gets API group as XanoScript', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `apigroup get ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} -o xs`,
        )
        expect(stdout).to.include('api_group')
      })
    })

    describe('API Endpoints', () => {
      it('gets API endpoint details in JSON format', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const {stdout, stderr} = await runTrackedCommand(
          `api get ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID} -o json`,
        )
        const api = parseJsonOutput(stdout, stderr) as {id: number; name: string; verb: string; description: string}

        expect(String(api.id)).to.equal(createdResources.apiId)
        expect(api.verb).to.equal('GET')
        expect(api.description).to.equal('GET endpoint test')
      })

      it('gets API endpoint details in summary format', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `api get ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(stdout).to.include('API:')
        expect(stdout).to.include('GET')
        expect(stdout).to.include('Created:')
      })

      it('gets API endpoint as XanoScript', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `api get ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID} -o xs`,
        )
        expect(stdout).to.include('verb=GET')
      })
    })
  })

  // ============================================
  // EDIT RESOURCES
  // ============================================
  describe('Edit Resources', () => {
    describe('Tables', () => {
      it('edits table description', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const newDescription = 'Updated integration test table'
        const {stdout, stderr} = await runTrackedCommand(
          `table edit ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "${newDescription}" -o json`,
        )
        const table = parseJsonOutput(stdout, stderr) as {description: string}

        expect(table.description).to.equal(newDescription)
      })

      it('edits table name', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const newName = `renamed_table${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `table edit ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --name "${newName}" -o json`,
        )
        const table = parseJsonOutput(stdout, stderr) as {name: string}

        expect(table.name).to.equal(newName)
      })

      it('shows table edit in summary format', async function () {
        if (!createdResources.tableId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `table edit ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "Final description"`,
        )
        expect(stdout).to.include('Table updated successfully')
        expect(stdout).to.include('ID:')
        expect(stdout).to.include('Name:')
      })
    })

    describe('API Groups', () => {
      it('edits API group description', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        const newDescription = 'Updated integration test API group'
        const {stdout, stderr} = await runTrackedCommand(
          `apigroup edit ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "${newDescription}" -o json`,
        )
        const group = parseJsonOutput(stdout, stderr) as {description: string}

        expect(group.description).to.equal(newDescription)
      })

      it('edits API group swagger setting', async function () {
        if (!createdResources.apiGroupId) {
          this.skip()
          return
        }

        // Disable swagger
        const {stdout: stdout1, stderr: stderr1} = await runTrackedCommand(
          `apigroup edit ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --no-swagger -o json`,
        )
        const group1 = parseJsonOutput(stdout1, stderr1) as {swagger: boolean}
        expect(group1.swagger).to.equal(false)

        // Re-enable swagger
        const {stdout: stdout2, stderr: stderr2} = await runTrackedCommand(
          `apigroup edit ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --swagger -o json`,
        )
        const group2 = parseJsonOutput(stdout2, stderr2) as {swagger: boolean}
        expect(group2.swagger).to.equal(true)
      })
    })

    describe('API Endpoints', () => {
      it('edits API endpoint description', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const newDescription = 'Updated GET endpoint description'
        const {stdout, stderr} = await runTrackedCommand(
          `api edit ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "${newDescription}" -o json`,
        )
        const api = parseJsonOutput(stdout, stderr) as {description: string}

        expect(api.description).to.equal(newDescription)
      })

      it('edits API endpoint name', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const newName = `renamed_endpoint${testSuffix}`
        const {stdout, stderr} = await runTrackedCommand(
          `api edit ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID} --name "${newName}" -o json`,
        )
        const api = parseJsonOutput(stdout, stderr) as {name: string}

        expect(api.name).to.equal(newName)
      })

      it('shows API edit publishes by default', async function () {
        if (!createdResources.apiGroupId || !createdResources.apiId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `api edit ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID} --description "Published update"`,
        )
        expect(stdout).to.include('published')
      })
    })
  })

  // ============================================
  // ERROR HANDLING
  // ============================================
  describe('Error Handling', () => {
    it('shows error for non-existent table', async () => {
      const {error} = await runTrackedCommand(`table get 999999 -p ${PROFILE} -w ${WORKSPACE_ID}`)
      expect(error).to.exist
    })

    it('shows error for non-existent API group', async () => {
      const {error} = await runTrackedCommand(`apigroup get 999999 -p ${PROFILE} -w ${WORKSPACE_ID}`)
      expect(error).to.exist
    })

    it('shows error for non-existent API endpoint', async function () {
      if (!createdResources.apiGroupId) {
        this.skip()
        return
      }

      const {error} = await runTrackedCommand(
        `api get ${createdResources.apiGroupId} 999999 -p ${PROFILE} -w ${WORKSPACE_ID}`,
      )
      expect(error).to.exist
    })

    it('shows error for missing required table argument', async () => {
      const {error} = await runTrackedCommand(`table get -p ${PROFILE} -w ${WORKSPACE_ID}`)
      expect(error?.message).to.include('Missing')
    })

    it('shows error for missing API group argument', async () => {
      const {error} = await runTrackedCommand(`api list -p ${PROFILE} -w ${WORKSPACE_ID}`)
      expect(error?.message).to.include('Missing')
    })
  })

  // ============================================
  // DELETE RESOURCES (CLEANUP)
  // ============================================
  describe('Delete Resources (Cleanup)', () => {
    it('deletes POST API endpoint', async function () {
      if (!createdResources.apiId2 || !createdResources.apiGroupId) {
        this.skip()
        return
      }

      const {stdout} = await runTrackedCommand(
        `api delete ${createdResources.apiGroupId} ${createdResources.apiId2} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
      )
      expect(stdout).to.include('deleted successfully')
      console.log(`      Deleted POST API ID: ${createdResources.apiId2}`)
    })

    it('deletes GET API endpoint', async function () {
      if (!createdResources.apiId || !createdResources.apiGroupId) {
        this.skip()
        return
      }

      const {stdout} = await runTrackedCommand(
        `api delete ${createdResources.apiGroupId} ${createdResources.apiId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
      )
      expect(stdout).to.include('deleted successfully')
      console.log(`      Deleted GET API ID: ${createdResources.apiId}`)
    })

    it('deletes API group', async function () {
      if (!createdResources.apiGroupId) {
        this.skip()
        return
      }

      const {stdout} = await runTrackedCommand(
        `apigroup delete ${createdResources.apiGroupId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
      )
      expect(stdout).to.include('deleted successfully')
      console.log(`      Deleted API group ID: ${createdResources.apiGroupId}`)
    })

    it('deletes XanoScript table', async function () {
      if (!createdResources.tableId2) {
        this.skip()
        return
      }

      const {stdout} = await runTrackedCommand(
        `table delete ${createdResources.tableId2} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
      )
      expect(stdout).to.include('deleted successfully')
      console.log(`      Deleted XanoScript table ID: ${createdResources.tableId2}`)
    })

    it('deletes main table', async function () {
      if (!createdResources.tableId) {
        this.skip()
        return
      }

      const {stdout} = await runTrackedCommand(
        `table delete ${createdResources.tableId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
      )
      expect(stdout).to.include('deleted successfully')
      console.log(`      Deleted table ID: ${createdResources.tableId}`)
    })
  })

  // ============================================
  // VERIFY DELETION
  // ============================================
  describe('Verify Deletion', () => {
    it('verifies tables are deleted', async function () {
      if (!createdResources.tableId && !createdResources.tableId2) {
        this.skip()
        return
      }

      const {stdout, stderr} = await runTrackedCommand(`table list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
      const tables = parseJsonOutput(stdout, stderr) as Array<{id: number}>

      if (createdResources.tableId) {
        const found1 = tables.find((t) => String(t.id) === createdResources.tableId)
        expect(found1).to.be.undefined
      }

      if (createdResources.tableId2) {
        const found2 = tables.find((t) => String(t.id) === createdResources.tableId2)
        expect(found2).to.be.undefined
      }
    })

    it('verifies API group is deleted', async function () {
      if (!createdResources.apiGroupId) {
        this.skip()
        return
      }

      const {stdout, stderr} = await runTrackedCommand(`apigroup list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
      const groups = parseJsonOutput(stdout, stderr) as Array<{id: number}>

      const found = groups.find((g) => String(g.id) === createdResources.apiGroupId)
      expect(found).to.be.undefined
    })
  })
})
