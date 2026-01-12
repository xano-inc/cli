/**
 * Middleware, Task & Datasource Integration Tests
 *
 * Tests for:
 * - Middleware (create, list, get, edit, delete, security)
 * - Task (create, list, get, edit, delete, security)
 * - Datasource (create, list, edit, delete)
 *
 * Run with: npm test -- --grep "Middleware, Task & Datasource"
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
  'middleware-task-datasource',
  'Middleware, Tasks, and Datasources',
  PROFILE,
  WORKSPACE_ID,
)

const createdResources = {
  middlewareId: null as string | null,
  taskId: null as string | null,
  datasourceLabel: null as string | null,
}

const testSuffix = `_mtd_${Date.now()}`

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

describe('Middleware, Task & Datasource Integration Tests', function () {
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
        const {stdout} = await runTrackedCommand(`middleware list -p ${PROFILE} -w ${WORKSPACE_ID}`)
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
        const {stdout, stderr} = await runTrackedCommand(`task list -p ${PROFILE} -w ${WORKSPACE_ID} -o json`)
        const result = parseJsonOutput(stdout, stderr)
        expect(result).to.be.an('array')
      })

      it('lists tasks in summary format', async () => {
        const {stdout} = await runTrackedCommand(`task list -p ${PROFILE} -w ${WORKSPACE_ID}`)
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
        const {stdout} = await runTrackedCommand(`datasource list -p ${PROFILE} -w ${WORKSPACE_ID}`)
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
