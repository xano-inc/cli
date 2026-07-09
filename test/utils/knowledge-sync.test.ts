/* eslint-disable camelcase */
import {expect} from 'chai'
import * as fs from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {
  buildPrimaryContent,
  collectKnowledgeObjects,
  type KnowledgeObject,
  knowledgePreview,
  parseFrontmatter,
  parsePrimaryContent,
  syncGuidToFrontmatter,
  toPushItems,
  writeKnowledge,
} from '../../src/utils/knowledge-sync.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mkTmp(): string {
  return fs.mkdtempSync(join(tmpdir(), 'xano-knowledge-test-'))
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel)
  fs.mkdirSync(dirname(full), {recursive: true})
  fs.writeFileSync(full, content, 'utf8')
  return full
}

function read(dir: string, ...parts: string[]): string {
  return fs.readFileSync(join(dir, ...parts), 'utf8')
}

function doc(name: string, content: string, guid?: string): KnowledgeObject {
  return {content, guid, knowledge_type: 'doc', name}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('knowledge-sync', () => {
  describe('frontmatter round-trip', () => {
    it('builds frontmatter from structured fields then body', () => {
      const obj: KnowledgeObject = {
        content: '# Body\ntext',
        description: 'A skill',
        enabled: true,
        guid: 'g-1',
        knowledge_type: 'skill',
        mode: 'auto',
        name: 'My Skill',
        scope: 'workspace',
      }
      const out = buildPrimaryContent(obj)
      expect(out.startsWith('---\n')).to.be.true
      expect(out).to.include('name: My Skill')
      expect(out).to.include('knowledge_type: skill')
      expect(out).to.include('inclusion: on demand')
      expect(out).to.include('guid: g-1')
      expect(out.endsWith('# Body\ntext')).to.be.true
    })

    it('parsePrimaryContent recovers meta and body', () => {
      const raw = '---\nname: API\nknowledge_type: doc\nguid: g-2\n---\n# content here'
      const {body, meta} = parsePrimaryContent(raw)
      expect(meta).to.deep.include({guid: 'g-2', knowledge_type: 'doc', name: 'API'})
      expect(body).to.equal('# content here')
    })

    it('parsePrimaryContent treats content without frontmatter as all body', () => {
      const {body, meta} = parsePrimaryContent('# no frontmatter')
      expect(meta).to.deep.equal({})
      expect(body).to.equal('# no frontmatter')
    })

    it('parseFrontmatter extracts guid and name', () => {
      expect(parseFrontmatter('---\nname: X\nguid: abc\n---\nbody')).to.deep.equal({guid: 'abc', name: 'X'})
    })
  })

  describe('writeKnowledge', () => {
    it('maps the three knowledge types to the canonical layout', () => {
      const tmp = mkTmp()
      const objects: KnowledgeObject[] = [
        {content: '# agents', knowledge_type: 'agents.md', name: 'agents.md'},
        {content: '# skill', knowledge_type: 'skill', name: 'My Skill'},
        {content: '# doc', knowledge_type: 'doc', name: 'API Guide'},
      ]
      const count = writeKnowledge(objects, tmp)
      expect(count).to.equal(3)
      expect(fs.existsSync(join(tmp, 'knowledge', 'agents.md'))).to.be.true
      expect(fs.existsSync(join(tmp, 'knowledge', 'skills', 'my_skill', 'SKILL.md'))).to.be.true
      expect(fs.existsSync(join(tmp, 'knowledge', 'docs', 'api_guide.md'))).to.be.true
    })

    it('writes skill reference files under references/', () => {
      const tmp = mkTmp()
      const objects: KnowledgeObject[] = [
        {
          content: '# skill',
          files: [{content: 'ref body', name: 'guide.md'}],
          knowledge_type: 'skill',
          name: 'Helper',
        },
      ]
      const count = writeKnowledge(objects, tmp)
      expect(count).to.equal(2)
      expect(read(tmp, 'knowledge', 'skills', 'helper', 'references', 'guide.md')).to.equal('ref body')
    })

    it('disambiguates colliding snake_case names with a numeric suffix', () => {
      const tmp = mkTmp()
      writeKnowledge(
        [
          {content: 'a', knowledge_type: 'doc', name: 'My Doc'},
          {content: 'b', knowledge_type: 'doc', name: 'my doc'},
        ],
        tmp,
      )
      expect(fs.existsSync(join(tmp, 'knowledge', 'docs', 'my_doc.md'))).to.be.true
      expect(fs.existsSync(join(tmp, 'knowledge', 'docs', 'my_doc_2.md'))).to.be.true
    })

    it('never overwrites distinct objects that share an identical name', () => {
      const tmp = mkTmp()
      const count = writeKnowledge(
        [
          {content: 'first', guid: 'g1', knowledge_type: 'skill', name: 'test'},
          {content: 'second', guid: 'g2', knowledge_type: 'skill', name: 'test'},
          {content: 'third', guid: 'g3', knowledge_type: 'skill', name: 'test'},
        ],
        tmp,
      )
      expect(count).to.equal(3)
      expect(read(tmp, 'knowledge', 'skills', 'test', 'SKILL.md')).to.include('first')
      expect(read(tmp, 'knowledge', 'skills', 'test_2', 'SKILL.md')).to.include('second')
      expect(read(tmp, 'knowledge', 'skills', 'test_3', 'SKILL.md')).to.include('third')
    })

    it('embeds frontmatter the collector can read back', () => {
      const tmp = mkTmp()
      writeKnowledge([{content: '# body', description: 'd', knowledge_type: 'doc', name: 'Round Trip'}], tmp)
      const collected = collectKnowledgeObjects(tmp)
      expect(collected).to.have.lengthOf(1)
      expect(collected[0]).to.include({content: '# body', description: 'd', knowledge_type: 'doc', name: 'Round Trip'})
    })
  })

  describe('collectKnowledgeObjects', () => {
    it('returns empty array when knowledge/ dir is absent', () => {
      expect(collectKnowledgeObjects(mkTmp())).to.deep.equal([])
    })

    it('reconstructs objects from primary files and infers type from path', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/agents.md', '---\nname: agents.md\n---\n# a')
      writeFile(tmp, 'knowledge/skills/foo/SKILL.md', '---\nname: Foo\n---\n# s')
      writeFile(tmp, 'knowledge/docs/bar.md', '---\nname: Bar\n---\n# d')

      const objs = collectKnowledgeObjects(tmp).sort((a, b) => a.knowledge_type.localeCompare(b.knowledge_type))
      expect(objs.map((o) => o.knowledge_type)).to.deep.equal(['agents.md', 'doc', 'skill'])
      const skill = objs.find((o) => o.knowledge_type === 'skill')!
      expect(skill.name).to.equal('Foo')
      expect(skill.content).to.equal('# s')
    })

    it('attaches a skill’s reference files', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/skills/foo/SKILL.md', '---\nname: Foo\n---\n# s')
      writeFile(tmp, 'knowledge/skills/foo/references/a.md', 'ref a')
      writeFile(tmp, 'knowledge/skills/foo/references/nested/b.md', 'ref b')

      const [skill] = collectKnowledgeObjects(tmp)
      const files = (skill.files ?? []).sort((a, b) => a.name.localeCompare(b.name))
      expect(files).to.deep.equal([
        {content: 'ref a', name: 'a.md'},
        {content: 'ref b', name: 'nested/b.md'},
      ])
    })

    it('ignores reference files as standalone primaries', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/skills/foo/SKILL.md', '---\nname: Foo\n---\n')
      writeFile(tmp, 'knowledge/skills/foo/references/a.md', 'ref')
      expect(collectKnowledgeObjects(tmp)).to.have.lengthOf(1)
    })

    it('applies include/exclude globs against knowledge/<path>', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/agents.md', '---\nname: A\n---\n')
      writeFile(tmp, 'knowledge/skills/foo/SKILL.md', '---\nname: Foo\n---\n')
      writeFile(tmp, 'knowledge/docs/guide.md', '---\nname: G\n---\n')

      const onlySkills = collectKnowledgeObjects(tmp, ['knowledge/skills/**'])
      expect(onlySkills.map((o) => o.name)).to.deep.equal(['Foo'])

      const noDocs = collectKnowledgeObjects(tmp, undefined, ['knowledge/docs/**']).map((o) => o.name).sort()
      expect(noDocs).to.deep.equal(['A', 'Foo'])
    })

    it('defaults required fields (description/scope/mode/enabled) when frontmatter omits them', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/docs/minimal.md', '---\nname: minimal\nknowledge_type: doc\n---\nbody')
      const [obj] = collectKnowledgeObjects(tmp)
      expect(obj).to.include({description: '', enabled: true, mode: 'auto', scope: 'workspace'})
    })

    it('normalizes frontend display labels for inclusion to the backend enum', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/docs/a.md', '---\nname: a\ninclusion: on demand\n---\n')
      writeFile(tmp, 'knowledge/docs/b.md', '---\nname: b\ninclusion: Manual\n---\n')
      writeFile(tmp, 'knowledge/docs/c.md', '---\nname: c\ninclusion: always\n---\n')
      writeFile(tmp, 'knowledge/docs/d.md', '---\nname: d\ninclusion: auto\n---\n')

      const byName = Object.fromEntries(collectKnowledgeObjects(tmp).map((o) => [o.name, o.mode]))
      expect(byName).to.deep.equal({a: 'auto', b: 'referenced', c: 'always', d: 'auto'})
    })

    it('round-trips inclusion through writeKnowledge and collectKnowledgeObjects for each mode', () => {
      const tmp = mkTmp()
      const modes: Array<{inclusion: string; mode: string}> = [
        {inclusion: 'on demand', mode: 'auto'},
        {inclusion: 'always', mode: 'always'},
        {inclusion: 'manual', mode: 'referenced'},
      ]
      const objects: KnowledgeObject[] = modes.map(({mode}, i) => ({
        content: `# ${i}`,
        knowledge_type: 'doc',
        mode,
        name: `Doc ${i}`,
      }))
      writeKnowledge(objects, tmp)

      const collected = collectKnowledgeObjects(tmp)
      for (const [i, {inclusion, mode}] of modes.entries()) {
        const raw = read(tmp, 'knowledge', 'docs', `doc_${i}.md`)
        expect(raw).to.include(`inclusion: ${inclusion}`)
        expect(raw).to.not.match(/^mode:/m)
        const obj = collected.find((o) => o.name === `Doc ${i}`)!
        expect(obj.mode).to.equal(mode)
      }
    })

    it('records the source filePath but strips it from push items', () => {
      const tmp = mkTmp()
      writeFile(tmp, 'knowledge/docs/x.md', '---\nname: X\n---\nbody')
      const [obj] = collectKnowledgeObjects(tmp)
      expect(obj.filePath).to.be.a('string')
      expect(toPushItems([obj])[0]).to.not.have.property('filePath')
    })
  })

  describe('knowledgePreview', () => {
    it('classifies a new local object as create', () => {
      const result = knowledgePreview([doc('A', 'x')], [], false)
      expect(result.operations).to.deep.equal([{action: 'create', name: 'A', type: 'doc'}])
      expect(result.summary.doc.created).to.equal(1)
    })

    it('classifies identical object as unchanged', () => {
      const o = doc('A', 'same')
      const result = knowledgePreview([o], [doc('A', 'same')], false)
      expect(result.operations).to.have.lengthOf(0)
      expect(result.summary.doc.unchanged).to.equal(1)
    })

    it('classifies changed content as update', () => {
      const result = knowledgePreview([doc('A', 'new')], [doc('A', 'old')], false)
      expect(result.operations[0].action).to.equal('update')
      expect(result.summary.doc.updated).to.equal(1)
    })

    it('matches by guid when the name differs', () => {
      const result = knowledgePreview([doc('New Name', 'same', 'g')], [doc('Old Name', 'same', 'g')], false)
      expect(result.operations).to.have.lengthOf(0)
      expect(result.summary.doc.unchanged).to.equal(1)
    })

    it('emits delete for server-only objects only when willDelete=true', () => {
      const server = [doc('Stale', 'x')]
      expect(knowledgePreview([], server, false).operations).to.have.lengthOf(0)
      const deleted = knowledgePreview([], server, true)
      expect(deleted.operations[0].action).to.equal('delete')
      expect(deleted.summary.doc.deleted).to.equal(1)
    })

    it('detects reference-file changes as update', () => {
      const local: KnowledgeObject = {content: 's', files: [{content: 'v2', name: 'r.md'}], knowledge_type: 'skill', name: 'S'}
      const server: KnowledgeObject = {content: 's', files: [{content: 'v1', name: 'r.md'}], knowledge_type: 'skill', name: 'S'}
      const result = knowledgePreview([local], [server], false)
      expect(result.operations[0].action).to.equal('update')
    })
  })

  describe('syncGuidToFrontmatter', () => {
    it('inserts guid when absent', () => {
      const tmp = mkTmp()
      const fp = writeFile(tmp, 'SKILL.md', '---\nname: My Skill\n---\n# body\n')
      expect(syncGuidToFrontmatter(fp, 'new-guid')).to.be.true
      expect(fs.readFileSync(fp, 'utf8')).to.include('guid: new-guid')
    })

    it('updates an existing guid', () => {
      const tmp = mkTmp()
      const fp = writeFile(tmp, 'SKILL.md', '---\nname: S\nguid: old\n---\n')
      expect(syncGuidToFrontmatter(fp, 'new')).to.be.true
      const content = fs.readFileSync(fp, 'utf8')
      expect(content).to.include('guid: new')
      expect(content).to.not.include('old')
    })

    it('returns false when guid already matches', () => {
      const tmp = mkTmp()
      const fp = writeFile(tmp, 'SKILL.md', '---\nname: S\nguid: same\n---\n')
      expect(syncGuidToFrontmatter(fp, 'same')).to.be.false
    })

    it('returns false when there is no frontmatter block', () => {
      const tmp = mkTmp()
      const fp = writeFile(tmp, 'README.md', '# header\nno frontmatter')
      expect(syncGuidToFrontmatter(fp, 'g')).to.be.false
    })
  })
})
