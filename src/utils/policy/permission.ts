/**
 * A policy request can be refused by different server gates, and each has a different remedy. The
 * platform names the gate in the refusal's `payload.code`:
 *
 *   policy_feature_disabled      the instance's `policies` feature is off
 *   policy_permission_required   the caller's role lacks the `workspace:policy` level on this workspace
 *   policy_scope_required        the Metadata API token was created without that level
 *   policy_weakening_permission_required
 *                                a push, set-live or merge weakens a policy that is active and
 *                                mandatory on the branch, which needs the `update` level;
 *                                deleting one (gate `delete`), or an archive import that would
 *                                remove one, too
 *
 * `payload.level` is the level the request needed, and a refused push lists the policy files it
 * carried in `payload.policies`. A refusal without a code gets no advice beyond its own message.
 */
interface Refusal {
  code?: unknown
  /** The gate a weakening refusal names: `push`, `set_live`, `merge`, `archive_import` or `delete`. */
  gate?: unknown
  level?: unknown
  policies?: unknown
  /** A weakening refusal whose check could not read the policies (it fails closed). */
  unavailable?: unknown
}

const TOKEN_SETTINGS = 'Instance settings → Metadata API & MCP Server → Manage Access Tokens'

/**
 * The refusal of a change that weakens a policy active and mandatory on the branch (demotes,
 * deactivates or deletes it, or loosens one of its rules; for a set-live, a live policy the branch
 * lacks) from a caller without the `workspace:policy` update permission. It is a permission refusal,
 * not a blocking finding, so a command exits 1 on it. `payload.policies` names the policies.
 */
export const WEAKENING_REFUSAL = 'policy_weakening_permission_required'

function refusalOf(payload: unknown): Refusal {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Refusal : {}
}

/** `workspace:policy create`, or just `workspace:policy` when the refusal names no level. */
function permissionAt(refusal: Refusal): string {
  return `\`workspace:policy\`${typeof refusal.level === 'string' && refusal.level ? ` ${refusal.level}` : ''}`
}

/** Guidance appended to a refused policy request, given the HTTP status and the refusal's payload. */
export function policyPermissionGuidance(status: number, payload: unknown): string {
  if (status === 401) {
    return `\nThe Metadata API token was not accepted: it is missing, expired or revoked. Check the active profile (xano profile list) or create a new token: ${TOKEN_SETTINGS}.`
  }

  const refusal = refusalOf(payload)
  switch (refusal.code) {
    case 'policy_feature_disabled': {
      return '\nThe Policies feature is turned off for this instance, so no token or permission can reach it. Ask your Xano contact to enable Policies.'
    }

    case 'policy_permission_required': {
      return `\nYour role on this workspace lacks the ${permissionAt(refusal)} permission. Your token is fine — reissuing it will not help. Ask an instance admin to grant it.${
        refusal.level === 'read' ? '' : ' Reading policies and running checks need only read.'}`
    }

    case 'policy_scope_required': {
      return `\nThis Metadata API token was created without the ${permissionAt(refusal)} scope. Create a token that has it: ${TOKEN_SETTINGS}.`
    }

    case WEAKENING_REFUSAL: {
      return policyWeakeningGuidance(payload)
    }

    default: {
      return ''
    }
  }
}

/**
 * Guidance for a `workspace push` (or its preview) refused because it would change policies, or
 * because its policy files weaken a mandatory policy of the live branch, or `undefined` for any
 * other refusal.
 */
export function policyFilePushGuidance(payload: unknown): string | undefined {
  const refusal = refusalOf(payload)
  if (refusal.code === WEAKENING_REFUSAL) {
    return policyWeakeningGuidance(payload, [
      'To push everything else, leave the policy files out:  xano workspace push -e "policies/*"',
      'To discard your local policy edits, pull again:        xano workspace pull',
    ], true)
  }

  if (!Array.isArray(refusal.policies) || refusal.policies.length === 0) return undefined
  const remedy = {
    policy_permission_required: '\n  - To change a policy, ask someone with that permission to push it or to run xano policy publish.',
    policy_scope_required: `\n  - To change a policy yourself, create a token with that scope: ${TOKEN_SETTINGS}.`,
  }[String(refusal.code)]
  if (!remedy) return undefined
  return (
    `\nThis push contains policy files that differ from the policies on the branch, and changing them needs the ${permissionAt(refusal)} ${
      refusal.code === 'policy_scope_required' ? 'scope on your token' : 'permission'}.` +
    '\nNothing was imported. Policy files that are unchanged never cause this.' +
    '\n  - To push everything else, leave the policy files out:  xano workspace push -e "policies/*"' +
    '\n  - To discard your local policy edits, pull again:        xano workspace pull' +
    remedy
  )
}

/**
 * Guidance for a change refused with `policy_weakening_permission_required`. The platform's sentence
 * already names the policies and what was left alone; this says why (a delete of a mandatory policy,
 * or a check that could not read the policies and so fails closed), that `--policy-override` does
 * not stand in for the permission when the command has that flag (`overrideFlag`), and how to go on:
 * `ways` are the command's own, before the fallback of asking someone who holds the permission.
 */
export function policyWeakeningGuidance(payload: unknown, ways: string[] = [], overrideFlag = false): string {
  const refusal = refusalOf(payload)
  const permission = `${permissionAt({level: refusal.level ?? 'update'})} permission`
  const why = refusal.unavailable === true
    ? `The policies could not be read to check this, so only someone with the ${permission} may proceed.`
    : refusal.gate === 'delete'
      ? `Deleting a policy that is active and mandatory weakens it, so it needs the ${permission}, not only delete.`
      : `Weakening means demoting, deactivating or deleting a mandatory policy, or loosening one of its rules, and it needs the ${permission}.`
  return (
    `\n${why}${overrideFlag ? ' --policy-override does not stand in for it.' : ''}` +
    [...ways, `${ways.length > 0 ? 'Or ask' : 'Ask'} someone who holds that permission to make this change, or an instance admin to grant it to your role.`].map(way => `\n  - ${way}`).join('')
  )
}
