import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import path from 'node:path'

import PolicyCommand from '../../../policy-command.js'

/** The one skill this command installs. The instance generates it from the branch's own policies. */
const SKILL = 'xano-policies'

interface AgentSkill {
  content?: string
  description?: string
  knowledge_type?: string
  name?: null | string
}

/** True when the content the instance sent already opens with its own YAML frontmatter block. */
function hasFrontmatter(content: string): boolean {
  if (!/^---\r?\n/.test(content)) return false
  return content.split(/\r?\n/).slice(1).includes('---')
}

/**
 * The SKILL.md a coding agent reads: `name` and `description` in frontmatter, the instance's
 * content below it verbatim. The description is written as a double-quoted YAML scalar, so a
 * `:` or `#` in it stays a description instead of becoming syntax.
 */
export function buildSkillDocument(description: string, content: string): string {
  // Exactly one trailing newline, whatever the instance sent, so a re-pull is byte-identical.
  const body = `${content.replace(/\n+$/, '')}\n`
  // Content that already carries frontmatter is complete; a second block would shadow the first.
  if (hasFrontmatter(body)) return body
  return `---\nname: ${SKILL}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`
}

export default class SkillsPull extends PolicyCommand {
  static override description = `Install the ${SKILL} agent skill this instance generates for the selected branch`
  static override examples = [
    `$ xano skills pull
Wrote .claude/skills/${SKILL}/SKILL.md (${SKILL} skill for workspace 40, branch live)
`,
    '$ xano skills pull -d ./my-project',
    '$ xano skills pull -b dev -o json',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Project directory that receives .claude/skills (defaults to current directory)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SkillsPull)
    const {profile} = this.resolveProfile(flags)
    // A profile.yaml/credentials workspace arrives from YAML as a number; the id is a string here.
    const workspace = String(flags.workspace || profile.workspace || '')
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')
    const branch = flags.branch ?? profile.branch ?? ''

    // The route lives beside /policy under the workspace and is gated by the same
    // `workspace:policy` scope, so it answers failures the way the policy commands do.
    const request = this.policyRequest(profile, workspace, branch, flags.verbose, flags.output === 'json', {
      label: 'Agent skills',
      path: '/agent-skills',
    })
    // `surface=cli` asks for the terminal wording of the skill, not the MCP one.
    const payload = (await request('', 'GET', undefined, {surface: 'cli'})) as {knowledge?: AgentSkill[]}

    const items = Array.isArray(payload?.knowledge) ? payload.knowledge : []
    const skill = items.find((item) => typeof item?.name === 'string' && item.name.trim().toLowerCase() === SKILL)
    if (!skill) {
      this.error(
        `The instance did not serve the ${SKILL} skill (policies feature off, or a workspace knowledge record of the same name replaces it).`,
        {exit: 1},
      )
    }

    const document = buildSkillDocument(skill.description ?? '', skill.content ?? '')
    const filePath = path.join(path.resolve(flags.directory), '.claude', 'skills', SKILL, 'SKILL.md')
    fs.mkdirSync(path.dirname(filePath), {recursive: true})
    // Rewriting the same bytes is the normal case: the skill follows the branch's policies,
    // so a pull after every policy change is meant to be cheap and leaves no backup behind.
    fs.writeFileSync(filePath, document, 'utf8')

    if (flags.output === 'json') {
      this.log(JSON.stringify({
        branch,
        bytes: Buffer.byteLength(document, 'utf8'),
        name: SKILL,
        path: filePath,
        workspace,
      }, null, 2))
      return
    }

    const relative = path.relative(process.cwd(), filePath)
    const shown = relative && !relative.startsWith('..') ? relative : filePath
    this.log(`Wrote ${shown} (${SKILL} skill for workspace ${workspace}, branch ${branch || 'live'})`)
  }
}
