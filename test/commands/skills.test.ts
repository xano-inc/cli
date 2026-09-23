import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

const content = '# Xano policies\n\nFollow the branch policies before pushing.\n'
const description = 'Policies: how this workspace expects XanoScript to be written'

const served = (items: unknown[]) => json({knowledge: items})
const skill = (overrides: Record<string, unknown> = {}) => ({
  content,
  description,
  id: -101,
  knowledge_type: 'skill',
  name: 'xano-policies',
  ...overrides,
})

describe('skills pull', () => {
  const fixture = policyFixture({profile: 'default'})
  let project: string

  const skillFile = () => path.join(project, '.claude', 'skills', 'xano-policies', 'SKILL.md')

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(fixture.directory, 'project-'))
  })

  it('writes SKILL.md with frontmatter above the served content', async () => {
    fixture.route(() => served([skill()]))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fs.readFileSync(skillFile(), 'utf8')).to.equal(
      `---\nname: xano-policies\ndescription: ${JSON.stringify(description)}\n---\n\n${content}`,
    )
    expect(result.stdout).to.contain('(xano-policies skill for workspace 1, branch feature)')
  })

  it('asks the instance for the CLI surface of the selected branch', async () => {
    fixture.route(() => served([skill()]))
    await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/agent-skills')
    expect(fixture.calls[0].url.searchParams.get('surface')).to.equal('cli')
    expect(fixture.calls[0].url.searchParams.get('branch')).to.equal('feature')
  })

  it('matches the served name however it is cased or padded', async () => {
    fixture.route(() => served([skill({name: '  Xano-Policies '})]))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fs.readFileSync(skillFile(), 'utf8')).to.contain(content)
  })

  it('rewrites the same bytes on a second pull, leaving no backup behind', async () => {
    fixture.route(() => served([skill()]))
    await runCommand(['skills', 'pull', '-d', project], fixture.config)
    const first = fs.readFileSync(skillFile())
    await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(fs.readFileSync(skillFile())).to.deep.equal(first)
    expect(fs.readdirSync(path.dirname(skillFile()))).to.deep.equal(['SKILL.md'])
  })

  it('replaces only the project file, never a copy installed elsewhere', async () => {
    const home = fs.mkdtempSync(path.join(fixture.directory, 'home-'))
    const global = path.join(home, '.claude', 'skills', 'xano-policies', 'SKILL.md')
    fs.mkdirSync(path.dirname(global), {recursive: true})
    fs.writeFileSync(global, 'stub')
    fs.mkdirSync(path.dirname(skillFile()), {recursive: true})
    fs.writeFileSync(skillFile(), 'project stub')
    process.env.HOME = home
    fixture.route(() => served([skill()]))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fs.readFileSync(skillFile(), 'utf8')).to.contain(content)
    expect(fs.readFileSync(global, 'utf8')).to.equal('stub')
  })

  it('keeps the instance frontmatter instead of adding a second block', async () => {
    const own = '---\nname: xano-policies\ndescription: from the instance\n---\n\nBody\n'
    fixture.route(() => served([skill({content: own})]))
    await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(fs.readFileSync(skillFile(), 'utf8')).to.equal(own)
  })

  it('exits 1 when the instance returns no such skill, writing nothing', async () => {
    fixture.route(() => served([{content: 'other', id: 12, knowledge_type: 'skill', name: 'deploy-runbook'}]))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.equal('The instance returned no xano-policies skill for workspace 1, branch feature.')
    expect(fs.existsSync(path.join(project, '.claude'))).to.equal(false)
  })

  it("says when it installed the workspace's own record instead of the platform skill", async () => {
    fixture.route(() => served([skill({id: 42})]))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(result.stdout).to.contain("This is the workspace's own xano-policies knowledge record")
    fixture.route(() => served([skill({id: 42})]))
    const asJson = await runCommand(['skills', 'pull', '-d', project, '-o', 'json'], fixture.config)
    expect(JSON.parse(asJson.stdout)).to.include({source: 'workspace'})
  })

  it("prints the route's own refusal with the permission guidance for its code, and exits 1", async () => {
    const message = 'This API token was not granted the workspace:policy read scope. test-token'
    fixture.route(() => json({message, payload: {code: 'policy_scope_required', level: 'read', permission: 'workspace:policy'}}, 403))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.contain('Agent skills request failed (403): This API token was not granted the workspace:policy read scope. [REDACTED]')
    expect(result.error?.message).to.contain('created without the `workspace:policy` read scope')
    expect(result.error?.message).not.to.contain('test-token')
    expect(fs.existsSync(path.join(project, '.claude'))).to.equal(false)
  })

  it("prints the route's own refusal when the feature is off", async () => {
    fixture.route(() => json({message: 'Policies are not enabled on this instance.', payload: {code: 'policy_feature_disabled'}}, 403))
    const result = await runCommand(['skills', 'pull', '-d', project], fixture.config)
    expect(result.error?.message).to.contain('Agent skills request failed (403): Policies are not enabled on this instance.')
      .and.to.contain('turned off for this instance')
  })

  it('prints the written file as JSON with -o json, failures included', async () => {
    fixture.route(() => served([skill()]))
    const result = await runCommand(['skills', 'pull', '-d', project, '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    const written = fs.readFileSync(skillFile())
    expect(JSON.parse(result.stdout)).to.deep.equal({
      branch: 'feature',
      bytes: written.length,
      name: 'xano-policies',
      path: skillFile(),
      source: 'platform',
      workspace: '1',
    })

    fixture.route(() => json({message: 'Unavailable'}, 503))
    const failed = await runCommand(['skills', 'pull', '-d', project, '-o', 'json'], fixture.config)
    expect(failed.error).to.have.nested.property('oclif.exit', 1)
    expect(JSON.parse(failed.stdout).error).to.include({exit: 1})
  })
})
