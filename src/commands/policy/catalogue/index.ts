import {Flags} from '@oclif/core'

import type {PolicyTemplate} from '../../../utils/policy/template.js'
import type {PolicyCatalogueEntry} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {
  policyCatalogueIndex,
  policyCatalogueSummary,
  type PolicyNotCheckable,
  policyNotCheckableSummary,
  type PolicyRecipe,
  policyRecipeSummary,
  policyScopeSummary,
  type PolicyTemplateCategory,
  type PolicyTemplateFramework,
  policyTemplateSummary,
  selectCatalogueCheck,
  selectCatalogueRecipe,
  selectCatalogueTemplate,
} from '../../../utils/policy/catalogue.js'
import {examplePolicyLines, type PolicyDocumentField} from '../../../utils/policy/example.js'
import {listItems} from '../../../utils/policy/request.js'

/** A served list, or none when the instance serves something else (an older one serves no recipes). */
const array = <T>(value: T[] | undefined): T[] => Array.isArray(value) ? value : []

interface CatalogueSections {
  /** The policy file's own fields (severity, enforcement…), as editors read them. */
  document?: {fields?: Record<string, PolicyDocumentField | undefined>}
  not_checkable?: PolicyNotCheckable[]
  recipes?: PolicyRecipe[]
  template_categories?: PolicyTemplateCategory[]
  template_frameworks?: PolicyTemplateFramework[]
  template_frameworks_note?: string
  templates?: PolicyTemplate[]
}

export default class PolicyCatalogue extends PolicyCommand {
  static override description = 'List built-in policy checks with their params and uses, the templates a policy can start from, the recipes that combine them and what no check can see. The summary opens with an index by category, an example policy file and the scope fields; --check, --template and --recipe show one entry'
  static override examples = [
    '$ xano policy catalogue -o json',
    '$ xano policy catalogue --check object.auth_required',
    '$ xano policy catalogue --template retained_data_has_age_limit',
    '$ xano policy catalogue --recipe protect_card_data',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    check: Flags.string({description: 'Show only this check id (an unknown id names the closest matches)', exclusive: ['recipe', 'template']}),
    recipe: Flags.string({description: 'Show only this recipe id and what it cannot see (an unknown id names the closest matches)', exclusive: ['check', 'template']}),
    template: Flags.string({description: 'Show only this template id: its statement, rules, examples, what it cannot see and the create command (an unknown id names the closest matches)', exclusive: ['check', 'recipe']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyCatalogue)
    const {request} = this.policyTarget(flags)
    const result = await request('/check')
    const sections = (result && typeof result === 'object' ? result : {}) as CatalogueSections
    const recipeContext = {
      frameworks: array(sections.template_frameworks),
      frameworksNote: sections.template_frameworks_note ?? '',
      notCheckable: array(sections.not_checkable),
      templates: array(sections.templates),
    }
    const templateContext = {categories: array(sections.template_categories), frameworks: recipeContext.frameworks, frameworksNote: recipeContext.frameworksNote}
    // An id given to the wrong flag (a recipe id to --template) is pointed at the right one.
    const ids = {
      check: listItems<PolicyCatalogueEntry>(result).map(check => check.id),
      recipe: array(sections.recipes).map(recipe => recipe.id),
      template: recipeContext.templates.map(template => template.id),
    }
    if (flags.check) {
      // `--check` narrows both output modes, so `-o json` stays pipeable for one check too.
      const selected = selectCatalogueCheck(listItems<PolicyCatalogueEntry>(result), flags.check, ids)
      this.log(flags.output === 'json' ? JSON.stringify(selected, null, 2) : policyCatalogueSummary(selected).join('\n'))
    } else if (flags.template) {
      // `--template` narrows both output modes too; the summary adds what --template on create needs.
      const selected = selectCatalogueTemplate(recipeContext.templates, flags.template, ids)
      this.log(flags.output === 'json'
        ? JSON.stringify(selected, null, 2)
        : policyTemplateSummary(selected, {...templateContext, detail: {checks: listItems<PolicyCatalogueEntry>(result)}}).join('\n'))
    } else if (flags.recipe) {
      // `--recipe` narrows both output modes too; the summary adds the topics the recipe cannot see.
      const selected = selectCatalogueRecipe(array(sections.recipes), flags.recipe, ids)
      if (flags.output === 'json') {
        this.log(JSON.stringify(selected, null, 2))
        return
      }

      const cited = new Set(selected.flatMap(recipe => array(recipe.limits)))
      const limits = recipeContext.notCheckable.filter(entry => cited.has(entry.id))
      this.log([...policyRecipeSummary(selected, recipeContext), ...(limits.length > 0 ? ['', ...policyNotCheckableSummary(limits)] : [])].join('\n'))
    } else if (flags.output === 'json') {
      this.log(JSON.stringify(result, null, 2))
    } else {
      // The head says what is here and what a policy file looks like, before the checks it can use.
      const checks = listItems<PolicyCatalogueEntry>(result)
      const index = policyCatalogueIndex(checks, {categories: array(sections.template_categories), notCheckable: recipeContext.notCheckable, recipes: array(sections.recipes), templates: recipeContext.templates})
      const fields = sections.document?.fields && typeof sections.document.fields === 'object' ? sections.document.fields : {}
      const example = examplePolicyLines('A policy file (policies/<KEY>.xs; check it with `xano policy parse`, save it with `xano policy publish`):', '  ', fields)
      this.log([...index, '', ...example, ...(checks.length > 0 ? ['', ...policyScopeSummary(checks)] : []), ''].join('\n'))
      for (const line of policyCatalogueSummary(checks)) this.log(line)
      const templates = policyTemplateSummary(recipeContext.templates, templateContext)
      const recipes = policyRecipeSummary(array(sections.recipes), recipeContext)
      const notCheckable = policyNotCheckableSummary(recipeContext.notCheckable)
      for (const section of [templates, recipes, notCheckable]) if (section.length > 0) this.log(['', ...section].join('\n'))
    }
  }
}
