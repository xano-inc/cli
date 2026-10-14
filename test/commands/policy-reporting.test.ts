import {Config} from '@oclif/core'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

const source = 'policy AUTH-001 { title = "Auth" }'
const checks = [{
  description: 'Find forbidden statements at any nesting depth.',
  id: 'stack.statement_forbidden',
  label: 'Stacks exclude listed statements',
  object_kinds: ['query', 'function'],
  params: {object_kinds: {required: false, type: 'string[]'}, statements: {required: true, type: 'string[]'}},
}, {description: 'Check authentication tables.', fix_hint: 'Enable auth.', id: 'table.auth_table_rules', label: 'Endpoints use the single auth table', object_kinds: ['table'], params: []}]
const catalogue = {items: checks, templates: []}
const backendError = {
  code: 'ERROR_CODE_SYNTAX_ERROR',
  message: 'Invalid block: enforcement',
  payload: {col: 3, error_snippet: 'enforcement = "advisory"', line: 22, stack: ['/internal/nested.php']},
  stack: '#0 /internal/Stack.php',
  trace: ['file: /internal/Schema.php(444)', 'credential test-token'],
  traceId: 'private-trace-id',
}
const coverage = (overrides: Record<string, unknown> = {}) =>
  ({enforcement: 'blocking', included: true, run_id: 1129, stale: false, version: 1, ...overrides})
const policy = {active: true, enforcement: 'blocking', id: 7, key: 'AUTH-001', latest_run: coverage(), rules: [{id: 'R1'}], version: 1}
const staleCoverage = coverage({stale: true, version: 0})
const notInRun = coverage({enforcement: null, included: false, version: null})
const noRun = coverage({enforcement: null, included: false, run_id: 0, version: null})
const snapshot = [{
  key: 'AUTH-001',
  rules: [{check: 'object.auth_required', id: 'R1', label: 'Endpoints require authentication', params: {api_groups: ['lab'], except_tags: ['public']}, title: ''}],
  statement: 'Every endpoint requires authentication unless it is tagged public.',
}]
const run = {
  findings: [{policy_key: 'AUTH-001'}],
  id: 1129,
  results: [{check_id: 'R1', checked: 10, message: '', policy_key: 'AUTH-001', status: 'fail'}],
  started_at: 2000,
}
const detailRun = {...run, policies: snapshot, trigger: 'manual'}

describe('policy reporting', () => {
  const fixture = policyFixture({branch: 'profile-branch', source, workspace: '3'})

  /** The list serves `current`; the run its `latest_run` names is `latest`. */
  function statusRoute(current: Record<string, unknown> = policy, latest: Record<string, unknown> = run): void {
    fixture.route((url) => url.pathname.includes('/run/') ? json(latest) : json({items: [current]}))
  }

  function command(action: string, flags: string[] = []) {
    const args = action.split(' ')
    if (['parse', 'publish'].includes(args[1])) args.push('-f', path.join(fixture.directory, 'policy.xs'))
    if (args[0] === 'workspace') args.push('-d', fixture.directory)
    if (action === 'workspace push') args.push('--force', '--no-guids')
    return runCommand([...args, ...flags], fixture.config)
  }

  it('catalogue renders readable columns, each check named by its label', async () => {
    fixture.route(() => json(catalogue))
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    for (const text of ['Check ID', 'Label / Description', 'Object kinds', 'Required params', 'query, function', 'statements: string[]', 'Check authentication tables.', 'Fix hint: Enable auth.'])
      expect(result.stdout).to.contain(text)
    for (const check of checks) expect(result.stdout.split('\n').find(line => line.startsWith(check.id))).to.contain(check.label)
    expect(result.stdout).not.to.contain('"required":').and.not.to.contain('object_kinds: string[]')
  })

  it('catalogue names the params a rule must set one of', async () => {
    fixture.route(() => json({items: [{
      description: 'Bound a param.', id: 'statement.param_bound', label: 'Statement params stay in bounds', object_kinds: ['query'],
      params: {max: {type: 'number'}, min: {type: 'number'}}, requires_one_of: ['min', 'max'],
    }], templates: []}))
    const result = await command('policy catalogue')
    expect(result.stdout.split('\n').find(line => line.startsWith('statement.param_bound'))).to.contain('one of: min | max')
    expect(result.stdout).not.to.contain('  none')
  })

  it('catalogue lists the templates under their category labels, in the order the catalogue lists the categories', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    fixture.route(() => json({items: checks, template_categories: [
      {id: 'access_control', label: 'Access control'}, {id: 'secrets', label: 'Secrets'}, {id: 'testing', label: 'Testing'},
    ], templates: [
      {category: 'testing', id: 'endpoints_have_tests', key: 'CHG-001', rules: [rule, rule], severity: 'low', summary: '', title: 'Endpoints are tested'},
      {category: 'access_control', id: 'endpoints_need_login', key: 'AUTH-010', rules: [rule], severity: 'critical', summary: '', title: 'Endpoints require login'},
      {category: 'access_control', id: 'one_auth_table', key: 'AUTH-050', rules: [rule], severity: 'medium', summary: '', title: 'Users sign in through one auth table'},
      {category: 'future_group', id: 'newer', key: 'N-001', rules: [rule], severity: 'low', summary: '', title: 'From a newer instance'},
      {id: 'uncategorized', key: 'X-001', rules: [rule], severity: 'low', summary: '', title: 'From an older instance'},
    ]}))
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    const all = result.stdout.split('\n')
    // The index at the head names the templates too; the list itself follows the checks.
    const lines = all.slice(all.indexOf('Templates (xano policy create --template <id>):'))
    const at = (text: string) => lines.findIndex(line => line.includes(text))
    expect(all.indexOf('Templates (xano policy create --template <id>):')).to.be.greaterThan(all.findIndex(line => line.startsWith('stack.statement_forbidden')))
    expect(lines.filter(line => line === 'Access control')).to.have.length(1)
    expect(lines).not.to.include('Secrets')
    expect(at('Access control')).to.be.lessThan(at('endpoints_need_login'))
    expect(at('endpoints_need_login')).to.be.lessThan(at('one_auth_table'))
    expect(at('one_auth_table')).to.be.lessThan(lines.indexOf('Testing'))
    expect(lines[at('endpoints_have_tests')]).to.contain('Endpoints are tested (CHG-001, low, 2 rules)')
    expect(at('newer')).to.be.greaterThan(lines.indexOf('future_group'))
    expect(at('uncategorized')).to.be.greaterThan(lines.indexOf('Other'))
  })

  it('catalogue tags templates with their framework labels and prints the served note once, under the heading', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    const note = 'Framework tags point to templates on related topics. They don\'t make a workspace compliant, and Xano doesn\'t track changes to these frameworks.'
    fixture.route(() => json({items: checks, template_categories: [{id: 'access_control', label: 'Access control'}], template_frameworks: [
      {id: 'soc2', label: 'SOC 2'}, {id: 'hipaa', label: 'HIPAA'},
    ], template_frameworks_note: note, templates: [
      {category: 'access_control', frameworks: ['soc2', 'hipaa'], id: 'endpoints_need_login', key: 'AUTH-010', rules: [rule], severity: 'critical', summary: '', title: 'Endpoints require login'},
      {category: 'access_control', frameworks: [], id: 'one_auth_table', key: 'AUTH-050', rules: [rule], severity: 'medium', summary: '', title: 'Users sign in through one auth table'},
      {category: 'access_control', frameworks: ['newer'], id: 'tagged_later', key: 'N-001', rules: [rule], severity: 'low', summary: '', title: 'Tagged by a newer instance'},
    ]}))
    const all = (await command('policy catalogue')).stdout.split('\n')
    const lines = all.slice(all.indexOf('Templates (xano policy create --template <id>):'))
    const heading = 0
    expect(lines[heading + 1]).to.equal(note)
    expect(lines.filter(line => line === note)).to.have.length(1)
    expect(lines.find(line => line.includes('endpoints_need_login'))).to.match(/\(AUTH-010, critical, 1 rule\) \[SOC 2, HIPAA\]$/)
    expect(lines.find(line => line.includes('one_auth_table'))).to.match(/\(AUTH-050, medium, 1 rule\)$/)
    expect(lines.find(line => line.includes('tagged_later'))).to.match(/\[newer\]$/)
  })

  it('catalogue shows each template\'s rules: number, title and check, preset params, and what to fill with its needs_any group as one choice', async () => {
    fixture.route(() => json({items: checks, templates: [
      {category: 'access_control', id: 'admin_endpoints_check_role', key: 'AUTH-002', rules: [{check: 'object.statement_required', needs: ['functions', 'tags', 'paths'], needs_any: ['tags', 'paths'], params: {placement: 'first'}, title: 'Admin endpoints call the role check first'}], severity: 'critical', summary: '', title: 'Admin endpoints check the caller\'s role'},
      {category: 'integrations', id: 'approved_vendors_only', key: 'VND-001', rules: [{check: 'outbound.vendor_allowlist', needs: ['hosts', 'providers'], needs_any: ['hosts', 'providers'], params: [], title: ''}], severity: 'high', summary: '', title: 'Data only goes to approved vendors'},
      {category: 'data_protection', id: 'retained_data_has_age_limit', key: 'RET-003', rules: [{check: 'table.coverage_required', needs: ['tags', 'referenced_by.max_age_days'], needs_any: [], params: {referenced_by: {object_kinds: ['task']}}, title: ''}, {check: 'object.naming', needs: [], params: {}, title: ''}], severity: 'medium', summary: '', title: 'Retained data is deleted after a set number of days'},
    ]}))
    const lines = (await command('policy catalogue')).stdout.split('\n')
    const row = (id: string) => lines.findIndex(line => line.startsWith(`  ${id} `))
    expect(lines.slice(row('admin_endpoints_check_role') + 1, row('admin_endpoints_check_role') + 4)).to.deep.equal([
      '      1. Admin endpoints call the role check first: object.statement_required',
      '         {"placement":"first"}',
      '         Fill: functions, and tags or paths',
    ])
    expect(lines.slice(row('approved_vendors_only') + 1, row('approved_vendors_only') + 4)).to.deep.equal([
      '      1. outbound.vendor_allowlist', '         {}', '         Fill: hosts or providers',
    ])
    expect(lines.slice(row('retained_data_has_age_limit') + 1, row('retained_data_has_age_limit') + 6)).to.deep.equal([
      '      1. table.coverage_required', '         {"referenced_by":{"object_kinds":["task"]}}', '         Fill: tags, referenced_by.max_age_days',
      '      2. object.naming', '         {}',
    ])
  })

  it('catalogue opens with an index by category, an example policy file and the scope fields as the catalogue words them', async () => {
    const paths = 'Endpoints whose path inside their API group starts with any listed path, compared segment by segment.'
    fixture.route(() => json({...recipeCatalogue, items: [
      {category: 'authentication', id: 'object.auth_required', label: 'Endpoints require login', params: {paths: {description: paths, type: 'string[]'}, tags: {description: 'Objects with a listed tag.', type: 'string[]'}}, scope_fields: [{name: 'tags'}, {name: 'paths'}]},
      {category: 'structure', id: 'object.statement_required', label: 'Objects call a statement', params: {tags: {type: 'string[]'}}, scope_fields: [{name: 'tags'}]},
      {id: 'from.older_instance', label: 'No category', params: {}},
    ], template_categories: [{id: 'integrations', label: 'Integrations'}]}))
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    const lines = result.stdout.split('\n')
    expect(lines.slice(0, 10)).to.deep.equal([
      'Index (each entry is detailed below):',
      '  Checks by category (xano policy catalogue --check <id>):',
      '    authentication: object.auth_required',
      '    structure: object.statement_required',
      '    other: from.older_instance',
      '  Templates by category (xano policy catalogue --template <id>):',
      '    Integrations: approved_vendors_only',
      '  Recipes (xano policy catalogue --recipe <id>):',
      '    protect_card_data, ai_cost_and_agent_safety',
      '  What no check can see: 2 topics, at the end.',
    ])
    const example = lines.findIndex(line => line.startsWith('A policy file'))
    expect(lines.slice(example + 2, example + 4)).to.deep.equal(['  policy "AUTH-010" {', '    title = "Admin endpoints check the caller\'s role"'])
    expect(lines).to.include('        paths: ["admin"]')
    const scope = lines.findIndex(line => line.startsWith('Scope fields'))
    expect(scope).to.be.greaterThan(example)
    expect(lines.slice(scope + 1, scope + 7)).to.deep.equal([
      '', '  tags', '    Objects with a listed tag.', '', '  paths', `    ${paths}`,
    ])
    expect(lines.findIndex(line => line.startsWith('Check ID'))).to.be.greaterThan(scope)
  })

  it('catalogue head says what severity and enforcement take and do, as the served document words them', async () => {
    const document = {fields: {
      enforcement: {default: 'advisory', description: 'Advisory reports. Blocking stops a gated change.', type: 'string', values: ['advisory', 'blocking']},
      severity: {default: 'medium', description: 'Orders findings; never blocks.', type: 'string', values: ['critical', 'high', 'medium', 'low']},
    }}
    fixture.route(() => json({...catalogue, document}))
    const served = (await command('policy catalogue')).stdout
    expect(served).to.contain('severity is "critical", "high", "medium" (default) or "low". Orders findings; never blocks.')
    expect(served).to.contain('enforcement is "advisory" (default) or "blocking". Advisory reports. Blocking stops a gated change.')
    // An instance that serves no document gets the offline copy, worded as the platform words it.
    fixture.route(() => json(catalogue))
    const offline = (await command('policy catalogue')).stdout.replaceAll('\n', ' ')
    expect(offline).to.contain('severity is "critical", "high", "medium" (default) or "low". How much a violation')
    expect(offline).to.contain('enforcement is "advisory" (default) or "blocking". An advisory policy only reports its findings.')
      .and.to.contain('a merge, a set-live, a publish or push to the live branch, an archive import or a tenant deploy')
  })

  it('catalogue lists each check\'s own params with type, default, example and description, an object param\'s parts by dotted path, and its scope fields by name', async () => {
    const coverage = {
      category: 'coverage', description: 'Tables are covered.', id: 'table.coverage_required', label: 'Tables are referenced by a required object', object_kinds: ['table'],
      params: {
        placement: {default: 'any', description: 'Where the match counts.', example: 'first', type: 'string', values: ['any', 'first']},
        referenced_by: {default: [], description: 'Objects that provide coverage.', example: {object_kinds: ['task']}, properties: {
          age_field: {description: 'The field a row\'s age is measured from; default created_at.', example: 'expires_at', type: 'string'},
          max_age_days: {description: 'Delete rows older than this.', example: 730, minimum: 1, type: 'integer'},
        }, required: false, type: 'object'},
        tags: {description: 'Objects with a listed tag.', type: 'string[]'},
      },
      scope_fields: [{name: 'tags'}],
      uses: [{goal: 'Logs go after two years.', params: {referenced_by: {max_age_days: 730}}}],
    }
    fixture.route(() => json({items: [coverage, checks[1]], templates: []}))
    const lines = (await command('policy catalogue', ['--check', 'table.coverage_required'])).stdout.split('\n')
    const params = lines.indexOf('  Params:')
    expect(params).to.be.greaterThan(0)
    expect(lines.slice(params, params + 8)).to.deep.equal([
      '  Params:',
      // A head longer than 60 characters puts the description under it.
      '    placement (string, one of: "any" | "first", default "any", e.g. "first"):',
      '      Where the match counts.',
      '    referenced_by (object, e.g. {"object_kinds":["task"]}): Objects that provide coverage.',
      '    referenced_by.age_field (string, e.g. "expires_at"): The field a row\'s age is measured from; default created_at.',
      '    referenced_by.max_age_days (integer, min 1, e.g. 730): Delete rows older than this.',
      '  Scope fields: tags',
      '  Use: Logs go after two years.',
    ])
    expect(lines.join('\n')).not.to.contain('    tags (')
    // A check with no params of its own and no scope fields adds nothing.
    const plain = (await command('policy catalogue', ['--check', 'table.auth_table_rules'])).stdout
    expect(plain).not.to.contain('Params:').and.not.to.contain('Scope fields:')
  })

  const templateCatalogue = {
    items: [{...checks[0], params: {...checks[0].params, statements: {example: ['db.del'], required: true, type: 'string[]'}}}],
    recipes: [{id: 'protect_card_data', templates: ['retained_data_has_age_limit'], title: 'Protect payment card data'}],
    template_categories: [{id: 'data_protection', label: 'Data protection'}],
    template_frameworks: [{id: 'gdpr', label: 'GDPR'}],
    template_frameworks_note: 'Tags point to related topics.',
    templates: [
      {
        category: 'data_protection', examples: {'referenced_by.max_age_days': 730, tags: ['retained']}, frameworks: ['gdpr'], id: 'retained_data_has_age_limit', key: 'RET-003',
        limits: 'Reads the cutoff each cleanup task\'s delete filters on.',
        rules: [{check: 'table.coverage_required', needs: ['tags', 'referenced_by.max_age_days'], needs_any: [], params: {referenced_by: {object_kinds: ['task']}}, title: 'Retained rows are deleted once they are too old'}],
        severity: 'medium', summary: 'Every retained table is cleaned up by a task.', title: 'Retained data is deleted after a set number of days',
      },
      {
        category: 'access_control', examples: {functions: ['require_admin']}, id: 'admin_endpoints_check_role', key: 'AUTH-002',
        rules: [
          {check: 'object.statement_required', needs: ['functions', 'tags', 'paths'], needs_any: ['tags', 'paths'], params: {placement: 'first'}, title: ''},
          {check: 'stack.statement_forbidden', needs: ['statements'], needs_any: [], params: {}, title: ''},
        ],
        severity: 'critical', summary: '', title: 'Admin endpoints check the caller\'s role',
      },
    ],
  }

  it('catalogue --template narrows both output modes to the one template: its statement, rules, examples, what it cannot see and the create command', async () => {
    fixture.route(() => json(templateCatalogue))
    const summary = await command('policy catalogue', ['--template', 'retained_data_has_age_limit'])
    expect(summary.error).to.equal(undefined)
    const lines = summary.stdout.split('\n')
    const row = lines.indexOf('  retained_data_has_age_limit  Retained data is deleted after a set number of days (RET-003, medium, 1 rule) [GDPR]')
    expect(row).to.be.greaterThan(0)
    expect(lines).to.include('Tags point to related topics.').and.to.include('Data protection')
    expect(lines.slice(row + 1, row + 12)).to.deep.equal([
      '    Statement: Every retained table is cleaned up by a task.',
      '    Severity medium; a policy created from it starts active and advisory.',
      '    Rules:',
      '      1. Retained rows are deleted once they are too old: table.coverage_required',
      '         {"referenced_by":{"object_kinds":["task"]}}',
      '         Fill: tags, referenced_by.max_age_days',
      '    Examples: referenced_by.max_age_days=730, tags=["retained"]',
      '    Cannot see: Reads the cutoff each cleanup task\'s delete filters on.',
      '    Create it (edit the example values):',
      `      xano policy create --template retained_data_has_age_limit --param 'tags=["retained"]' --param 'referenced_by.max_age_days=730'`,
      '',
    ])
    expect(summary.stdout).not.to.contain('admin_endpoints_check_role').and.not.to.contain('Index (').and.not.to.contain('Check ID')
    const asJson = await command('policy catalogue', ['--template', 'retained_data_has_age_limit', '-o', 'json'])
    expect(JSON.parse(asJson.stdout)).to.deep.equal([templateCatalogue.templates[0]])
  })

  it('catalogue --template numbers a multi-rule template\'s params, takes the first of a needs_any group and the check\'s example where the template gives none', async () => {
    fixture.route(() => json(templateCatalogue))
    const {stdout} = await command('policy catalogue', ['--template', 'admin_endpoints_check_role'])
    expect(stdout).to.contain(`      xano policy create --template admin_endpoints_check_role --param '1.functions=["require_admin"]' --param '1.tags=<JSON>' --param '2.statements=["db.del"]'\n`)
    expect(stdout).to.contain('    Examples: functions=["require_admin"]\n')
    expect(stdout, 'a template with no summary has no statement line').not.to.contain('Statement:')
  })

  it('catalogue --template names the near miss, points a recipe or check id at its own flag, and is exclusive with --check and --recipe', async () => {
    fixture.route(() => json(templateCatalogue))
    const near = await command('policy catalogue', ['--template', 'retained_data'])
    expect(near.error?.message).to.contain('"retained_data" is not a template. Did you mean retained_data_has_age_limit?')
    expect(near.stdout).to.equal('')
    const recipe = await command('policy catalogue', ['--template', 'protect_card_data'])
    expect(recipe.error?.message).to.contain('"protect_card_data" is not a template; it is a recipe: run `xano policy catalogue --recipe protect_card_data`.')
    const check = await command('policy catalogue', ['--recipe', 'stack.statement_forbidden'])
    expect(check.error?.message).to.contain('"stack.statement_forbidden" is not a recipe; it is a policy check: run `xano policy catalogue --check stack.statement_forbidden`.')
    const withCheck = await command('policy catalogue', ['--template', 'retained_data_has_age_limit', '--check', 'stack.statement_forbidden'])
    expect(withCheck.error?.message).to.contain('cannot also be provided')
    const withRecipe = await command('policy catalogue', ['--template', 'retained_data_has_age_limit', '--recipe', 'protect_card_data'])
    expect(withRecipe.error?.message).to.contain('cannot also be provided')
  })

  it('catalogue --check prints only the check, without the index or the example', async () => {
    fixture.route(() => json(recipeCatalogue))
    const {stdout} = await command('policy catalogue', ['--check', 'stack.statement_forbidden'])
    expect(stdout).not.to.contain('Index (').and.not.to.contain('A policy file').and.not.to.contain('Scope fields')
  })

  it('parse --help shows a policy file with its indentation kept', async () => {
    // Help rewrites the command ids of the config it is given, so it gets one of its own.
    const {stdout} = await runCommand(['policy', 'parse', '--help'], await Config.load({root: process.cwd()}))
    const lines = stdout.split('\n')
    const section = lines.indexOf('POLICY FILE')
    expect(section).to.be.greaterThan(lines.indexOf('DESCRIPTION'))
    expect(lines).to.include('    policy "AUTH-010" {').and.to.include('      rule {').and.to.include('          paths: ["admin"]')
  })

  it('catalogue prints no framework note when no template carries a tag', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    fixture.route(() => json({items: checks, template_frameworks: [{id: 'soc2', label: 'SOC 2'}], template_frameworks_note: 'A note.', templates: [
      {category: 'access_control', frameworks: [], id: 'one_auth_table', key: 'AUTH-050', rules: [rule], severity: 'medium', summary: '', title: 'Users sign in through one auth table'},
    ]}))
    expect((await command('policy catalogue')).stdout).not.to.contain('A note.')
  })

  it('catalogue shows no framework tags when the instance serves no note to show with them', async () => {
    const rule = {check: 'object.auth_required', needs: [], params: {}, title: ''}
    fixture.route(() => json({items: checks, template_frameworks: [{id: 'soc2', label: 'SOC 2'}], templates: [
      {category: 'access_control', frameworks: ['soc2'], id: 'endpoints_need_login', key: 'AUTH-010', rules: [rule], severity: 'critical', summary: '', title: 'Endpoints require login'},
    ]}))
    const {stdout} = await command('policy catalogue')
    expect(stdout.split('\n').find(line => line.startsWith('  endpoints_need_login'))).to.match(/\(AUTH-010, critical, 1 rule\)$/)
    expect(stdout).not.to.contain('SOC 2')
  })

  it('catalogue prints no template section when the instance serves none', async () => {
    fixture.route(() => json(catalogue))
    expect((await command('policy catalogue')).stdout).not.to.contain('Templates')
  })

  it('catalogue JSON is the native body', async () => {
    fixture.route(() => json(catalogue))
    const result = await command('policy catalogue', ['-o', 'json'])
    expect(JSON.parse(result.stdout)).to.deep.equal(catalogue)
  })

  it('catalogue --check narrows both output modes to the one check', async () => {
    fixture.route(() => json(catalogue))
    const summary = await command('policy catalogue', ['--check', 'table.auth_table_rules'])
    expect(summary.stdout).to.contain('table.auth_table_rules').and.not.to.contain('stack.statement_forbidden')
    const asJson = await command('policy catalogue', ['--check', 'table.auth_table_rules', '-o', 'json'])
    expect(JSON.parse(asJson.stdout)).to.deep.equal([checks[1]])
  })

  it('catalogue --check names the near miss, or where the list is', async () => {
    fixture.route(() => json(catalogue))
    const near = await command('policy catalogue', ['--check', 'table.auth_table_rule'])
    expect(near.error?.message).to.contain('Did you mean table.auth_table_rules?')
    expect(near.stdout).to.equal('')
    const far = await command('policy catalogue', ['--check', 'totally.unrelated'])
    expect(far.error?.message).to.contain('Run `xano policy catalogue` for the full list.')
  })

  it('catalogue wraps long descriptions instead of truncating them', async () => {
    fixture.route(() => json({items: [{...checks[0], description: 'Inspect every nested statement. '.repeat(8)}], templates: []}))
    const result = await command('policy catalogue')
    expect(result.stdout.match(/Inspect/g)).to.have.length(8)
    expect(result.stdout.split('\n').every(line => line.length <= 144)).to.equal(true)
  })

  it('catalogue lists each check\'s uses under its row: the goal, its params as one line of JSON, and its note', async () => {
    const uses = [
      {goal: 'Endpoints that touch invoices require login.', note: 'tables judges the endpoints reaching the tables the user names.', params: {tables: ['invoices']}},
      {goal: 'Every endpoint requires login.', params: []},
    ]
    fixture.route(() => json({items: [{...checks[1], uses}, checks[0]], templates: []}))
    const lines = (await command('policy catalogue')).stdout.split('\n')
    const row = lines.findIndex(line => line.startsWith('table.auth_table_rules'))
    const use = lines.indexOf('  Use: Endpoints that touch invoices require login.')
    expect(use).to.be.greaterThan(row)
    expect(lines[use + 1]).to.equal('       {"tables":["invoices"]}')
    expect(lines[use + 2]).to.equal('       Note: tables judges the endpoints reaching the tables the user names.')
    expect(lines[use + 3]).to.equal('  Use: Every endpoint requires login.')
    expect(lines[use + 4]).to.equal('       {}')
    expect(lines[use + 5]).to.match(/^stack\.statement_forbidden/)
  })

  const recipeCatalogue = {
    items: checks,
    not_checkable: [
      {id: 'people_and_training', keywords: ['training'], topic: 'People and training', why: 'Policies read object definitions only.'},
      {id: 'spend_caps', keywords: ['cost'], topic: 'Spend caps', why: 'No check reads what AI calls cost yet.'},
    ],
    recipes: [{
      builds: [
        {fills: ['approved_vendors_only.providers'], kind: 'function', name: 'charge_card', role: 'Sends the card to the processor and keeps only its token.'},
        {kind: 'field_attribute', name: 'sensitive', role: 'Set on each card field.'},
      ],
      frameworks: ['pci_dss'], id: 'protect_card_data', keywords: ['card'], limits: ['people_and_training', 'retired_topic'],
      rules: [{check: 'table.field_attribute_required', needs: [], params: {field_names: ['card_number'], forbidden: true}, title: 'Card numbers are never stored'}],
      summary: 'No table stores a card number.', templates: ['approved_vendors_only', 'from_a_newer_instance'], title: 'Protect payment card data',
      user_fills: ['approved_vendors_only.hosts', 'rules[0].field_names'],
    }, {
      builds: [], frameworks: [], id: 'ai_cost_and_agent_safety', keywords: ['ai'], limits: ['spend_caps'],
      rules: [{check: 'stack.statement_order', needs: ['before.functions'], params: {after: ['db.del']}, title: 'Deletes wait for an approval check'}],
      summary: 'AI calls stay out of loops.', templates: [], title: 'Keep AI calls affordable and agents safe', user_fills: [],
    }],
    template_frameworks: [{id: 'pci_dss', label: 'PCI DSS'}],
    template_frameworks_note: 'Tags point to related topics.',
    templates: [{category: 'integrations', frameworks: [], id: 'approved_vendors_only', key: 'VND-001', rules: [{check: 'outbound.vendor_allowlist', needs: [], params: {}, title: ''}], severity: 'high', summary: '', title: 'Data only goes to approved vendors'}],
  }

  it('catalogue lists the recipes after the templates: tags, what to build, what you fill, templates in order, rules and limits by topic', async () => {
    fixture.route(() => json(recipeCatalogue))
    const result = await command('policy catalogue')
    expect(result.error).to.equal(undefined)
    const lines = result.stdout.split('\n')
    const heading = lines.findIndex(line => line.startsWith('Recipes ('))
    expect(heading).to.be.greaterThan(lines.findIndex(line => line.startsWith('Templates (')))
    expect(lines[heading]).to.contain('nothing creates a recipe: build its objects')
    expect(lines[heading + 1]).to.equal('Tags point to related topics.')
    const recipe = lines.indexOf('  protect_card_data  Protect payment card data [PCI DSS]')
    expect(recipe).to.be.greaterThan(heading)
    expect(lines.slice(recipe + 1, recipe + 17)).to.deep.equal([
      '    No table stores a card number.',
      '    Build (the enforcement; the rules point at it):',
      '      - function charge_card: Sends the card to the processor and keeps only its token.',
      '        Fills: approved_vendors_only.providers',
      '      - field_attribute sensitive: Set on each card field.',
      '    You fill in: approved_vendors_only.hosts, rules[0].field_names',
      '    Templates, in order (xano policy create --template <id>, one policy each):',
      '      1. approved_vendors_only  Data only goes to approved vendors (VND-001)',
      '      2. from_a_newer_instance',
      '    Rules no template covers, together in one policy of your own:',
      '      rules[0] Card numbers are never stored: table.field_attribute_required',
      '        {"field_names":["card_number"],"forbidden":true}',
      '    No rule here can see: People and training; retired_topic.',
      '',
      '  ai_cost_and_agent_safety  Keep AI calls affordable and agents safe',
      '    AI calls stay out of loops.',
    ])
    expect(lines).to.include('        Needs: before.functions')
    expect(result.stdout).not.to.contain('First:')
    expect(lines).to.include('    No rule here can see: Spend caps.')
  })

  it('catalogue ends with what no check can see, each topic by id with why', async () => {
    fixture.route(() => json(recipeCatalogue))
    const lines = (await command('policy catalogue')).stdout.trimEnd().split('\n')
    const heading = lines.findIndex(line => line.startsWith('What no check can see'))
    expect(heading).to.be.greaterThan(lines.findIndex(line => line.startsWith('Recipes (')))
    expect(lines.slice(heading + 1)).to.deep.equal([
      '', '  people_and_training  People and training', '    Policies read object definitions only.',
      '', '  spend_caps  Spend caps', '    No check reads what AI calls cost yet.',
    ])
  })

  it('catalogue shows no recipe framework tags without the served note', async () => {
    fixture.route(() => json({...recipeCatalogue, template_frameworks_note: undefined}))
    const {stdout} = await command('policy catalogue')
    expect(stdout).to.contain('  protect_card_data  Protect payment card data\n').and.not.to.contain('PCI DSS')
  })

  it('catalogue prints no recipe or not-checkable section when the instance serves none', async () => {
    fixture.route(() => json(catalogue))
    const {stdout} = await command('policy catalogue')
    expect(stdout).not.to.contain('Recipes').and.not.to.contain('What no check can see')
  })

  it('catalogue --recipe narrows both output modes to the one recipe, the summary with the topics it cannot see', async () => {
    fixture.route(() => json(recipeCatalogue))
    const summary = await command('policy catalogue', ['--recipe', 'ai_cost_and_agent_safety'])
    expect(summary.error).to.equal(undefined)
    expect(summary.stdout).to.contain('ai_cost_and_agent_safety').and.not.to.contain('protect_card_data')
    expect(summary.stdout).not.to.contain('Check ID').and.not.to.contain('Templates (')
    expect(summary.stdout).to.contain('  spend_caps  Spend caps').and.not.to.contain('people_and_training')
    const asJson = await command('policy catalogue', ['--recipe', 'ai_cost_and_agent_safety', '-o', 'json'])
    expect(JSON.parse(asJson.stdout)).to.deep.equal([recipeCatalogue.recipes[1]])
  })

  it('catalogue --recipe names the near miss, and is exclusive with --check', async () => {
    fixture.route(() => json(recipeCatalogue))
    const near = await command('policy catalogue', ['--recipe', 'protect_card'])
    expect(near.error?.message).to.contain('"protect_card" is not a recipe. Did you mean protect_card_data?')
    expect(near.stdout).to.equal('')
    const both = await command('policy catalogue', ['--recipe', 'protect_card_data', '--check', 'table.auth_table_rules'])
    expect(both.error?.message).to.contain('cannot also be provided')
  })

  it('list prints the version beside its activation state, and JSON is the native body', async () => {
    const body = {curPage: 1, items: [{...policy, title: 'Auth', version: 5}], nextPage: null, prevPage: null}
    fixture.route(() => json(body))
    const result = await command('policy list')
    expect(result.stdout).to.contain('AUTH-001  Active, Blocking  Auth (ID: 7, Version 5)')
    expect(JSON.parse((await command('policy list', ['-o', 'json'])).stdout)).to.deep.equal(body)
  })

  it('runs JSON is the native body, like list', async () => {
    const body = {curPage: 1, items: [{counts: {blocking: 1, errors: 0, findings: 1}, id: 1129, objects_checked: 10, started_at: 2000, status: 'fail', trigger: 'manual'}], nextPage: null, prevPage: null}
    fixture.route(() => json(body))
    expect(JSON.parse((await command('policy runs', ['-o', 'json'])).stdout)).to.deep.equal(body)
  })

  it('runs --run-detail without a run id is refused', async () => {
    fixture.route(() => json({items: []}))
    const result = await command('policy runs', ['--run-detail'])
    expect(result.error?.message).to.contain('`xano policy runs <id> --run-detail`')
    expect(fixture.calls).to.have.length(0)
  })

  it('evaluate --run-detail reports what the run it just produced recorded, and only when asked', async () => {
    fixture.route(() => json({...detailRun, policy_check: {blocking: false, findings: [], status: 'pass'}}))
    const detail = await command('policy evaluate', ['--run-detail'])
    expect(detail.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
      .and.to.contain('R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]')
    const plain = await command('policy evaluate')
    expect(plain.stdout).not.to.contain('as recorded').and.not.to.contain('settings:')
  })

  it('evaluate --summary asks for the summary answer and says which run has the findings it leaves out', async () => {
    const findings = Array.from({length: 50}, (_, n) => ({id: `F${n}`, message: 'No auth', object: {name: `GET /x${n}`, type: 'query'}, policy_key: 'AUTH-001', rule_id: 'R1'}))
    const answer = {
      ...detailRun, counts: {advisory: 70, blocking: 0, errors: 0, findings: 70}, findings,
      policy_check: {blocking: false, blocking_finding_ids: [], blocking_total: 0, message: 'Active policies reported findings.', run_id: 1129, status: 'fail'},
      stored: true, total: 70, truncated: true,
    }
    fixture.route(() => json(answer))
    const result = await command('policy evaluate', ['--summary', '--run-detail'])
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({answer: 'summary'})
    expect(result.stdout).to.contain('Policy check: advisory findings (not blocking)\nActive policies reported findings.\nFindings: 70 (0 blocking, 70 advisory)')
    expect(result.stdout).to.contain('Listed: the first 50 of 70; `xano policy runs 1129` has them all.')
    // The summary carries the snapshot, so --run-detail still reports what the run recorded.
    expect(result.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
    expect(JSON.parse((await command('policy evaluate', ['--summary', '-o', 'json'])).stdout)).to.deep.equal(answer)

    // A credential that may read but not write: nothing was stored to read the rest from.
    fixture.route(() => json({...answer, id: 0, policy_check: {...answer.policy_check, run_id: 0}, stored: false}))
    const unstored = await command('policy evaluate', ['--summary'])
    expect(unstored.stdout).to.contain('Listed: the first 50 of 70; this evaluation was not stored, so the rest cannot be listed.')

    // Without the flag an evaluation sends no body and answers the whole run, as before.
    fixture.route(() => json({...detailRun, policy_check: {blocking: false, status: 'pass'}}))
    await command('policy evaluate')
    expect(fixture.calls.at(-1)?.body).to.equal(undefined)
  })

  it('parse summary always shows the severity, medium included, where the platform writes every other; JSON keeps the served source', async () => {
    const canonical = 'policy AUTH-001 {\n  title = "Auth"\n  active = true\n  enforcement = "advisory"\n\n  rule {\n    check = "object.auth_required"\n  }\n}'
    fixture.route(() => json({policy: {active: true, enforcement: 'advisory', key: 'AUTH-001', severity: 'medium'}, rule_warnings: [], source: canonical}))
    const summary = await command('policy parse')
    expect(summary.stdout.split('\n').slice(0, 5)).to.deep.equal(['policy AUTH-001 {', '  title = "Auth"', '  severity = "medium"', '  active = true', '  enforcement = "advisory"'])
    expect(JSON.parse((await command('policy parse', ['-o', 'json'])).stdout).source).to.equal(canonical)
    // A severity the platform already wrote is left as it is.
    const high = canonical.replace('  active', '  severity = "high"\n  active')
    fixture.route(() => json({policy: {key: 'AUTH-001', severity: 'high'}, rule_warnings: [], source: high}))
    expect((await command('policy parse')).stdout.trimEnd()).to.equal(high)
  })

  it('names a rule refused for its name with the platform sentence and where the name is', async () => {
    const message = 'rule[1]: A rule cannot be named. Write "rule {" — rules are identified by position (KEY.R1, KEY.R2…).'
    fixture.route(() => json({code: 'ERROR_CODE_BAD_REQUEST', message, payload: {char: 61, col: 8, error_line: '  rule foo {', error_snippet: 'foo {', line: 5}}, 400))
    const result = await command('policy parse')
    expect(result.error?.message).to.contain(message).and.to.contain('at line 5, col 8:   rule foo {')
  })

  for (const verbose of [false, true]) {
    it(`folds backend traces, verbose=${verbose}`, async () => {
      fixture.route(() => json(backendError, 400))
      const result = await command('policy parse', ['-o', 'json', ...(verbose ? ['-v'] : [])])
      expect(result.error?.message).to.contain('ERROR_CODE_SYNTAX_ERROR: Invalid block: enforcement')
        .and.to.contain('at line 22, col 3: enforcement = "advisory"')
      expect(`${result.error?.message}${result.stdout}`).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
      expect(JSON.parse(result.stdout).error.message).to.equal(result.error?.message)
      if (verbose) expect(result.stderr).to.contain('/internal/Schema.php').and.to.contain('private-trace-id')
      else expect(result.stderr).not.to.contain('/internal/')
      expect(result.stderr).not.to.contain('test-token')
    })
  }

  for (const explicit of [false, true]) {
    it(`names the missing ${explicit ? 'flag' : 'profile'} branch`, async () => {
      fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: ''}, 404))
      const result = await command('policy list', explicit ? ['-b', 'missing-branch', '-w', '9'] : [])
      expect(result.error?.message).to.contain(`Branch "${explicit ? 'missing-branch' : 'profile-branch'}" was not found in workspace ${explicit ? '9' : '3'}.`)
    })
  }

  it('preserves a nonempty 404 explanation', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: 'Policy was deleted.'}, 404))
    const result = await command('policy list', ['-b', 'missing'])
    expect(result.error?.message).to.contain('Policy was deleted.').and.not.to.contain('Branch "')
  })

  it('does not fold, redact or synthesize errors for non-policy commands', async () => {
    fixture.route(() => json({code: 'ERROR_CODE_NOT_FOUND', message: ''}, 404))
    const result = await command('workspace pull', ['-b', 'missing', '-v'])
    expect(result.error?.message).to.contain('API request failed with status 404').and.not.to.contain('Branch "')
    expect(result.stderr).not.to.contain('ERROR_CODE_NOT_FOUND')
  })

  it('folds publish save errors after a successful parse and lookup', async () => {
    fixture.route((url, method) => url.pathname.endsWith('/parse') ? json({policy: {key: 'AUTH-001'}, source})
      : method === 'GET' ? json({items: []}) : json(backendError, 500))
    const result = await command('policy publish', ['-v', '-o', 'json'])
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(JSON.parse(result.stdout).error.message).to.contain('ERROR_CODE_SYNTAX_ERROR')
    expect(result.stdout).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
    expect(result.stderr).to.contain('/internal/Schema.php')
  })

  it('XANO_VERBOSE exposes traces only on stderr', async () => {
    process.env.XANO_VERBOSE = 'true'
    fixture.route(() => json(backendError, 400))
    const result = await command('policy parse', ['-o', 'json'])
    expect(result.stdout).not.to.contain('/internal/').and.not.to.contain('private-trace-id')
    expect(result.stderr).to.contain('/internal/Schema.php')
  })

  it('inactive status hides historical counts and diagnostics, and never calls an inactive policy blocking', async () => {
    statusRoute({...policy, active: false, latest_run: staleCoverage}, {...run, results: [{...run.results[0], message: 'OLD ERROR', status: 'error'}]})
    const result = await command('policy status')
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain('inactive; not evaluated  Inactive  not checked  ').and.not.to.contain('OLD ERROR')
    expect(result.stdout).not.to.contain('— findings')
    expect(result.stdout).not.to.contain('Blocking')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('status words enforcement as Studio does, and marks only findings the run judged blocking', async () => {
    statusRoute(policy, run)
    expect((await command('policy status')).stdout).to.contain('AUTH-001  fail  Blocking  1 findings (blocking)')
    statusRoute({...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}, run)
    const advisory = await command('policy status', ['-o', 'json'])
    expect(JSON.parse(advisory.stdout).status[0]).to.include({blocking: false, findings: 1})
    statusRoute({...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}, run)
    expect((await command('policy status')).stdout).to.contain('AUTH-001  fail  Advisory  1 findings  ').and.not.to.contain('(blocking)')
  })

  it('status --run-detail reports the description, settings and coverage the run recorded', async () => {
    statusRoute(policy, detailRun)
    const result = await command('policy status', ['--run-detail'])
    expect(result.stdout).to.contain('Run 1129 as recorded (manual, 2000):')
      .and.to.contain('AUTH-001  Every endpoint requires authentication unless it is tagged public.')
      .and.to.contain('R1  Endpoints require authentication  settings: api_groups=[lab], except_tags=[public]  checked 10')
    statusRoute(policy, {...detailRun, results: [{...detailRun.results[0], checked: 0, status: 'pass'}]})
    const empty = await command('policy status', ['--run-detail'])
    expect(empty.stdout).to.contain('except_tags=[public]  no objects checked')
  })

  it('status --run-detail says so when the run evaluated no policy', async () => {
    statusRoute({...policy, latest_run: coverage({included: false, run_id: 1075})}, {...detailRun, id: 1075, policies: []})
    const result = await command('policy status', ['--run-detail'])
    expect(result.stdout).to.contain('Run 1075 evaluated no policies.').and.not.to.contain('as recorded')
  })

  it('status names the rules that checked nothing while others passed', async () => {
    const results = [
      {check_id: 'R1', checked: 9, message: '', policy_key: 'AUTH-001', status: 'pass'},
      {check_id: 'R2', checked: 0, message: '', policy_key: 'AUTH-001', status: 'pass'},
    ]
    statusRoute({...policy, rules: [{id: 'R1'}, {id: 'R2'}]}, {...run, findings: [], results})
    const result = await command('policy status')
    expect(result.stdout).to.contain('AUTH-001  pass; 1 rule no objects checked  Blocking  0 findings')
    expect(result.stdout).to.contain('No objects checked (proves nothing about coverage):\n  AUTH-001 R2: no objects checked')
    const asJson = await command('policy status', ['-o', 'json'])
    expect(JSON.parse(asJson.stdout).status[0]).to.include({rules_unchecked: 1, status: 'pass'})
  })

  it('--fail-on-findings says in one line why it failed, and says it in JSON too', async () => {
    statusRoute(policy, run)
    const blocked = await command('policy status', ['--fail-on-findings'])
    expect(blocked.stdout).to.contain('The latest run has 1 blocking finding (AUTH-001); the merge gate evaluates the branch again before a merge.')
    expect(process.exitCode).to.equal(2)

    statusRoute({...policy, latest_run: staleCoverage}, run)
    const stale = await command('policy status', ['--fail-on-findings'])
    expect(stale.stdout).to.contain('Evaluation evidence is stale, missing or errored (AUTH-001 outdated; evaluate again); exit 1.')
    expect(process.exitCode).to.equal(1)

    statusRoute(policy, run)
    const asJson = JSON.parse((await command('policy status', ['--fail-on-findings', '-o', 'json'])).stdout)
    expect(asJson.status[0]).to.include({active: true, blocking: true, counted: true, enforcement: 'blocking'})
    expect(asJson.fail_on_findings).to.deep.equal({exit: 2, reason: 'The latest run has 1 blocking finding (AUTH-001); the merge gate evaluates the branch again before a merge.'})
    expect(process.exitCode).to.equal(2)
  })

  it('--fail-on-findings exits 2 for a blocking finding beside a stale policy', async () => {
    const stale = {...policy, id: 8, key: 'SEC-100', latest_run: staleCoverage}
    fixture.route((url) => url.pathname.includes('/run/') ? json(run) : json({items: [policy, stale]}))
    const result = await command('policy status', ['--fail-on-findings', '-o', 'json'])
    expect(JSON.parse(result.stdout).fail_on_findings.exit).to.equal(2)
    expect(JSON.parse(result.stdout).fail_on_findings.reason).to.contain('1 blocking finding (AUTH-001)')
      .and.to.contain('Evidence is also stale, missing or errored (SEC-100 outdated; evaluate again).')
    expect(process.exitCode).to.equal(2)
  })

  it('status JSON stays a passthrough of the native run and omits the exit block without the flag', async () => {
    statusRoute(policy, detailRun)
    const result = JSON.parse((await command('policy status', ['--run-detail', '-o', 'json'])).stdout)
    expect(result.run).to.deep.equal(detailRun)
    expect(result).not.to.have.property('fail_on_findings')
  })

  it('evaluate names an unnamed rule by the label its own run snapshot recorded', async () => {
    const finding = {id: 'F1', message: 'No auth', object: {name: 'orders', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'R1', rule_title: ''}
    fixture.route(() => json({...detailRun, findings: [finding], policy_check: {blocking: true, blocking_finding_ids: ['F1'], status: 'fail'}}))
    const result = await command('policy evaluate')
    expect(result.stdout).to.contain('Endpoints require authentication (AUTH-001)')
    expect(process.exitCode).to.equal(2)
  })

  for (const [current, stale, status] of [
    [policy, false, 'fail'],
    [{...policy, latest_run: staleCoverage}, true, 'stale'],
    [{...policy, latest_run: notInRun}, false, 'not_evaluated'],
    [{...policy, latest_run: noRun}, false, 'not_evaluated'],
    [{...policy, active: false, latest_run: staleCoverage}, true, 'inactive'],
    [{...policy, active: false, latest_run: noRun}, false, 'inactive'],
  ] as const) {
    it(`status JSON carries the served freshness for ${status} stale=${stale}`, async () => {
      statusRoute(current, run)
      const result = await command('policy status', ['-o', 'json'])
      const row = JSON.parse(result.stdout).status[0]
      expect(row).to.include({stale, status})
      if (status !== 'fail') expect(row).to.include({checked: 0, counted: false, findings: 0})
    })
  }

  for (const [current, latest, code] of [
    [policy, run, 2],
    [{...policy, enforcement: 'advisory', latest_run: coverage({enforcement: 'advisory'})}, run, 0],
    [{...policy, latest_run: staleCoverage}, run, 1],
    [{...policy, latest_run: notInRun}, run, 1],
    [{...policy, latest_run: noRun}, run, 1],
    [{...policy, active: false, latest_run: staleCoverage}, run, 0],
    [{...policy, active: false, latest_run: noRun}, run, 0],
    [policy, {...run, findings: [], results: [{...run.results[0], status: 'pass'}]}, 0],
    [policy, {...run, findings: [], results: [{...run.results[0], status: 'error'}]}, 1],
    [policy, {...run, findings: [], results: []}, 1],
  ] as const) {
    it(`status CI exits ${code} for ${JSON.stringify({current, latest})}`, async () => {
      statusRoute(current, latest)
      const result = await command('policy status', ['--fail-on-findings', '-o', 'json'])
      expect(result.error).to.equal(undefined)
      expect(process.exitCode ?? 0).to.equal(code)
    })
  }

  for (const action of ['policy evaluate', 'workspace push']) {
    it(`${action} labels advisory findings without changing JSON or exit status`, async () => {
      const check = {blocking: false, findings: [{message: 'Review auth'}], status: 'fail'}
      fixture.route(() => json({policy_check: check}))
      const summary = await command(action)
      expect(summary.stdout).to.contain('Policy check: advisory findings (not blocking)')
      const result = await command(action, ['-o', 'json'])
      expect(JSON.parse(result.stdout).policy_check).to.deep.equal(check)
      expect(process.exitCode ?? 0).to.equal(0)
    })
  }
})
