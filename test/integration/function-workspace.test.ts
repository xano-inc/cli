/**
 * Function & Workspace Integration Tests
 *
 * Tests for:
 * - Function (create, delete, security)
 * - Workspace (get, context, openapi, export)
 *
 * Run with: npm test -- --grep "Function & Workspace"
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {TestReporter, createTestContext, parseJsonOutput} from '../utils/test-reporter.js'

const WORKSPACE_ID = process.env.XANO_TEST_WORKSPACE || '40'
const PROFILE = process.env.XANO_TEST_PROFILE || 'mcp-server'

const reporter = new TestReporter(
  'function-workspace',
  'Functions and Workspace Operations',
  PROFILE,
  WORKSPACE_ID,
)

const createdResources = {
  functionId: null as string | null,
}

const testSuffix = `_funcws_${Date.now()}`

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

describe('Function & Workspace Integration Tests', function () {
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
  // FUNCTION TESTS
  // ============================================
  describe('Function Commands', () => {
    describe('Create Function', () => {
      it('creates a test function', async () => {
        const funcName = `test_func${testSuffix}`
        const xsContent = `function ${funcName} {
  input {
  }
  stack {
  }
  response = "Hello from test function"
}`
        const tmpFile = path.join(os.tmpdir(), `test-func-${Date.now()}.xs`)
        fs.writeFileSync(tmpFile, xsContent, 'utf8')

        try {
          const {stdout, stderr} = await runTrackedCommand(
            `function create -p ${PROFILE} -w ${WORKSPACE_ID} -f ${tmpFile} -o json`,
          )
          const result = parseJsonOutput(stdout, stderr) as {id: number; name: string}

          expect(result).to.have.property('id')
          expect(result.name).to.equal(funcName)

          createdResources.functionId = String(result.id)
          console.log(`      Created function ID: ${createdResources.functionId}`)
        } finally {
          fs.unlinkSync(tmpFile)
        }
      })
    })

    describe('Function Security', () => {
      it('updates function security (clear)', async function () {
        if (!createdResources.functionId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `function security ${createdResources.functionId} -p ${PROFILE} -w ${WORKSPACE_ID} --clear`,
        )
        expect(stdout).to.include('security cleared')
      })

      it('shows error when no security option provided', async function () {
        if (!createdResources.functionId) {
          this.skip()
          return
        }

        const {error} = await runTrackedCommand(
          `function security ${createdResources.functionId} -p ${PROFILE} -w ${WORKSPACE_ID}`,
        )
        expect(error?.message).to.include('Either --apigroup-guid or --clear must be provided')
      })
    })

    describe('Function Delete', () => {
      it('deletes the test function', async function () {
        if (!createdResources.functionId) {
          this.skip()
          return
        }

        const {stdout} = await runTrackedCommand(
          `function delete ${createdResources.functionId} -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(stdout).to.include('deleted successfully')
        console.log(`      Deleted function ID: ${createdResources.functionId}`)
      })

      it('shows error for non-existent function', async () => {
        const {error} = await runTrackedCommand(
          `function delete 999999 -p ${PROFILE} -w ${WORKSPACE_ID} --force`,
        )
        expect(error).to.exist
      })
    })
  })

  // ============================================
  // WORKSPACE TESTS
  // ============================================
  describe('Workspace Commands', () => {
    describe('Workspace Get', () => {
      it('gets workspace details in summary format', async () => {
        const {stdout} = await runTrackedCommand(`workspace get ${WORKSPACE_ID} -p ${PROFILE}`)
        expect(stdout).to.include('Workspace:')
        expect(stdout).to.include(`ID: ${WORKSPACE_ID}`)
      })

      it('gets workspace details in JSON format', async () => {
        const {stdout, stderr} = await runTrackedCommand(`workspace get ${WORKSPACE_ID} -p ${PROFILE} -o json`)
        const result = parseJsonOutput(stdout, stderr) as {id: number}
        expect(result).to.have.property('id')
        expect(String(result.id)).to.equal(WORKSPACE_ID)
      })
    })

    describe('Workspace Context', () => {
      it('gets workspace context (text format)', async () => {
        const {stdout} = await runTrackedCommand(`workspace context ${WORKSPACE_ID} -p ${PROFILE}`)
        expect(stdout).to.be.a('string')
        expect(stdout.length).to.be.greaterThan(0)
        expect(stdout).to.include('workspaceId')
      })
    })

    describe('Workspace OpenAPI', () => {
      it('gets workspace OpenAPI spec', async () => {
        const {stdout, stderr} = await runTrackedCommand(`workspace openapi ${WORKSPACE_ID} -p ${PROFILE}`)
        const result = parseJsonOutput(stdout, stderr) as {openapi?: string; info?: unknown}
        expect(result).to.be.an('object')
        expect(result.openapi || result.info).to.exist
      })
    })

    describe('Workspace Export/Import Schema', () => {
      it('exports workspace schema to file', async () => {
        const schemaExportFile = path.join(os.tmpdir(), `schema-export-${Date.now()}.xano`)
        const {stdout} = await runTrackedCommand(
          `workspace export-schema ${WORKSPACE_ID} -p ${PROFILE} --file ${schemaExportFile}`,
        )
        expect(stdout).to.include('exported')
        expect(fs.existsSync(schemaExportFile)).to.be.true
        const fileContent = fs.readFileSync(schemaExportFile)
        expect(fileContent.length).to.be.greaterThan(0)

        if (fs.existsSync(schemaExportFile)) {
          fs.unlinkSync(schemaExportFile)
        }
      })
    })

    describe('Workspace Export', () => {
      it('exports workspace to file', async () => {
        const workspaceExportFile = path.join(os.tmpdir(), `workspace-export-${Date.now()}.xano`)
        const {stdout} = await runTrackedCommand(
          `workspace export ${WORKSPACE_ID} -p ${PROFILE} --file ${workspaceExportFile}`,
        )
        expect(stdout).to.include('exported')
        expect(fs.existsSync(workspaceExportFile)).to.be.true
        const fileContent = fs.readFileSync(workspaceExportFile)
        expect(fileContent.length).to.be.greaterThan(0)

        if (fs.existsSync(workspaceExportFile)) {
          fs.unlinkSync(workspaceExportFile)
        }
      })
    })
  })
})
