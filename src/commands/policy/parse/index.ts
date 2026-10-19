import PolicyCommand from '../../../policy-command.js'
import {examplePolicyLines} from '../../../utils/policy/example.js'

/**
 * The canonical source with its severity always written. The platform leaves `severity` out at its
 * default (medium), and a reader took the missing line for a dropped one, so the summary puts it back
 * where the platform writes every other severity: before `enforcement`, which it always writes. `-o json`
 * keeps the platform's source as served.
 */
export function sourceWithSeverity(source: string, severity: unknown): string {
  if (typeof severity !== 'string' || severity === '') return source
  const lines = source.split('\n')
  if (lines.some(line => /^ {2}severity = /.test(line))) return source
  const enforcement = lines.findIndex(line => /^ {2}enforcement = "[^"]*"$/.test(line))
  if (enforcement === -1) return source
  lines.splice(enforcement, 0, `  severity = ${JSON.stringify(severity)}`)
  return lines.join('\n')
}

export default class PolicyParse extends PolicyCommand {
  static override args = {...PolicyCommand.sourceArgs}
  static override description = 'Validate and format policy XanoScript using the platform parser, with rule warnings against the branch. The summary always shows the severity, medium included'
  static override examples = [
    '$ xano policy parse policies/AUTH-001.xs',
    '$ xano policy parse --file policies/AUTH-001.xs',
  ]
  static override flags = {...PolicyCommand.policyFlags, ...PolicyCommand.sourceFlags}
  /** Shown verbatim in its own help section (see help.ts): a person reading this help has not seen a policy file yet. */
  static policyFileExample = examplePolicyLines('A minimal policy file (`xano policy catalogue` lists the checks, their params and the scope fields):')

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyParse)
    const {request} = this.policyTarget(flags)
    const parsed = await this.parseSource(request, {source: this.readSource(flags, args.file)})
    this.log(flags.output === 'json' ? JSON.stringify(parsed, null, 2) : sourceWithSeverity(parsed.source, parsed.policy?.severity))
    if (flags.output !== 'json') this.logRuleWarnings(parsed)
  }
}
