/**
 * Shared Test Reporter Utilities
 *
 * This module provides shared functionality for test result tracking and report generation
 * across all integration test suites. Each test suite exports its results to a JSON file,
 * which are then aggregated into a master report.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// ============================================
// TYPES
// ============================================

export interface TestResult {
  name: string
  suite: string
  category: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  command?: string
  input?: Record<string, unknown>
  output?: unknown
  error?: string
}

export interface SuiteResults {
  suite: string
  description: string
  runDate: string
  duration: number
  profile: string
  workspace: string
  results: TestResult[]
  passed: number
  failed: number
  skipped: number
}

export interface MasterReport {
  runDate: string
  totalDuration: number
  profile: string
  workspace: string
  suites: SuiteResults[]
  totals: {
    tests: number
    passed: number
    failed: number
    skipped: number
    passRate: string
  }
}

// ============================================
// CONSTANTS
// ============================================

const RESULTS_DIR = path.join(process.cwd(), 'test-results')
const REPORT_FILE = path.join(process.cwd(), 'test-report.md')

// ============================================
// TEST RESULT TRACKER CLASS
// ============================================

export class TestReporter {
  private results: TestResult[] = []
  private startTime: number
  private suiteName: string
  private suiteDescription: string
  private profile: string
  private workspace: string
  private currentTest: Partial<TestResult> = {}

  constructor(suiteName: string, suiteDescription: string, profile: string, workspace: string) {
    this.suiteName = suiteName
    this.suiteDescription = suiteDescription
    this.profile = profile
    this.workspace = workspace
    this.startTime = Date.now()
  }

  /**
   * Start tracking a new test
   */
  startTest(category: string): void {
    this.currentTest = {
      suite: this.suiteName,
      category,
    }
  }

  /**
   * Record command execution details
   */
  recordCommand(command: string, input?: Record<string, unknown>): void {
    this.currentTest.command = `xano ${command}`
    this.currentTest.input = input
  }

  /**
   * Record command output
   */
  recordOutput(output: unknown): void {
    this.currentTest.output = output
  }

  /**
   * Record an error
   */
  recordError(error: string): void {
    this.currentTest.error = error
  }

  /**
   * Finish tracking current test
   */
  finishTest(name: string, status: 'passed' | 'failed' | 'skipped', duration: number, error?: string): void {
    if (error && !this.currentTest.error) {
      this.currentTest.error = error
    }

    this.results.push({
      name,
      suite: this.suiteName,
      category: this.currentTest.category || 'Unknown',
      status,
      duration,
      command: this.currentTest.command,
      input: this.currentTest.input,
      output: this.currentTest.output,
      error: this.currentTest.error,
    })

    this.currentTest = {}
  }

  /**
   * Get current test context for command tracking
   */
  getCurrentTest(): Partial<TestResult> {
    return this.currentTest
  }

  /**
   * Write suite results to JSON file
   */
  writeResults(): void {
    const endTime = Date.now()
    const duration = endTime - this.startTime

    const suiteResults: SuiteResults = {
      suite: this.suiteName,
      description: this.suiteDescription,
      runDate: new Date().toISOString(),
      duration,
      profile: this.profile,
      workspace: this.workspace,
      results: this.results,
      passed: this.results.filter((r) => r.status === 'passed').length,
      failed: this.results.filter((r) => r.status === 'failed').length,
      skipped: this.results.filter((r) => r.status === 'skipped').length,
    }

    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, {recursive: true})
    }

    // Write JSON results
    const resultsFile = path.join(RESULTS_DIR, `${this.suiteName}.json`)
    fs.writeFileSync(resultsFile, JSON.stringify(suiteResults, null, 2), 'utf8')
    console.log(`\n  Suite results written to: ${resultsFile}`)
  }

  /**
   * Get results summary
   */
  getSummary(): {passed: number; failed: number; skipped: number; total: number} {
    return {
      passed: this.results.filter((r) => r.status === 'passed').length,
      failed: this.results.filter((r) => r.status === 'failed').length,
      skipped: this.results.filter((r) => r.status === 'skipped').length,
      total: this.results.length,
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function truncateOutput(output: unknown, maxLength = 500): string {
  const str = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '... (truncated)'
}

export function parseJsonOutput(stdout: string, stderr?: string): unknown {
  if (!stdout || stdout.trim() === '') {
    throw new Error(`Command returned empty output. stderr: ${stderr || 'none'}`)
  }
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`Failed to parse JSON output: ${stdout.substring(0, 500)}`)
  }
}

// ============================================
// MASTER REPORT GENERATOR
// ============================================

export function generateMasterReport(): MasterReport | null {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('No test results found. Run tests first.')
    return null
  }

  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.log('No test result files found.')
    return null
  }

  const suites: SuiteResults[] = []
  let totalDuration = 0
  let profile = ''
  let workspace = ''

  for (const file of files) {
    const content = fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8')
    const suite = JSON.parse(content) as SuiteResults
    suites.push(suite)
    totalDuration += suite.duration
    if (!profile) profile = suite.profile
    if (!workspace) workspace = suite.workspace
  }

  // Sort suites by name for consistent ordering
  suites.sort((a, b) => a.suite.localeCompare(b.suite))

  const totals = {
    tests: suites.reduce((sum, s) => sum + s.results.length, 0),
    passed: suites.reduce((sum, s) => sum + s.passed, 0),
    failed: suites.reduce((sum, s) => sum + s.failed, 0),
    skipped: suites.reduce((sum, s) => sum + s.skipped, 0),
    passRate: '0%',
  }

  const totalRun = totals.passed + totals.failed
  totals.passRate = totalRun > 0 ? `${((totals.passed / totalRun) * 100).toFixed(1)}%` : 'N/A'

  return {
    runDate: new Date().toISOString(),
    totalDuration,
    profile,
    workspace,
    suites,
    totals,
  }
}

export function writeMasterReport(): void {
  const report = generateMasterReport()
  if (!report) return

  let md = `# Xano CLI Integration Test Report

## Overall Summary

| Metric | Value |
|--------|-------|
| **Run Date** | ${report.runDate} |
| **Total Duration** | ${formatDuration(report.totalDuration)} |
| **Profile** | ${report.profile} |
| **Workspace** | ${report.workspace} |
| **Total Tests** | ${report.totals.tests} |
| **Passed** | ${report.totals.passed} |
| **Failed** | ${report.totals.failed} |
| **Skipped** | ${report.totals.skipped} |
| **Pass Rate** | ${report.totals.passRate} |

## Suite Overview

| Suite | Description | Passed | Failed | Skipped | Duration |
|-------|-------------|--------|--------|---------|----------|
`

  for (const suite of report.suites) {
    const statusIcon = suite.failed > 0 ? 'FAIL' : 'PASS'
    md += `| ${statusIcon} ${suite.suite} | ${suite.description} | ${suite.passed} | ${suite.failed} | ${suite.skipped} | ${formatDuration(suite.duration)} |\n`
  }

  md += `\n---\n\n`

  // Detailed results by suite
  for (const suite of report.suites) {
    md += `## ${suite.suite}\n\n`
    md += `**${suite.description}**\n\n`
    md += `| Status | Test | Category | Duration |\n`
    md += `|--------|------|----------|----------|\n`

    for (const test of suite.results) {
      const statusIcon = test.status === 'passed' ? 'PASS' : test.status === 'failed' ? 'FAIL' : 'SKIP'
      md += `| ${statusIcon} | ${test.name} | ${test.category} | ${formatDuration(test.duration)} |\n`
    }

    md += `\n`

    // Show failed tests details
    const failedTests = suite.results.filter((t) => t.status === 'failed')
    if (failedTests.length > 0) {
      md += `### Failed Tests\n\n`
      for (const test of failedTests) {
        md += `#### ${test.name}\n\n`
        if (test.command) {
          md += `- **Command:** \`${test.command}\`\n`
        }
        if (test.error) {
          md += `- **Error:**\n\`\`\`\n${test.error}\n\`\`\`\n`
        }
        md += `\n`
      }
    }

    md += `---\n\n`
  }

  md += `\n*Generated by Xano CLI Integration Tests*\n`

  fs.writeFileSync(REPORT_FILE, md, 'utf8')
  console.log(`\nMaster test report written to: ${REPORT_FILE}`)
}

// ============================================
// MOCHA INTEGRATION HELPERS
// ============================================

/**
 * Creates a Mocha-compatible test wrapper that automatically tracks results
 */
export function createTestContext(reporter: TestReporter) {
  let testStartMs = 0
  let currentCategory = ''

  return {
    beforeEach(context: Mocha.Context) {
      const titlePath = context.currentTest?.titlePath() || []
      currentCategory = titlePath[2] || titlePath[1] || 'Unknown'
      reporter.startTest(currentCategory)
      testStartMs = Date.now()
    },

    afterEach(context: Mocha.Context) {
      const duration = Date.now() - testStartMs
      const state = context.currentTest?.state
      let status: 'passed' | 'failed' | 'skipped' = 'passed'
      let error: string | undefined

      if (state === 'failed') {
        status = 'failed'
        error = context.currentTest?.err?.message
      } else if (context.currentTest?.pending) {
        status = 'skipped'
      }

      reporter.finishTest(context.currentTest?.title || 'Unknown Test', status, duration, error)
    },

    after() {
      reporter.writeResults()
    },
  }
}
