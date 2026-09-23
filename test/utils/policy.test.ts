import {expect} from 'chai'

import {parseDocument, policyBaseName} from '../../src/utils/document-parser.js'
import {filterChangedEntries} from '../../src/utils/multidoc-push.js'
import {
  evaluationEvidence,
  notStoredLine,
  policyCheckWarning,
  policyDocumentSummary,
  policyExitCode,
  pushEvidence,
  policySummary as summarize,
} from '../../src/utils/policy/feedback.js'
import {policyResultSummary, policyRuleName} from '../../src/utils/policy/findings.js'
import {policyRunDetail, policyRunSummary, policyRunTable, policySettings} from '../../src/utils/policy/runs.js'
import {
  computeStatusRows,
  enforcementLabel,
  findingsLabel,
  statusExitCode,
  statusExitReason,
  statusLabel,
} from '../../src/utils/policy/status.js'

const result = (status: string, checked = 1) => ({check_id: 'R1', checked, policy_key: 'AUTH-001', status})
/** A push's summary: its `policy_check` carries its own evidence. */
const policySummary = (check?: Parameters<typeof pushEvidence>[0]) => summarize(check, pushEvidence(check))
const coverage = (overrides: Record<string, unknown> = {}) =>
  ({enforcement: 'mandatory', included: true, run_id: 5, stale: false, version: 1, ...overrides})

describe('policy carriage and feedback', () => {
  it('preserves stable policy keys as safe filenames', () => {
    expect(policyBaseName('AUTH-001')).to.equal('AUTH-001')
    expect(() => policyBaseName('../escape')).to.throw('Invalid policy key')
  })

  const warned = ['disabled', 'forbidden', 'unavailable', 'error']

  it('exits 2 whenever the platform says a finding blocks, whatever the status', () => {
    expect(policyExitCode({blocking: true, status: 'fail'})).to.equal(2)
    expect(policyExitCode({blocking: true, status: 'error'})).to.equal(2)
    expect(policyExitCode({blocking: false, status: 'fail'})).to.equal(0)
    expect(policyExitCode({blocking: false, status: 'pass'})).to.equal(0)
    for (const status of [...warned, 'not_applicable']) expect(policyExitCode({blocking: false, message: 'M', status})).to.equal(0)
    expect(policyExitCode()).to.equal(0)
  })

  it('warns once with the server status and message for disabled, forbidden, unavailable and error', () => {
    for (const status of warned) {
      expect(policyCheckWarning({blocking: false, message: `Said ${status}.`, status})).to.equal(`Policy check ${status}: Said ${status}.`)
      expect(policySummary({blocking: false, message: `Said ${status}.`, status})).to.deep.equal([])
    }

    expect(policyCheckWarning()).to.equal('Policy check: no policy feedback returned.')
    expect(policyCheckWarning({status: 'error'})).to.equal('Policy check error: no message returned.')
    expect(policyCheckWarning({blocking: false, status: 'pass'})).to.equal(null)
    expect(policyCheckWarning({blocking: true, status: 'fail'})).to.equal(null)
  })

  it('headlines a branch with no active policy with the server message, and does not warn', () => {
    const check = {blocking: false, message: 'No active policies on this branch; nothing was evaluated.', status: 'not_applicable'}
    expect(policyCheckWarning(check)).to.equal(null)
    expect(policySummary(check)).to.deep.equal(['Policy check: not_applicable', 'No active policies on this branch; nothing was evaluated.'])
  })

  it('prints findings under their outcome, and nothing for missing feedback', () => {
    expect(policySummary()).to.deep.equal([])
    const summary = policySummary({blocking: true, findings: [{message: 'No auth', rule_id: 'R1'}], status: 'fail'}).join('\n')
    expect(summary).to.contain('Policy check: fail (blocking findings)').and.to.contain('No auth')
  })

  it('says what happened to each policy document when the push previewed it', () => {
    expect(policyDocumentSummary({operations: [
      {action: 'create', name: 'AUTH-001', type: 'policy'},
      {action: 'update', name: 'SEC-100', type: 'policy'},
      {action: 'unchanged', name: 'POL-001', type: 'policy'},
      {action: 'update', name: 'account', type: 'table'},
    ]}, 2)).to.deep.equal(['Policy documents: 1 created (AUTH-001), 1 updated (SEC-100), 1 unchanged'])
  })

  it('claims no change for policy documents pushed without a preview', () => {
    expect(policyDocumentSummary(null, 2)).to.deep.equal(['Policy documents: 2 sent without a preview, so which of them changed is not known'])
    expect(policyDocumentSummary(null, 0)).to.deep.equal([])
    expect(policyDocumentSummary({operations: [{action: 'update', name: 'account', type: 'table'}]}, 0)).to.deep.equal([])
  })

  it('prints a warning for a name the branch does not have, even when the rule passed', () => {
    const summary = policySummary({
      results: [{check_id: 'AUTH-001.R1', checked: 3, policy_key: 'AUTH-001', status: 'pass', warnings: ['API group "incidents" is not on this branch.']}],
      status: 'pass',
    }).join('\n')
    // Warnings are grouped under their own heading so "your scope is wrong" is not
    // read as another finding.
    expect(summary).to.contain('Warnings:\n  AUTH-001 AUTH-001.R1: API group "incidents" is not on this branch.')
  })

  it('separates rule errors from scope warnings under their own headings', () => {
    const summary = policySummary({
      results: [
        {check_id: 'AUTH-001.R1', checked: 1, message: 'Unknown check', policy_key: 'AUTH-001', status: 'error'},
        {check_id: 'AUTH-001.R2', checked: 1, policy_key: 'AUTH-001', status: 'pass', warnings: ['Tag "pii" is not on this branch.']},
      ],
      status: 'fail',
    }).join('\n')
    expect(summary).to.contain('Errors:\n  AUTH-001 AUTH-001.R1: Unknown check')
    expect(summary).to.contain('Warnings:\n  AUTH-001 AUTH-001.R2: Tag "pii" is not on this branch.')
    expect(summary.indexOf('Errors:')).to.be.lessThan(summary.indexOf('Warnings:'))
  })

  it('names the rules that checked nothing instead of printing them as passes', () => {
    const results = [
      {check_id: 'AUTH-001.R1', checked: 12, policy_key: 'AUTH-001', status: 'pass'},
      {check_id: 'AUTH-001.R2', checked: 0, policy_key: 'AUTH-001', status: 'pass'},
      {check_id: 'SEC-100.R1', policy_key: 'SEC-100', status: 'pass'},
    ]
    const summary = policyResultSummary(results).join('\n')
    expect(summary).to.contain('No objects checked (proves nothing about coverage):\n  AUTH-001 AUTH-001.R2: no objects checked\n  SEC-100 SEC-100.R1: no objects checked')
    // The per-rule list follows the errors and warnings rather than interleaving with them.
    const withDiagnostics = policyResultSummary([
      {check_id: 'AUTH-001.R0', checked: 3, message: 'Unknown check', policy_key: 'AUTH-001', status: 'error'},
      ...results,
    ]).join('\n')
    expect(withDiagnostics.indexOf('Errors:')).to.be.lessThan(withDiagnostics.indexOf('No objects checked ('))

    // Every rule checking nothing is one sentence about the run, not a list repeating it.
    const none = policyResultSummary([{check_id: 'AUTH-001.R2', checked: 0, policy_key: 'AUTH-001', status: 'pass'}])
    expect(none).to.deep.equal(['No objects checked; this run does not demonstrate coverage.'])
    // A run where every rule reached something says nothing at all.
    expect(policyResultSummary([{check_id: 'AUTH-001.R1', checked: 12, policy_key: 'AUTH-001', status: 'pass'}])).to.deep.equal([])
    expect(policyResultSummary()).to.deep.equal([])
  })

  it('never headlines a pass whose rules checked no objects as a plain pass', () => {
    const results = [
      {check_id: 'AUTH-001.R1', checked: 12, policy_key: 'AUTH-001', status: 'pass'},
      {check_id: 'AUTH-001.R2', checked: 0, policy_key: 'AUTH-001', status: 'pass'},
    ]
    expect(policySummary({blocking: false, results, status: 'pass'})[0]).to.equal('Policy check: pass, but 1 rule checked no objects')
    expect(policySummary({blocking: false, results: [results[1]], status: 'pass'})[0]).to.equal('Policy check: pass, but no objects were checked')
    expect(policySummary({blocking: false, results: [results[0]], status: 'pass'})[0]).to.equal('Policy check: pass')
  })

  it('never headlines a pass or fail that does not say whether it blocks', () => {
    for (const blocking of [undefined, null, 'false', 0, 1, 'true']) {
      const check = {blocking, findings: [{message: 'No auth', rule_id: 'R1'}], status: 'pass'} as never
      const summary = policySummary(check).join('\n')
      expect(summary).to.not.contain('Policy check: pass')
      expect(summary).to.contain('No auth')
      expect(policyCheckWarning(check)).to.equal('Policy check pass: the server did not say whether its findings block.')
    }

    expect(policyCheckWarning({blocking: false, status: 'partial'})).to.equal('Policy check partial: no message returned.')
    expect(policySummary({blocking: false, status: 'pass'})).to.deep.equal(['Policy check: pass'])
  })

  it('names an unnamed rule by its id instead of printing nothing', () => {
    const summary = policySummary({
      findings: [{message: 'No auth', policy_key: 'AUTH-001', policy_title: '', rule_id: 'AUTH-001.R1', rule_title: ''}],
      status: 'fail',
    }).join('\n')
    expect(summary).to.contain('AUTH-001.R1 (AUTH-001)')
  })

  it('names a rule by its author, then its check label, then its id', () => {
    const rule = {check: 'query.auth_required', id: 'AUTH-001.R1', label: 'Endpoints require authentication'}
    expect(policyRuleName({...rule, title: 'Endpoints declare auth'})).to.equal('Endpoints declare auth')
    expect(policyRuleName({...rule, title: '  '})).to.equal('Endpoints require authentication')
    expect(policyRuleName(rule)).to.equal('Endpoints require authentication')
    expect(policyRuleName({check: 'query.auth_required', id: 'AUTH-001.R1'})).to.equal('AUTH-001.R1')
    expect(policyRuleName({})).to.equal('')
  })

  it('names an unnamed finding by the label the run snapshot recorded', () => {
    const finding = {message: 'No auth', policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1', rule_title: ''}
    const policies = [{key: 'AUTH-001', rules: [{check: 'query.auth_required', id: 'AUTH-001.R1', label: 'Endpoints require authentication', title: ''}]}]
    const evaluation = {findings: [finding], policies, policy_check: {blocking: false, status: 'fail'}}
    expect(summarize(evaluation.policy_check, evaluationEvidence(evaluation)).join('\n')).to.contain('Endpoints require authentication (AUTH-001)')
    // An author title on the finding wins, and without a snapshot the id still names the rule.
    const titled = {...evaluation, findings: [{...finding, rule_title: 'Auth declared'}]}
    expect(summarize(titled.policy_check, evaluationEvidence(titled)).join('\n')).to.contain('Auth declared (AUTH-001)')
    expect(policySummary({findings: [finding], status: 'fail'}).join('\n')).to.contain('AUTH-001.R1 (AUTH-001)')
  })

  it('reads an evaluation from its run, with the blocking findings named by id', () => {
    const findings = [
      {id: 'F1', message: 'No auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1'},
      {id: 'F2', message: 'Stale tag', object: {name: 'account', type: 'table'}, policy_key: 'SEC-100', rule_id: 'SEC-100.R1'},
    ]
    const evaluation = {findings, id: 12, policy_check: {blocking: true, blocking_finding_ids: ['F1'], status: 'fail'}, results: [], stored: true}
    const summary = summarize(evaluation.policy_check, evaluationEvidence(evaluation)).join('\n')
    expect(summary).to.contain('Blocking findings (1) — these stop the merge:\n  AUTH-001.R1 (AUTH-001)  query GET /x: No auth')
    expect(summary).to.contain('Advisory findings (1) — reported, not blocking:\n  SEC-100.R1 (SEC-100)  table account: Stale tag')
  })

  it('says an evaluation that ran was not stored, and nothing for one that was or that evaluated nothing', () => {
    for (const status of ['pass', 'fail', 'error']) {
      expect(notStoredLine({id: 0, policy_check: {blocking: false, status}, stored: false})).to.contain('Not stored:')
    }

    expect(notStoredLine({id: 12, policy_check: {blocking: false, status: 'pass'}, stored: true})).to.equal(null)
    expect(notStoredLine({id: 0, policy_check: {blocking: false, status: 'not_applicable'}, stored: false})).to.equal(null)
  })

  it('separates blocking findings from advisory ones and leads each line with its rule id', () => {
    const findings = [
      {id: 'F1', message: 'No auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1', rule_title: 'Endpoints declare auth'},
      {id: 'F2', message: 'Stale tag', object: {name: 'account', type: 'table'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R2', rule_title: 'Tables carry a tag'},
    ]
    const summary = policySummary({blocking: true, blocking_findings: [findings[0]], findings, status: 'fail'}).join('\n')
    // The only distinction that changes what the reader does next.
    expect(summary).to.contain('Blocking findings (1) — these stop the merge:\n  AUTH-001.R1  Endpoints declare auth (AUTH-001)  query GET /x: No auth')
    expect(summary).to.contain('Advisory findings (1) — reported, not blocking:\n  AUTH-001.R2  Tables carry a tag (AUTH-001)  table account: Stale tag')
    expect(summary.indexOf('Blocking findings')).to.be.lessThan(summary.indexOf('Advisory findings'))
  })

  it('prints one ungrouped list when the platform did not distinguish the two groups', () => {
    const findings = [{id: 'F1', message: 'No auth', policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1'}]
    const advisory = policySummary({blocking: false, findings, status: 'fail'}).join('\n')
    expect(advisory).to.not.contain('Blocking findings')
    expect(advisory).to.not.contain('Advisory findings')
    expect(advisory).to.contain('  AUTH-001.R1 (AUTH-001)')
    // Every finding blocking is still worth saying, but there is no second group to name.
    const allBlocking = policySummary({blocking: true, blocking_findings: findings, findings, status: 'fail'}).join('\n')
    expect(allBlocking).to.contain('Blocking findings (1) — these stop the merge:')
    expect(allBlocking).to.not.contain('Advisory findings')
  })

  it('reads a stored run without pretending it recorded whether a finding blocks', () => {
    const run = {
      findings: [{id: 'F1', message: 'No auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1', severity: 'high'}],
      finished_at: '2026-09-17T22:42:00.980Z',
      id: 1674,
      objects_checked: 23,
      results: [{check_id: 'AUTH-001.R1', checked: 23, policy_key: 'AUTH-001', status: 'fail'}],
      started_at: '2026-09-17T22:42:00.903Z',
      status: 'fail',
      trigger: 'push',
    }
    const summary = policyRunSummary(run).join('\n')
    expect(summary).to.contain('Run 1674  fail  push  2026-09-17T22:42:00.903Z → 2026-09-17T22:42:00.980Z  23 objects checked')
    expect(summary).to.contain('Findings (1):\n  AUTH-001.R1 [high] (AUTH-001)  query GET /x: No auth')
    // A stored run carries no `blocking`, so it never claims one way or the other.
    expect(summary).to.not.contain('Blocking')
    expect(policyRunSummary({findings: [], id: 9, status: 'pass'}).join('\n')).to.contain('No findings.')
  })

  it('tables the run list from its summaries', () => {
    const pushed = {counts: {blocking: 0, errors: 0, findings: 1}, id: 1674, objects_checked: 23, started_at: '2026-09-17T22:42:00.903Z', status: 'fail', trigger: 'push'}
    const manual = {counts: {blocking: 0, errors: 0, findings: 0}, id: 402, objects_checked: 0, started_at: '2026-09-14T22:18:47.148Z', status: 'fail', trigger: 'manual'}
    expect(policyRunTable([pushed, manual])).to.deep.equal([
      'Run   Status  Findings      Checked     Trigger  Started',
      '1674  fail    1 findings    23 objects  push     2026-09-17T22:42:00.903Z',
      '402   fail    0 findings    0 objects   manual   2026-09-14T22:18:47.148Z',
    ])
  })

  it('renders resolved settings compactly and treats an empty map as none', () => {
    // Sorted by name, whatever order the platform sent them in.
    expect(policySettings(JSON.parse('{"except_tags":["public"],"api_groups":["lab","incidents"]}'))).to.equal('settings: api_groups=[lab, incidents], except_tags=[public]')
    expect(policySettings(JSON.parse('{"api_groups":["lab","incidents"],"except_tags":["public"]}'))).to.equal('settings: api_groups=[lab, incidents], except_tags=[public]')
    expect(policySettings({follow_addons: false, table_selector: {has_field: 'employee_id'}})).to.equal('settings: follow_addons=false, table_selector={"has_field":"employee_id"}')
    // PHP spells an empty map `[]`.
    for (const empty of [{}, [], undefined, null]) expect(policySettings(empty)).to.equal('')
  })

  it('reports what a run recorded, and nothing for a run that evaluated no policy', () => {
    const rule = {check: 'query.auth_required', id: 'AUTH-001.R1', label: 'Endpoints require authentication', title: ''}
    const run = {
      id: 1129,
      policies: [{key: 'AUTH-001', rules: [{...rule, params: {api_groups: ['lab'], except_tags: ['public']}}], statement: 'Every endpoint requires authentication unless it is tagged public.'}],
      started_at: '2026-09-17T18:23:09.341Z',
      trigger: 'manual',
    }
    expect(policyRunDetail(run)).to.deep.equal([
      'Run 1129 as recorded (manual, 2026-09-17T18:23:09.341Z):',
      '  AUTH-001  Every endpoint requires authentication unless it is tagged public.',
      '    AUTH-001.R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]',
    ])
    // A rule with nothing configured still ran.
    expect(policyRunDetail({...run, policies: [{key: 'AUTH-001', rules: [{...rule, params: []}], statement: ''}]})).to.deep.equal([
      'Run 1129 as recorded (manual, 2026-09-17T18:23:09.341Z):',
      '  AUTH-001',
      '    AUTH-001.R1  Endpoints require authentication  settings: none',
    ])
    expect(policyRunDetail({...run, policies: []})).to.deep.equal([])
    expect(policyRunDetail()).to.deep.equal([])
    // An evaluation this credential could not record has no run to name.
    expect(policyRunDetail({...run, id: 0})[0]).to.equal('This evaluation, which was not stored (manual, 2026-09-17T18:23:09.341Z):')

    // What each rule actually inspected comes from the results, not from the snapshot.
    expect(policyRunDetail({...run, results: [{check_id: 'AUTH-001.R1', checked: 23, policy_key: 'AUTH-001', status: 'pass'}]})[2])
      .to.equal('    AUTH-001.R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]  checked 23')
    expect(policyRunDetail({...run, results: [{check_id: 'AUTH-001.R1', checked: 0, policy_key: 'AUTH-001', status: 'pass'}]})[2])
      .to.equal('    AUTH-001.R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]  no objects checked')
  })

  it('keeps commented policy headers and treats their bodies as opaque source', () => {
    const content = '// policy notes\n// comment\n\npolicy AUTH-001 {\n narrative = "guid = fake"\n}'
    expect(parseDocument(content)).to.deep.equal({content, name: 'AUTH-001', type: 'policy'})
    expect(filterChangedEntries([{content, filePath: 'policies/AUTH-001.xs'}], [{action: 'update', name: 'AUTH-001', type: 'policy'}], false)).to.have.lengthOf(1)
  })

  describe('computeStatusRows', () => {
    const policy = {enforcement: 'mandatory', id: 7, key: 'AUTH-001', latest_run: coverage(), lifecycle: 'active', rules: [{id: 'R1'}], version: 1}
    const run = {
      findings: [{policy_key: 'AUTH-001'}],
      id: 5,
      results: [{check_id: 'R1', checked: 10, policy_key: 'AUTH-001', status: 'fail'}],
    }

    it('reports a current failing run', () => {
      const [row] = computeStatusRows([policy], run)
      expect(row).to.deep.equal({
        blocking: true, checked: 10, counted: true, enforcement: 'mandatory', findings: 1, key: 'AUTH-001', lifecycle: 'active',
        rules_unchecked: 0, stale: false, status: 'fail', title: undefined,
      })
      expect(statusExitCode([row])).to.equal(2)
      expect(statusExitReason([row])).to.equal(
        'The latest run has 1 blocking finding (AUTH-001); the merge gate evaluates the branch again before a merge.')
    })

    it('takes staleness from the platform and carries no counts for a stale policy', () => {
      const [row] = computeStatusRows([{...policy, latest_run: coverage({stale: true, version: 0})}], run)
      expect(row).to.include({checked: 0, counted: false, findings: 0, stale: true, status: 'stale'})
      expect(statusLabel(row)).to.equal('outdated; evaluate again')
      expect(statusExitCode([row])).to.equal(1)
      expect(statusExitReason([row])).to.equal(
        'Evaluation evidence is stale, missing or errored (AUTH-001 outdated; evaluate again); exit 1.')
    })

    it('calls a policy the run did not evaluate not evaluated, not stale', () => {
      const [row] = computeStatusRows([{...policy, latest_run: coverage({enforcement: null, included: false, version: null})}], run)
      expect(row).to.include({counted: false, findings: 0, stale: false, status: 'not_evaluated'})
      expect(statusExitCode([row])).to.equal(1)
      const [none] = computeStatusRows([{...policy, latest_run: coverage({enforcement: null, included: false, run_id: 0, version: null})}])
      expect(none).to.include({counted: false, stale: false, status: 'not_evaluated'})
    })

    it('never counts a draft, and never lets its old evidence fail CI', () => {
      for (const latest of [coverage({stale: true, version: 0}), coverage({enforcement: null, included: false, version: null})]) {
        const [row] = computeStatusRows([{...policy, latest_run: latest, lifecycle: 'draft'}], run)
        expect(row).to.include({checked: 0, counted: false, findings: 0, status: 'draft'})
        expect(statusExitCode([row])).to.equal(0)
        expect(statusExitReason([row])).to.equal(null)
      }
    })

    it('distinguishes error, partial, empty-coverage and advisory outcomes', () => {
      const rules = [{id: 'R1'}, {id: 'R2'}]
      const rows = (results: Array<ReturnType<typeof result>>) => computeStatusRows([{...policy, rules}], {...run, findings: [], results})
      expect(rows([result('error')])[0].status).to.equal('error')
      expect(rows([result('pass')])[0].status).to.equal('not_evaluated')
      expect(rows([result('pass', 0), {...result('pass', 0), check_id: 'R2'}])[0].status).to.equal('no_objects_checked')
      expect(rows([result('pass'), {...result('pass'), check_id: 'R2'}])[0].status).to.equal('pass')
      expect(computeStatusRows([{...policy, rules: []}], {...run, results: []})[0].status).to.equal('no_checks')
      const advisory = {...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}
      expect(statusExitCode(computeStatusRows([advisory], run))).to.equal(0)
      expect(statusExitReason(computeStatusRows([advisory], run))).to.equal(null)
    })

    it('says a policy passed on rules that inspected nothing, rather than just "pass"', () => {
      const rules = [{id: 'R1'}, {id: 'R2'}]
      const results = [result('pass', 7), {...result('pass', 0), check_id: 'R2'}]
      const [row] = computeStatusRows([{...policy, rules}], {...run, findings: [], results})
      // The nonzero total hides the rule that reached nothing; the row counts it separately.
      expect(row).to.include({rules_unchecked: 1, status: 'pass'})
      expect(statusLabel(row)).to.equal('pass; 1 rule no objects checked')
      expect(statusExitCode([row])).to.equal(0)
      const both = [{...result('pass', 0)}, {...result('pass', 0), check_id: 'R2'}]
      expect(computeStatusRows([{...policy, rules}], {...run, findings: [], results: both})[0])
        .to.include({rules_unchecked: 0, status: 'no_objects_checked'})
    })

    it('names every policy behind a CI failure, and the blocking finding count', () => {
      const second = {...policy, id: 8, key: 'SEC-100'}
      const rows = computeStatusRows([policy, second], {
        ...run,
        findings: [{policy_key: 'AUTH-001'}, {policy_key: 'SEC-100'}, {policy_key: 'SEC-100'}],
        results: [...run.results, {check_id: 'R1', checked: 4, policy_key: 'SEC-100', status: 'fail'}],
      })
      expect(statusExitCode(rows)).to.equal(2)
      expect(statusExitReason(rows)).to.equal(
        'The latest run has 3 blocking findings (AUTH-001, SEC-100); the merge gate evaluates the branch again before a merge.')
      // Unreliable evidence outranks findings, exactly as the exit code does.
      const unchecked = coverage({enforcement: null, included: false, run_id: 0, version: null})
      const stale = computeStatusRows([policy, second].map((each) => ({...each, latest_run: unchecked})))
      expect(statusExitCode(stale)).to.equal(1)
      expect(statusExitReason(stale)).to.equal(
        'Evaluation evidence is stale, missing or errored (AUTH-001 not evaluated, SEC-100 not evaluated); exit 1.')
      expect(statusExitReason([])).to.equal(null)
    })

    it("words enforcement as Studio does, and calls findings blocking only as the run judged them", () => {
      expect(enforcementLabel('mandatory')).to.equal('Mandatory')
      expect(enforcementLabel('advisory')).to.equal('Advisory')
      expect(enforcementLabel('')).to.equal('—')
      expect(enforcementLabel('conditional')).to.equal('conditional')
      const [blocking] = computeStatusRows([policy], run)
      expect(findingsLabel(blocking)).to.equal('1 findings (blocking)')
      // The run evaluated the policy as advisory: its findings do not block, whatever the row says today.
      const [advisory] = computeStatusRows([{...policy, latest_run: coverage({enforcement: 'advisory'})}], run)
      expect(advisory).to.include({blocking: false, findings: 1})
      expect(findingsLabel(advisory)).to.equal('1 findings')
      const [draft] = computeStatusRows([{...policy, lifecycle: 'draft'}], run)
      expect(draft).to.include({blocking: false})
      expect(findingsLabel(draft)).to.equal('— findings')
    })
  })
})
