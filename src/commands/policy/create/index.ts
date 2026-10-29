import {Flags} from '@oclif/core'

import type {PolicyRecipe} from '../../../utils/policy/catalogue.js'
import type {PolicyKeyRule, PolicyTemplate} from '../../../utils/policy/template.js'
import type {Policy, PolicyCatalogueEntry} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {listAllPolicies} from '../../../utils/policy/request.js'
import {policyFromTemplate, recipeRefusal} from '../../../utils/policy/template.js'

export default class PolicyCreate extends PolicyCommand {
  static override description = 'Create an independent policy from a platform template. The policy keeps the template id; the platform names it after the template (a free key suffix, and a numbered title for a second copy) unless --key is given'
  static override examples = [
    '$ xano policy create --template endpoints_need_login -b dev',
    `$ xano policy create --template no_pii_in_responses --key DATA-020 --param 'fields=["email","ssn"]'`,
    `$ xano policy create --template admin_endpoints_check_role --param 'functions=["require_admin"]' --param 'paths=["admin"]'`,
    `$ xano policy create --template retained_data_has_age_limit --param 'tags=["retained"]' --param 'referenced_by.max_age_days=730'`,
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    ...PolicyCommand.publishFlags,
    key: Flags.string({description: "New policy key (default: the platform's choice, the template key with a free numeric suffix if taken)"}),
    param: Flags.string({description: 'Parameter override: N.path=JSON, 1-based rule number; path=JSON for a single-rule template', multiple: true}),
    template: Flags.string({description: 'Template id from policy catalogue', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyCreate)
    const target = this.policyTarget(flags)
    const {request} = target
    const catalogue = await request('/check') as {document?: {key?: PolicyKeyRule}; items?: PolicyCatalogueEntry[]; recipes?: PolicyRecipe[]; templates?: PolicyTemplate[]}
    const template = catalogue.templates?.find(item => item.id === flags.template)
    // A recipe is data with no create action: name the templates it points at instead.
    const recipe = template || !Array.isArray(catalogue.recipes) ? undefined : catalogue.recipes.find(item => item.id === flags.template)
    if (recipe) this.error(recipeRefusal(recipe))
    if (!template) this.error(`Unknown template "${flags.template}". Run xano policy catalogue to see this instance's templates.`)
    // Only a chosen key is checked here; the platform picks a free one otherwise.
    const keys = flags.key === undefined ? [] : (await listAllPolicies(request)).map(policy => policy.key)
    // The key is checked against the pattern this instance's catalogue serves, and an unfilled need's
    // example falls back to its check's own.
    const document = policyFromTemplate(template, keys, {checks: catalogue.items, key: flags.key, keyRule: catalogue.document?.key, overrides: flags.param})
    const parsed = await this.parseSource(request, {data: document})
    const saved = await request('', 'POST', {data: {source: parsed.source}, ...(flags.message ? {message: flags.message} : {})}) as Policy
    if (typeof saved?.id !== 'number') this.error('The platform did not return the saved policy. Check xano policy list before retrying.')
    this.logRuleWarnings(parsed)
    if (flags.output === 'json') this.log(JSON.stringify(saved, null, 2))
    else this.log(`Created ${parsed.policy.key} (Version ${saved.version}) in ${this.where(target)}.`)
  }
}
