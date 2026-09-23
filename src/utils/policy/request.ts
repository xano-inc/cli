import type {ProfileConfig} from '../../base-command.js'

import {describePolicyError} from './errors.js'
import {policyPermissionGuidance} from './permission.js'

/** One request against a policy-family route: a path under it, a method, a JSON body and query params. */
export type PolicyRequest = (path?: string, method?: string, body?: unknown, query?: Record<string, string>) => Promise<unknown>

/** What a request needs from the command that makes it. */
export interface PolicyRequestHost {
  error(message: string): never
  logToStderr(message: string): void
  verboseFetch(url: string, options: RequestInit, verbose: boolean, authToken?: string): Promise<Response>
}

export interface PolicyRequestRoute {
  branch: string
  /** How a failure introduces itself: `Policy request failed (403): …`. */
  label: string
  /** The route under the workspace, e.g. `/policy`. */
  path: string
  profile: ProfileConfig
  verbose: boolean
  workspace: string
}

/** The route the `policy *` commands request. */
export const POLICY_ROUTE: Pick<PolicyRequestRoute, 'label' | 'path'> = {label: 'Policy', path: '/policy'}

/** The workspace and branch a command targets: its flags first, then the profile. `-b ''` selects live. */
export function policyScope(flags: {branch?: string; workspace?: string}, profile: ProfileConfig): {branch: string; workspace: string} {
  // A workspace from profile.yaml or the credentials file can arrive from YAML as a number.
  return {branch: flags.branch ?? profile.branch ?? '', workspace: String(flags.workspace || profile.workspace || '')}
}

/**
 * A request against a route gated by `workspace:policy`: failures are folded to the platform's code,
 * message and position, the token is redacted, and a refusal says which permission gate answered.
 */
export function policyRequest(host: PolicyRequestHost, route: PolicyRequestRoute): PolicyRequest {
  const {branch, label, profile, verbose, workspace} = route
  const base = `${profile.instance_origin}/api:meta/workspace/${workspace}${route.path}`
  return async (path = '', method = 'GET', body?: unknown, query: Record<string, string> = {}) => {
    const url = `${base}${path}?${new URLSearchParams({branch, ...query})}`
    const response = await host.verboseFetch(
      url,
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
          ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        },
        method,
      },
      verbose,
      profile.access_token,
    )
    if (!response.ok) {
      const text = (await response.text()).replaceAll(profile.access_token, '[REDACTED]')
      if (verbose && text) host.logToStderr(text)
      const {message, payload} = describePolicyError(text, response.status, url)
      host.error(`${label} request failed (${response.status}): ${message}${policyPermissionGuidance(response.status, payload)}`)
    }

    // The DELETE route can answer with no body at all; every other route sends JSON.
    const text = await response.text()
    if (text.trim() === '') return {}
    try {
      return JSON.parse(text)
    } catch {
      return host.error(`${label} request to ${path || '/'} returned a ${response.status} that is not JSON.`)
    }
  }
}

/** A request host's `error` for a caller that asks rather than fails: it throws instead of exiting. */
function fail(message: string): never {
  throw new Error(message)
}

/**
 * Whether this credential can list the branch's policies. An export leaves out the policies its
 * credential cannot read, without refusing, so this tells an export without policies from one that
 * withheld them. Any failure answers `false`.
 */
export async function canListPolicies(
  host: Omit<PolicyRequestHost, 'error'>,
  route: Omit<PolicyRequestRoute, 'label' | 'path'>,
): Promise<boolean> {
  const list = policyRequest({...host, error: fail}, {...route, ...POLICY_ROUTE})
  return list().then(() => true, () => false)
}

/** The `items` of a list envelope, as every policy list route answers. */
export function listItems<T>(data: unknown): T[] {
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) return data.items
  throw new Error('The platform answered a list request without an items array.')
}
