import {expect} from 'chai'

import {checkTableIndexes} from '../../src/utils/reference-checker.js'

// DEV-7884: checkTableIndexes emitted a false-positive `CRITICAL: Invalid Indexes`
// for `gin` (and other) indexes on array-typed columns, via two independent parse
// defects — the schema-field regex could not see an `enum[]`/`text[]` type token, and
// the index-array extractor truncated the block at the first `]`-only line (often an
// inner multi-line `field: [ … ]` closer), dropping later index entries. These tests
// drive the public `checkTableIndexes` and would fail on the pre-fix parser.
describe('checkTableIndexes', () => {
  describe('array-typed schema fields (DEV-7884 defect 1)', () => {
    it('does not flag a gin index on an enum[] column (the offline repro)', () => {
      const content = `table admin {
  schema {
    enum[]? roles?
  }
  index = [
    { type: "gin", field: [ { name: "roles" } ] }
  ]
}
`
      expect(checkTableIndexes([{content}])).to.deep.equal([])
    })

    it('recognizes every array type: enum[], text[], int[], json[]', () => {
      const content = `table products {
  schema {
    enum[]? categories?
    text[] tags
    int[]? scores?
    json[] blobs
  }
  index = [
    { type: "gin", field: [ { name: "categories" } ] },
    { type: "gin", field: [ { name: "tags" } ] },
    { type: "gin", field: [ { name: "scores" } ] },
    { type: "gin", field: [ { name: "blobs" } ] }
  ]
}
`
      expect(checkTableIndexes([{content}])).to.deep.equal([])
    })
  })

  describe('full index block parsing (DEV-7884 defect 2)', () => {
    it('does not flag a later gin index after a multi-line first entry (valid columns)', () => {
      // The first entry's `field: [ … ]` list closes with a `]` on its own line — the
      // exact shape that truncated the block pre-fix. The later `gin` on an array-typed
      // column must still be seen as valid.
      const content = `table events {
  schema {
    text title
    enum[]? roles?
  }
  index = [
    {
      type: "btree",
      field: [
        { name: "title" }
      ]
    },
    {
      type: "gin",
      field: [
        { name: "roles" }
      ]
    }
  ]
}
`
      expect(checkTableIndexes([{content}])).to.deep.equal([])
    })

    it('reaches a later index entry past a multi-line field list (absent column still flagged)', () => {
      // Proves the whole block is parsed: a later entry on a truly-absent column MUST be
      // reported. Pre-fix, the block truncated after the first entry and this was dropped.
      const content = `table logs {
  schema {
    text title
  }
  index = [
    {
      type: "btree",
      field: [
        { name: "title" }
      ]
    },
    {
      type: "gin",
      field: [
        { name: "ghost" }
      ]
    }
  ]
}
`
      expect(checkTableIndexes([{content}])).to.deep.equal([{field: 'ghost', indexType: 'gin', table: 'logs'}])
    })
  })

  describe('true-positive guard (no false negatives from the widened parse)', () => {
    it('still flags an index referencing a field absent from the schema', () => {
      const content = `table users {
  schema {
    text name
    int? age?
  }
  index = [
    { type: "btree", field: [ { name: "missing_col" } ] }
  ]
}
`
      expect(checkTableIndexes([{content}])).to.deep.equal([
        {field: 'missing_col', indexType: 'btree', table: 'users'},
      ])
    })

    it('does not flag a valid index on a plain scalar field (common-case regression)', () => {
      const content = `table accounts {
  schema {
    text email
    int? status?
  }
  index = [
    { type: "btree", field: [ { name: "email" } ] }
  ]
}
`
      expect(checkTableIndexes([{content}])).to.deep.equal([])
    })
  })
})
