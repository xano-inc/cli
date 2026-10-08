import type {CoverageFinding, ObjectCoverage, ObjectCoveragePolicy} from './types.js'

import {coverageFindingLines} from './findings.js'

/** An object as findings name it, `type:id` (`query:42`), or `null` when the text is not one. */
export function parseObjectRef(text: string): null | {id: number; type: string} {
  const match = /^([a-z_]+):(\d+)$/i.exec(text.trim())
  if (!match) return null
  const id = Number(match[2])
  return Number.isSafeInteger(id) && id > 0 ? {id, type: match[1].toLowerCase()} : null
}

const count = (value?: number) => value ?? 0

/** The object coverage chip, worded as Studio's object panel words it. */
export function coverageChip(summary: ObjectCoverage['summary']): string {
  switch (summary?.state) {
    case 'check_failed': {
      return 'Policies · Last check failed'
    }

    case 'findings': {
      return `Policies ${count(summary.blocking)} blocking · ${count(summary.advisory)} advisory`
    }

    case 'none_apply': {
      return 'Policies · None apply'
    }

    case 'not_checked': {
      return `Policies · ${count(summary.applies)} apply · not checked yet`
    }

    case 'pass': {
      return `Policies ✓ ${count(summary.passing)} pass`
    }

    default: {
      return `Policies · ${summary?.state ?? 'unknown'}`
    }
  }
}

const STATUS: Record<string, string> = {failing: 'failing', not_checked: 'not checked yet', passing: 'passing'}

function policyLines(policy: ObjectCoveragePolicy): string[] {
  const enforcement = policy.blocking ? 'Blocking' : 'Advisory'
  const status = STATUS[policy.status ?? ''] ?? policy.status ?? ''
  return [
    `  ${[policy.key, enforcement, status, policy.title].filter(Boolean).join('  ')}`,
    ...(policy.reasons ?? []).map(reason => `    Applies: ${reason}`),
  ]
}

function objectName(object: ObjectCoverage['object']): string {
  if (!object) return 'object'
  const name = object.name ? ` ${object.name}` : ''
  return `${object.type ?? 'object'}${name}${object.id ? ` (id ${object.id})` : ''}`
}

/**
 * An object's coverage on stdout: the chip, the run it reads, the findings Blocking then Advisory,
 * each with its fix, the policies that apply with why, and the platform's note.
 */
export function coverageLines(answer: ObjectCoverage): string[] {
  const lines = [`${objectName(answer.object)}: ${coverageChip(answer.summary)}`]
  lines.push(answer.run
    ? `Latest run: ${answer.run.started_at ?? 'unknown time'} (${answer.run.status ?? 'unknown'}); changes made since are not included.`
    : 'No run yet: the branch has never been checked.')
  const findings: CoverageFinding[] = answer.findings ?? []
  const blocking = findings.filter(finding => finding.blocking === true)
  const advisory = findings.filter(finding => finding.blocking !== true)
  if (blocking.length > 0) lines.push(`Blocking findings (${blocking.length}):`, ...blocking.flatMap(finding => coverageFindingLines(finding)))
  if (advisory.length > 0) lines.push(`Advisory findings (${advisory.length}):`, ...advisory.flatMap(finding => coverageFindingLines(finding)))
  const policies = answer.policies ?? []
  if (policies.length > 0) lines.push(`Policies that apply (${policies.length}):`, ...policies.flatMap(policy => policyLines(policy)))
  if (answer.note?.trim()) lines.push(answer.note.trim())
  return lines
}
