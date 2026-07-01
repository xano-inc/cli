import {expect} from 'chai'

import {
  assembleInput,
  type FunctionInputParam,
  loadJsonSource,
  parseDataPairs,
  splitDataToken,
  validateAgainstSchema,
} from '../../src/utils/function-input.js'

describe('function-input', () => {
  describe('splitDataToken', () => {
    it('parses a plain string pair', () => {
      expect(splitDataToken('name=John')).to.deep.equal({key: 'name', op: '=', value: 'John'})
    })

    it('parses a raw-json pair', () => {
      expect(splitDataToken('age:=30')).to.deep.equal({key: 'age', op: ':=', value: '30'})
    })

    it('parses a file pair', () => {
      expect(splitDataToken('body@payload.txt')).to.deep.equal({key: 'body', op: '@', value: 'payload.txt'})
    })

    it('keeps `=` inside the value intact', () => {
      expect(splitDataToken('q=a=b')).to.deep.equal({key: 'q', op: '=', value: 'a=b'})
    })

    it('detects := even when a later = exists in the value', () => {
      expect(splitDataToken('j:={"a":"b=c"}')).to.deep.equal({key: 'j', op: ':=', value: '{"a":"b=c"}'})
    })

    it('prefers @ when it appears before =', () => {
      expect(splitDataToken('body@file=name')).to.deep.equal({key: 'body', op: '@', value: 'file=name'})
    })

    it('throws when no operator is present', () => {
      expect(() => splitDataToken('bogus')).to.throw(/Expected key=value/)
    })

    it('throws on a missing key', () => {
      expect(() => splitDataToken('=x')).to.throw(/missing key/)
    })
  })

  describe('parseDataPairs', () => {
    it('applies httpie typing rules', () => {
      const out = parseDataPairs(['name=John', 'age:=30', 'active:=true', 'tags:=["a","b"]', 'nothing:=null'])
      expect(out).to.deep.equal({active: true, age: 30, name: 'John', nothing: null, tags: ['a', 'b']})
    })

    it('reads a file value with the @ form', () => {
      const out = parseDataPairs(['body@some/file'], () => 'file-contents')
      expect(out).to.deep.equal({body: 'file-contents'})
    })

    it('lets later pairs override earlier ones', () => {
      expect(parseDataPairs(['x=1', 'x=2'])).to.deep.equal({x: '2'})
    })

    it('throws on malformed raw json', () => {
      expect(() => parseDataPairs(['age:=not-json'])).to.throw(/Invalid JSON for --data 'age:='/)
    })
  })

  describe('loadJsonSource', () => {
    it('returns undefined when no source is given', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined -- exercising the explicit undefined branch
      expect(loadJsonSource(undefined)).to.equal(undefined)
    })

    it('parses inline JSON', () => {
      expect(loadJsonSource('{"a":1}')).to.deep.equal({a: 1})
    })

    it('reads @file JSON', () => {
      expect(loadJsonSource('@x.json', {readFile: () => '{"b":2}'})).to.deep.equal({b: 2})
    })

    it('reads - from the provided stdin reader', () => {
      expect(loadJsonSource('-', {stdin: () => '{"c":3}'})).to.deep.equal({c: 3})
    })

    it('treats empty/whitespace input as undefined', () => {
      expect(loadJsonSource('   ')).to.equal(undefined)
    })

    it('rejects a JSON array', () => {
      expect(() => loadJsonSource('[1,2]')).to.throw(/must be a JSON object/)
    })

    it('rejects a JSON scalar', () => {
      expect(() => loadJsonSource('42')).to.throw(/must be a JSON object/)
    })

    it('rejects invalid JSON', () => {
      expect(() => loadJsonSource('{bad}')).to.throw(/Invalid JSON input/)
    })
  })

  describe('assembleInput', () => {
    it('merges json base then data overrides (data wins)', () => {
      const merged = assembleInput({
        dataPairs: {env: 'staging', shared: 'from-data'},
        jsonBase: {name: 'John', shared: 'from-json'},
      })
      expect(merged).to.deep.equal({env: 'staging', name: 'John', shared: 'from-data'})
    })

    it('handles missing sources', () => {
      expect(assembleInput({})).to.deep.equal({})
      expect(assembleInput({jsonBase: {a: 1}})).to.deep.equal({a: 1})
      expect(assembleInput({dataPairs: {b: 2}})).to.deep.equal({b: 2})
    })
  })

  describe('validateAgainstSchema', () => {
    const schema: FunctionInputParam[] = [
      {name: 'email', required: true, type: 'text'},
      {default: 18, name: 'age', required: true, type: 'int'},
      {name: 'role', type: 'enum', values: ['admin', 'user']},
      {name: 'nickname', nullable: false, type: 'text'},
    ]

    it('reports required params that are missing and have no default', () => {
      const {missingRequired} = validateAgainstSchema({}, schema)
      expect(missingRequired.map((p) => p.name)).to.deep.equal(['email'])
    })

    it('does not flag a missing required param that has a default', () => {
      const {missingRequired} = validateAgainstSchema({email: 'a@b.c'}, schema)
      expect(missingRequired).to.have.length(0)
    })

    it('warns on an out-of-range enum value', () => {
      const {warnings} = validateAgainstSchema({email: 'a@b.c', role: 'ceo'}, schema)
      expect(warnings.join(' ')).to.match(/not one of the allowed values/)
    })

    it('accepts a valid enum value without warnings', () => {
      const {warnings} = validateAgainstSchema({email: 'a@b.c', role: 'admin'}, schema)
      expect(warnings).to.have.length(0)
    })

    it('warns when a non-nullable param is null', () => {
      const {warnings} = validateAgainstSchema({email: 'a@b.c', nickname: null}, schema)
      expect(warnings.join(' ')).to.match(/is null but the parameter is not nullable/)
    })

    it('is a no-op when no schema is provided', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined -- schema arg is required; exercising the undefined branch
      const {missingRequired, warnings} = validateAgainstSchema({}, undefined)
      expect(missingRequired).to.have.length(0)
      expect(warnings).to.have.length(0)
    })
  })
})
