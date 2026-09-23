import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {policyRequest, policyScope} from '../../../utils/policy/request.js'

/** The one skill this command installs. The instance generates it from its check catalogue. */
const SKILL = 'xano-policies'
/** The id the platform gives its own generated skill; a workspace record of the same name has its own. */
const PLATFORM_SKILL_ID = -101

interface AgentSkill {
  content?: string
  description?: string
  id?: number
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

export default class SkillsPull extends BaseCommand {
  static override description = `Install the ${SKILL} agent skill this instance generates

Writes <directory>/.claude/skills/${SKILL}/SKILL.md, the project skill folder Claude Code reads, and replaces that file without a backup. A copy installed anywhere else, such as a global ~/.claude/skills/${SKILL} or another agent's skills folder, is not touched: remove it, so the agent does not load it instead.`
  static override examples = [
    `$ xano skills pull
Wrote .claude/skills/${SKILL}/SKILL.md (${SKILL} skill for workspace 40, branch live)
`,
    '$ xano skills pull -d ./my-project',
    '$ xano skills pull -b dev -o json',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({char: 'b', description: "Branch label (defaults to profile branch or live; -b '' selects live)"}),
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: `Project directory whose .claude/skills/${SKILL}/SKILL.md is written (defaults to current directory)`,
      required: false,
    }),
    output: Flags.string({char: 'o', default: 'summary', description: 'Output format', options: ['summary', 'json']}),
    workspace: Flags.string({char: 'w', description: 'Workspace ID (defaults to profile workspace)'}),
  }

  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SkillsPull)
    const {profile} = this.resolveProfile(flags)
    const {branch, workspace} = policyScope(flags, profile)
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')

    // The route lives beside /policy under the workspace and is gated by the same
    // `workspace:policy` permission, so it answers failures the way the policy commands do.
    const request = policyRequest(
      {error: (message) => this.error(message), logToStderr: (message) => this.logToStderr(message), verboseFetch: (...args) => this.verboseFetch(...args)},
      {branch, label: 'Agent skills', path: '/agent-skills', profile, verbose: flags.verbose, workspace},
    )
    // `surface=cli` asks for the terminal wording of the skill, not the Studio one.
    const payload = (await request('', 'GET', undefined, {surface: 'cli'})) as {knowledge?: AgentSkill[]}

    const items = Array.isArray(payload?.knowledge) ? payload.knowledge : []
    const skill = items.find((item) => typeof item?.name === 'string' && item.name.trim().toLowerCase() === SKILL)
    if (!skill) {
      this.error(`The instance returned no ${SKILL} skill for workspace ${workspace}, branch ${branch || 'live'}.`)
    }

    const document = buildSkillDocument(skill.description ?? '', skill.content ?? '')
    const filePath = path.join(path.resolve(flags.directory), '.claude', 'skills', SKILL, 'SKILL.md')
    fs.mkdirSync(path.dirname(filePath), {recursive: true})
    // The file is regenerated on every pull and no backup is kept.
    fs.writeFileSync(filePath, document, 'utf8')
    const own = skill.id !== PLATFORM_SKILL_ID

    if (flags.output === 'json') {
      this.log(JSON.stringify({
        branch,
        bytes: Buffer.byteLength(document, 'utf8'),
        name: SKILL,
        path: filePath,
        source: own ? 'workspace' : 'platform',
        workspace,
      }, null, 2))
      return
    }

    const relative = path.relative(process.cwd(), filePath)
    const shown = relative && !relative.startsWith('..') ? relative : filePath
    this.log(`Wrote ${shown} (${SKILL} skill for workspace ${workspace}, branch ${branch || 'live'})`)
    if (own) this.log(`This is the workspace's own ${SKILL} knowledge record, which replaces the platform skill.`)
  }
}
