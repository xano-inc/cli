import {Flags} from '@oclif/core'

import type {PolicyTemplate} from '../../../utils/policy/template.js'
import type {PolicyCatalogueEntry} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {policyCatalogueSummary, type PolicyTemplateCategory, policyTemplateSummary, selectCatalogueCheck} from '../../../utils/policy/catalogue.js'
import {listItems} from '../../../utils/policy/request.js'

export default class PolicyCatalogue extends PolicyCommand {
  static override description = 'List built-in policy checks, their parameter schemas and the templates a policy can start from'
  static override examples = ['$ xano policy catalogue -o json', '$ xano policy catalogue --check object.auth_required']
  static override flags = {
    ...PolicyCommand.policyFlags,
    check: Flags.string({description: 'Show only this check id (an unknown id names the closest matches)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyCatalogue)
    const {request} = this.policyTarget(flags)
    const result = await request('/check')
    if (flags.check) {
      // `--check` narrows both output modes, so `-o json` stays pipeable for one check too.
      const selected = selectCatalogueCheck(listItems<PolicyCatalogueEntry>(result), flags.check)
      this.log(flags.output === 'json' ? JSON.stringify(selected, null, 2) : policyCatalogueSummary(selected).join('\n'))
    } else if (flags.output === 'json') {
      this.log(JSON.stringify(result, null, 2))
    } else {
      for (const line of policyCatalogueSummary(listItems<PolicyCatalogueEntry>(result))) this.log(line)
      const {template_categories: categories = [], templates = []} = result as {template_categories?: PolicyTemplateCategory[]; templates?: PolicyTemplate[]}
      if (templates.length > 0) this.log(['', ...policyTemplateSummary(templates, categories)].join('\n'))
    }
  }
}
