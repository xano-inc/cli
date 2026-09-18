/**
 * A policy request can be refused by three different server gates, and each has a different
 * remedy. The server tells them apart by message, so the CLI does too:
 *
 *   feature   "Policies are not enabled on this instance."      the `policies` feature is off
 *   role      "Policy changes require the admin role."           the author gate (writes only)
 *             "Policy files require the admin role; nothing was imported: KEY, …"   (workspace push)
 *   scope     "Access Denied." / "insufficient_scope: …"          the token's workspace:policy scope,
 *                                                               the role's permission, or an OAuth ceiling
 *
 * Blaming every 403 on the token sends a developer off to reissue a token that was never the problem.
 */
export type PolicyRefusal = 'feature' | 'role' | 'scope' | 'session'

const TOKEN_SETTINGS = 'Instance settings → Metadata API & MCP Server → Manage Access Tokens'

export function classifyPolicyRefusal(message: string): PolicyRefusal {
  if (/policies are not enabled/i.test(message)) return 'feature'
  if (/requires? the admin role/i.test(message)) return 'role'
  if (/read-only session/i.test(message)) return 'session'
  return 'scope'
}

/** True when a 403 on `workspace push` / its preview is the policy-file refusal rather than any other permission. */
export function isPolicyFileRefusal(message: string): boolean {
  return /policy files require the admin role/i.test(message)
}

/** Guidance appended to a refused policy request. Empty for a status that is not a permission answer. */
export function policyPermissionGuidance(status: number, message: string): string {
  if (status === 401) {
    return `\nThe Metadata API token was not accepted: it is missing, expired or revoked. Check the active profile (xano profile list) or create a new token with the workspace:policy scope: ${TOKEN_SETTINGS}.`
  }

  if (status !== 403) return ''
  switch (classifyPolicyRefusal(message)) {
    case 'feature': {
      return '\nThe Policies feature is turned off for this instance, so no token or role can reach it. Ask your Xano contact to enable Policies.'
    }

    case 'role': {
      return '\nCreating, changing and deleting policies requires the admin role on the instance. Your token is fine — reissuing it will not help. Ask an instance admin to make this change, or to change your role. You can still read policies and run checks.'
    }

    case 'session': {
      return '\nThis token belongs to a read-only session. Use a token from a session that allows editing.'
    }

    default: {
      return `\nPolicy access requires the workspace:policy scope at the level of the request: read to list, read and run checks; create, update or delete to change policies. Reissue the Metadata API token with that scope: ${TOKEN_SETTINGS}. If the token already has it, your role's "Workspace Policies" permission on this workspace is what is missing — ask an instance admin.`
    }
  }
}

/** Guidance for a `workspace push` (or its preview) refused because it carries changed policy files. */
export function policyFilePushGuidance(): string {
  return (
    '\nThis push contains policy files that differ from the policies on the branch, and only an instance admin with the workspace:policy scope can change policies.' +
    '\nNothing was imported. Policy files that are unchanged never cause this.' +
    '\n  - To push everything else, leave the policy files out:  xano workspace push -e "policies/*"' +
    '\n  - To discard your local policy edits, pull again:        xano workspace pull' +
    '\n  - To change a policy, ask an instance admin to push it or to run xano policy publish.'
  )
}
