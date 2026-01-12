#!/usr/bin/env npx ts-node
/**
 * Master Report Generator
 *
 * This script aggregates all test suite results from test-results/*.json
 * into a single comprehensive test-report.md file.
 *
 * Run with: npx ts-node test/generate-report.ts
 * Or automatically via: npm run test:report
 */

import {writeMasterReport} from './utils/test-reporter.ts'

console.log('\nGenerating master test report...')
writeMasterReport()
