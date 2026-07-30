/* eslint-disable camelcase */
import {expect} from 'chai'

import {
  buildPagingJson,
  buildPagingParams,
  formatPagingFooter,
  normalizeListResponse,
  pagingFlags,
} from '../../src/utils/paging.js'

describe('paging', () => {
  describe('pagingFlags', () => {
    it('returns both page and per_page for the envelope tier', () => {
      const flags = pagingFlags('envelope')
      expect(Object.keys(flags).sort()).to.deep.equal(['page', 'per_page'])
    })

    it('defaults page to 1 and per_page to 50 for the envelope tier', () => {
      const flags = pagingFlags('envelope') as Record<string, {default?: number}>
      expect(flags.page.default).to.equal(1)
      expect(flags.per_page.default).to.equal(50)
    })

    it('honors an overridden per_page default', () => {
      // Test-list commands pin this to 10000 to preserve fetch-everything behavior.
      const flags = pagingFlags('envelope', {defaultPerPage: 10_000}) as Record<
        string,
        {default?: number}
      >
      expect(flags.per_page.default).to.equal(10_000)
    })

    it('returns only page for the page-only-envelope tier', () => {
      const flags = pagingFlags('page-only-envelope')
      expect(Object.keys(flags)).to.deep.equal(['page'])
      expect(flags).to.not.have.property('per_page')
    })

    it('names the server-fixed page size in the page flag description', () => {
      const flags = pagingFlags('page-only-envelope', {fixedPerPage: 100}) as Record<
        string,
        {description?: string}
      >
      expect(flags.page.description).to.contain('100')
    })

    it('names the maximum in the per_page description when given', () => {
      const flags = pagingFlags('envelope', {maxPerPage: 10_000}) as Record<
        string,
        {description?: string}
      >
      expect(flags.per_page.description).to.contain('10000')
    })

    it('returns an empty object for the none tier', () => {
      expect(pagingFlags('none')).to.deep.equal({})
    })
  })

  describe('buildPagingParams', () => {
    it('emits both params for the envelope tier', () => {
      expect(buildPagingParams({page: 1, per_page: 50}, 'envelope')).to.deep.equal([
        ['page', '1'],
        ['per_page', '50'],
      ])
    })

    it('emits page and omits per_page for the page-only-envelope tier', () => {
      expect(buildPagingParams({page: 2, per_page: 25}, 'page-only-envelope')).to.deep.equal([
        ['page', '2'],
      ])
    })

    it('emits nothing for the none tier', () => {
      expect(buildPagingParams({page: 1, per_page: 50}, 'none')).to.deep.equal([])
    })

    it('omits params that are undefined on the flags object', () => {
      expect(buildPagingParams({}, 'envelope')).to.deep.equal([])
    })
  })

  describe('normalizeListResponse', () => {
    it('wraps a bare array with no paging metadata', () => {
      const result = normalizeListResponse([{id: 1}])
      expect(result.items).to.deep.equal([{id: 1}])
      expect(result.curPage).to.equal(undefined)
      expect(result.nextPage).to.equal(undefined)
      expect(result.prevPage).to.equal(undefined)
      expect(result.itemsTotal).to.equal(undefined)
    })

    it('passes through a full paging envelope', () => {
      const result = normalizeListResponse({
        curPage: 2,
        items: [{id: 1}],
        nextPage: 3,
        prevPage: 1,
      })
      expect(result.curPage).to.equal(2)
      expect(result.nextPage).to.equal(3)
      expect(result.prevPage).to.equal(1)
      expect(result.items).to.deep.equal([{id: 1}])
    })

    it('normalizes a null nextPage to undefined', () => {
      const result = normalizeListResponse({curPage: 2, items: [], nextPage: null})
      expect(result.nextPage).to.equal(undefined)
    })

    it('extracts items from a named resource key', () => {
      const result = normalizeListResponse({workspaces: [{id: 7}]}, ['workspaces'])
      expect(result.items).to.deep.equal([{id: 7}])
    })

    it('prefers an items key over a named resource key', () => {
      const result = normalizeListResponse({items: [{id: 1}], workspaces: [{id: 7}]}, ['workspaces'])
      expect(result.items).to.deep.equal([{id: 1}])
    })

    it('preserves itemsTotal when present', () => {
      const result = normalizeListResponse({items: [{id: 1}], itemsTotal: 340})
      expect(result.itemsTotal).to.equal(340)
    })

    it('throws a descriptive error for an unrecognized shape', () => {
      expect(() => normalizeListResponse({unexpected: 'shape'})).to.throw(/Unexpected API response/)
    })

    it('names the accepted shapes in the error message', () => {
      expect(() => normalizeListResponse({unexpected: 'shape'})).to.throw(/items/)
    })

    it('treats an empty array as a valid empty result', () => {
      expect(normalizeListResponse([]).items).to.deep.equal([])
    })
  })

  describe('formatPagingFooter', () => {
    const noun = {noun: 'function'}

    it('reports page, count, and next-page hint for the envelope tier', () => {
      const footer = formatPagingFooter(
        {curPage: 2, items: Array.from({length: 50}, () => ({})), nextPage: 3},
        {...noun, tier: 'envelope'},
      )
      expect(footer).to.contain('Page 2')
      expect(footer).to.contain('50 shown')
      expect(footer).to.contain('--page 3')
    })

    it('omits the next-page hint on the last page', () => {
      const footer = formatPagingFooter(
        {curPage: 4, items: Array.from({length: 12}, () => ({}))},
        {...noun, tier: 'envelope'},
      )
      expect(footer).to.contain('Page 4')
      expect(footer).to.contain('12 shown')
      expect(footer).to.not.contain('--page')
    })

    it('never infers a next page from a full page of results', () => {
      // The exact-multiple case: 50 of 50 returned, but the server says there is
      // no next page. Page fullness must never be used as a has-more signal.
      const footer = formatPagingFooter(
        {curPage: 1, items: Array.from({length: 50}, () => ({})), nextPage: undefined},
        {...noun, perPage: 50, tier: 'envelope'},
      )
      expect(footer).to.not.contain('--page')
      expect(footer).to.not.contain('more')
    })

    it('reports a true total for the page-only-envelope tier', () => {
      const footer = formatPagingFooter(
        {curPage: 2, items: Array.from({length: 100}, () => ({})), itemsTotal: 340},
        {noun: 'static host', tier: 'page-only-envelope'},
      )
      expect(footer).to.contain('Page 2')
      expect(footer).to.contain('100 shown')
      expect(footer).to.contain('340 total')
    })

    it('never emits a next-page hint for the page-only-envelope tier', () => {
      const footer = formatPagingFooter(
        {curPage: 2, items: Array.from({length: 100}, () => ({})), itemsTotal: 340},
        {noun: 'static host', tier: 'page-only-envelope'},
      )
      expect(footer).to.not.contain('--page')
    })

    it('omits the total when itemsTotal is absent', () => {
      const footer = formatPagingFooter(
        {curPage: 2, items: Array.from({length: 100}, () => ({}))},
        {noun: 'static host', tier: 'page-only-envelope'},
      )
      expect(footer).to.equal('Page 2 · 100 shown')
      expect(footer).to.not.contain('undefined')
    })

    it('falls back to the requested page only when other metadata confirms paging', () => {
      // itemsTotal proves the endpoint honored paging, so the requested page is
      // a safe stand-in for an absent curPage.
      const footer = formatPagingFooter(
        {items: Array.from({length: 5}, () => ({})), itemsTotal: 40},
        {noun: 'static host', page: 3, tier: 'page-only-envelope'},
      )
      expect(footer).to.contain('Page 3')
      expect(footer).to.contain('40 total')
    })

    it('reports a plain pluralized count for the none tier', () => {
      const footer = formatPagingFooter(
        {items: Array.from({length: 12}, () => ({}))},
        {noun: 'branch', nounPlural: 'branches', tier: 'none'},
      )
      expect(footer).to.equal('12 branches')
    })

    it('uses the singular noun for a single item on the none tier', () => {
      const footer = formatPagingFooter({items: [{}]}, {noun: 'branch', nounPlural: 'branches', tier: 'none'})
      expect(footer).to.equal('1 branch')
    })

    it('defaults the plural to noun + s', () => {
      const footer = formatPagingFooter({items: Array.from({length: 3}, () => ({}))}, {noun: 'workspace', tier: 'none'})
      expect(footer).to.equal('3 workspaces')
    })

    it('never reports a page number for the none tier', () => {
      const footer = formatPagingFooter(
        {curPage: 1, items: Array.from({length: 4}, () => ({}))},
        {noun: 'knowledge item', tier: 'none'},
      )
      expect(footer).to.not.contain('Page')
    })

    it('returns null for an empty result set', () => {
      expect(formatPagingFooter({items: []}, {...noun, tier: 'envelope'})).to.equal(null)
      expect(formatPagingFooter({items: []}, {...noun, tier: 'none'})).to.equal(null)
    })

    it('falls back to a bare count when a paged response carried no metadata', () => {
      // The endpoint may have ignored `page` entirely; printing the requested
      // page would state the user's wish as a server fact.
      const footer = formatPagingFooter(
        {items: Array.from({length: 12}, () => ({}))},
        {...noun, page: 7, tier: 'envelope'},
      )
      expect(footer).to.equal('12 functions')
      expect(footer).to.not.contain('Page 7')
    })

    it('reports an empty page past the end when the true total is known', () => {
      // Distinguishes "you paged past the end" from "this workspace is empty".
      const footer = formatPagingFooter(
        {curPage: 99, items: [], itemsTotal: 340},
        {noun: 'static host', tier: 'page-only-envelope'},
      )
      expect(footer).to.equal('Page 99 · 0 shown · 340 total')
    })

    it('still returns null for an empty page when no total is known', () => {
      expect(
        formatPagingFooter({curPage: 99, items: []}, {noun: 'static host', tier: 'page-only-envelope'}),
      ).to.equal(null)
    })
  })

  describe('buildPagingJson', () => {
    it('always reports count and items', () => {
      const payload = buildPagingJson({items: [{id: 1}, {id: 2}]}, {tier: 'none'})
      expect(payload.count).to.equal(2)
      expect(payload.items).to.deep.equal([{id: 1}, {id: 2}])
    })

    it('omits paging fields entirely for the none tier', () => {
      const payload = buildPagingJson({curPage: 1, items: [{id: 1}]}, {tier: 'none'})
      expect(payload).to.not.have.property('page')
      expect(payload).to.not.have.property('total')
      expect(payload).to.not.have.property('next_page')
    })

    it('surfaces the server-computed next page for the envelope tier', () => {
      const payload = buildPagingJson(
        {curPage: 2, items: [{id: 1}], nextPage: 3, prevPage: 1},
        {perPage: 50, tier: 'envelope'},
      )
      expect(payload.page).to.equal(2)
      expect(payload.next_page).to.equal(3)
      expect(payload.prev_page).to.equal(1)
      expect(payload.per_page).to.equal(50)
    })

    it('omits next_page on the last page rather than emitting null', () => {
      const payload = buildPagingJson({curPage: 4, items: [{id: 1}]}, {tier: 'envelope'})
      expect(payload).to.not.have.property('next_page')
    })

    it('surfaces the true total for the page-only-envelope tier', () => {
      const payload = buildPagingJson(
        {curPage: 2, items: [{id: 1}], itemsTotal: 340},
        {tier: 'page-only-envelope'},
      )
      expect(payload.total).to.equal(340)
    })

    it('omits per_page for the page-only-envelope tier, which the API fixes server-side', () => {
      const payload = buildPagingJson(
        {curPage: 2, items: [{id: 1}], itemsTotal: 340},
        {perPage: 50, tier: 'page-only-envelope'},
      )
      expect(payload).to.not.have.property('per_page')
    })

    it('asserts no position when a paged response carried no metadata', () => {
      const payload = buildPagingJson({items: [{id: 1}]}, {page: 7, tier: 'envelope'})
      expect(payload).to.not.have.property('page')
      expect(payload.count).to.equal(1)
    })

    it('gives a script a real stop condition instead of page-fullness inference', () => {
      // 50 of 50 returned but the server says there is no next page.
      const payload = buildPagingJson(
        {curPage: 1, items: Array.from({length: 50}, () => ({}))},
        {perPage: 50, tier: 'envelope'},
      )
      expect(payload).to.not.have.property('next_page')
      expect(payload.count).to.equal(50)
    })
  })
})
