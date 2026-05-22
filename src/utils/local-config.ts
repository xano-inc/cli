import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import {dirname, join, resolve} from 'node:path'

import type {ProfileConfig} from '../base-command.js'

export const LOCAL_PROFILE_FILENAME = 'profile.yaml'

/** Fields a project-local profile.yaml may set. No secrets allowed. */
export interface LocalProfileConfig {
  account_origin?: string
  branch?: string
  instance_origin?: string
  profile?: string
  workspace?: string
}

const RECOGNIZED_KEYS = ['profile', 'workspace', 'instance_origin', 'account_origin', 'branch'] as const

/**
 * Fields that may be layered onto a resolved profile (everything except the profile pointer).
 * NOTE: `insecure` is intentionally NOT listed here — a project file must never silently
 * disable TLS verification (security boundary).
 */
const OVERRIDE_KEYS = ['workspace', 'instance_origin', 'account_origin', 'branch'] as const

/**
 * Parse the raw contents of a profile.yaml.
 * - Throws if `access_token` is present (secrets belong in credentials.yaml).
 * - Returns null if the content is not an object or has no recognized keys
 *   (so an unrelated profile.yaml from another tool is ignored, not hijacked).
 */
export function parseLocalProfile(raw: string): LocalProfileConfig | null {
  const parsed = yaml.load(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const obj = parsed as Record<string, unknown>

  if ('access_token' in obj) {
    throw new Error(
      `profile.yaml must not contain access_token. ` +
        `Tokens belong in credentials.yaml — reference a profile by name instead.`,
    )
  }

  const config: LocalProfileConfig = {}
  for (const key of RECOGNIZED_KEYS) {
    if (obj[key] !== undefined && obj[key] !== null) {
      config[key] = String(obj[key])
    }
  }

  if (Object.keys(config).length === 0) {
    return null
  }

  return config
}

/**
 * Return a new profile with the local override fields applied.
 * The `profile` pointer is never copied; secrets are preserved from the base.
 */
export function applyLocalOverrides(base: ProfileConfig, local: LocalProfileConfig): ProfileConfig {
  const result: ProfileConfig = {...base}
  for (const key of OVERRIDE_KEYS) {
    if (local[key] !== undefined) {
      result[key] = local[key] as string
    }
  }

  return result
}

/**
 * Decide which profile name to use and whether local overrides apply.
 * Precedence: explicit -p/XANO_PROFILE > local profile.yaml > credentials default.
 * An explicit profile disables the local file entirely (name and overrides).
 */
export function resolveProfileSelection(params: {
  defaultProfile: string
  explicitProfile?: string
  hasLocal: boolean
  localProfileName?: string
}): {applyLocal: boolean; profileName: string} {
  if (params.explicitProfile) {
    return {applyLocal: false, profileName: params.explicitProfile}
  }

  if (params.hasLocal) {
    return {applyLocal: true, profileName: params.localProfileName ?? params.defaultProfile}
  }

  return {applyLocal: false, profileName: params.defaultProfile}
}

/** Format the one-line banner shown when a local profile.yaml is in effect. */
export function formatLocalProfileBanner(
  profileName: string,
  workspace: string | undefined,
  relativePath: string,
): string {
  const workspaceClause = workspace ? ` (workspace ${workspace})` : ''
  return `Using profile '${profileName}'${workspaceClause} · ${relativePath}`
}

/**
 * Walk up from `startDir` to the filesystem root, returning the path of the
 * first profile.yaml found, or null if none exists.
 */
export function findLocalProfilePath(startDir: string): null | string {
  let dir = resolve(startDir)

  while (true) {
    const candidate = join(dir, LOCAL_PROFILE_FILENAME)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }

    const parent = dirname(dir)
    if (parent === dir) {
      return null
    }

    dir = parent
  }
}
