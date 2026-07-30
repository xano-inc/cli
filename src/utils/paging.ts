/* eslint-disable camelcase */
import {Flags} from '@oclif/core'

/**
 * How much paging information the backing Metadata API endpoint gives us.
 *
 * The Metadata API pages unevenly, and what the CLI can honestly tell the user
 * depends entirely on what the response carries:
 *
 * - `envelope`            accepts page + per_page and returns
 *                         {curPage, nextPage, prevPage, items[]}. `nextPage` is
 *                         server-computed and null on the last page, so it is the
 *                         one place a "there is more" hint is guaranteed correct.
 * - `page-only-envelope`  accepts page only (per_page is hardcoded server-side)
 *                         and returns an object carrying `itemsTotal`. A true
 *                         total, so we can say where the user sits — but we offer
 *                         no next-page affordance.
 * - `none`                no server-side paging at all. The full set comes back,
 *                         so the item count IS the total.
 *
 * There is deliberately no tier for endpoints that page but return a bare array
 * with no metadata (tenants, releases, platforms, clusters, ephemerals, tenant
 * backups). Those commands are left alone: the only has-more signal available
 * would be "the page came back full", which is a guaranteed false positive when
 * the result set is an exact multiple of the page size — sending the user to an
 * empty page. Better to offer nothing than to offer a lie.
 */
export type PagingTier = 'envelope' | 'none' | 'page-only-envelope'

export interface PagingFlagValues {
  page?: number
  per_page?: number
}

export interface NormalizedList<T> {
  curPage?: number
  items: T[]
  itemsTotal?: number
  nextPage?: number
  prevPage?: number
}

export interface PagingFlagOptions {
  /**
   * Default for the per_page flag. Defaults to 50.
   *
   * Several test-list commands historically pinned per_page to 10000 to fetch
   * everything in one call. Those commands pass that value here so exposing the
   * flag does not silently start truncating results that used to come back whole.
   */
  defaultPerPage?: number
  /** Page size the endpoint hardcodes server-side; surfaced in the page flag description. */
  fixedPerPage?: number
  /** Maximum per_page the endpoint accepts; surfaced in the per_page flag description. */
  maxPerPage?: number
}

function makePageFlag(description: string) {
  return Flags.integer({default: 1, description, required: false})
}

function makePerPageFlag(defaultValue: number, description: string) {
  return Flags.integer({default: defaultValue, description, required: false})
}

type PageFlag = ReturnType<typeof makePageFlag>
type PerPageFlag = ReturnType<typeof makePerPageFlag>

/**
 * Build the oclif flag definitions appropriate to an endpoint's paging tier.
 * Spread the result into a command's `static flags`.
 *
 * A flag the server ignores is worse than no flag, so `per_page` is only
 * produced for tiers whose endpoint actually accepts it. The overloads keep
 * oclif's flag-type inference intact so `flags.page` stays typed at call sites.
 */
export function pagingFlags(
  tier: 'envelope',
  options?: PagingFlagOptions,
): {page: PageFlag; per_page: PerPageFlag}
export function pagingFlags(tier: 'page-only-envelope', options?: PagingFlagOptions): {page: PageFlag}
export function pagingFlags(tier: 'none', options?: PagingFlagOptions): Record<string, never>
export function pagingFlags(tier: PagingTier, options?: PagingFlagOptions): Record<string, unknown>
export function pagingFlags(tier: PagingTier, options: PagingFlagOptions = {}): Record<string, unknown> {
  if (tier === 'none') {
    return {}
  }

  if (tier === 'page-only-envelope') {
    const fixed = options.fixedPerPage
    return {
      page: makePageFlag(
        fixed
          ? `Page number for pagination (page size is fixed at ${fixed} by the API)`
          : 'Page number for pagination',
      ),
    }
  }

  return {
    page: makePageFlag('Page number for pagination'),
    per_page: makePerPageFlag(
      options.defaultPerPage ?? 50,
      options.maxPerPage
        ? `Number of results per page (max ${options.maxPerPage})`
        : 'Number of results per page',
    ),
  }
}

/**
 * Translate parsed paging flags into query-string entries, emitting only the
 * params the endpoint actually declares.
 */
export function buildPagingParams(
  flags: PagingFlagValues | Record<string, unknown>,
  tier: PagingTier,
): Array<[string, string]> {
  if (tier === 'none') {
    return []
  }

  const {page, per_page: perPage} = flags as PagingFlagValues
  const params: Array<[string, string]> = []

  if (page !== undefined) {
    params.push(['page', String(page)])
  }

  if (tier === 'envelope' && perPage !== undefined) {
    params.push(['per_page', String(perPage)])
  }

  return params
}

/** Coerce a possibly-null numeric paging field to a number or undefined. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/**
 * Absorb the response shapes the Metadata API returns for list endpoints:
 * a bare array, a paging envelope keyed on `items`, or an object keyed on the
 * resource name (e.g. `{workspaces: [...]}`).
 *
 * `resourceKeys` names any resource-keyed fallbacks to check, in order.
 */
export function normalizeListResponse<T>(data: unknown, resourceKeys: string[] = []): NormalizedList<T> {
  if (Array.isArray(data)) {
    return {items: data as T[]}
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>

    if (Array.isArray(record.items)) {
      return {
        curPage: optionalNumber(record.curPage),
        items: record.items as T[],
        itemsTotal: optionalNumber(record.itemsTotal),
        nextPage: optionalNumber(record.nextPage),
        prevPage: optionalNumber(record.prevPage),
      }
    }

    for (const key of resourceKeys) {
      if (Array.isArray(record[key])) {
        return {
          curPage: optionalNumber(record.curPage),
          items: record[key] as T[],
          itemsTotal: optionalNumber(record.itemsTotal),
          nextPage: optionalNumber(record.nextPage),
          prevPage: optionalNumber(record.prevPage),
        }
      }
    }
  }

  const accepted = ['an array', 'an object with an items array', ...resourceKeys.map((k) => `an object with a ${k} array`)]
  throw new Error(`Unexpected API response format. Expected ${accepted.join(', ')}.`)
}

export interface PagingFooterOptions {
  /** Singular noun for the listed resource, used by the `none` tier. */
  noun: string
  /** Plural form; defaults to `noun + 's'`. */
  nounPlural?: string
  /** Page the user requested, used when the response omits `curPage`. */
  page?: number
  /** Page size the user requested. Recorded for context; never used to infer a next page. */
  perPage?: number
  tier: PagingTier
}

const SEPARATOR = ' · '

/**
 * Render the paging footer for a list command, reporting only facts the response
 * actually proves. Returns null when there is nothing worth saying — an empty
 * result set already prints its own "No X found" line.
 *
 * Deliberately asymmetric across tiers: `envelope` shows a next-page hint but no
 * total, `page-only-envelope` shows a total but no next-page hint, and `none`
 * shows a bare count. See PagingTier for why.
 */
export function formatPagingFooter<T>(
  list: NormalizedList<T>,
  options: PagingFooterOptions,
): null | string {
  const count = list.items.length
  if (count === 0) {
    return null
  }

  if (options.tier === 'none') {
    const plural = options.nounPlural ?? `${options.noun}s`
    return `${count} ${count === 1 ? options.noun : plural}`
  }

  const page = list.curPage ?? options.page ?? 1
  const parts = [`Page ${page}`, `${count} shown`]

  if (options.tier === 'envelope' && list.nextPage !== undefined) {
    // Server-computed. Null/absent on the last page, so following it can never
    // land on an empty result. Page fullness is never consulted here.
    parts.push(`next: --page ${list.nextPage}`)
  }

  if (options.tier === 'page-only-envelope' && list.itemsTotal !== undefined) {
    parts.push(`${list.itemsTotal} total`)
  }

  return parts.join(SEPARATOR)
}
