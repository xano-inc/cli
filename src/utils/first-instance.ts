/**
 * An account with no instance yet (DEV-10170).
 *
 * Since trials replaced the free plan, a new Xano account gets its first instance from its trial.
 * The dashboard's sign-up goes on to `/welcome` and then `/trial`, but a sign-up started from
 * `xano auth` (`dest=cli`) hands the token straight back to the CLI, so the account it makes
 * lists no instance. These helpers send that account to Xano's trial page instead of ending at
 * "No instances found".
 */

/** The error code a no-instance stop carries, for `--json` consumers. */
export const NO_INSTANCE_CODE = 'no_instance'

/** How long the browser callback waits on the instance check before it shows the plain page. */
export const TRIAL_CHECK_TIMEOUT_MS = 5000

/**
 * Whether `origin` is Xano's own control plane (app.xano.com, app.dev.xano.com, ...), where an
 * account lists its instances and starts its trial. Any other origin is a self-hosted instance.
 */
export function isXanoCloudOrigin(origin: string): boolean {
  return /^https:\/\/app\.(.*\.)?xano\.com$/.test(origin)
}

/** Xano's trial page on the control plane at `origin`. */
export function trialPageUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/trial`
}

/** What the CLI says when the account has no instance; `retry` is the command to run after. */
export function noInstanceMessage(origin: string, retry: string): string {
  return `Your Xano account has no instance yet. Start your free trial at ${trialPageUrl(origin)} to get one, then run \`${retry}\` again.`
}

/**
 * Xano's trial page when `listInstances` answers an empty list, else null. A failure, a timeout or
 * an account with instances is null, so the caller shows its plain page.
 */
export async function trialPageIfNoInstance(
  listInstances: () => Promise<unknown[]>,
  origin: string,
  timeoutMs = TRIAL_CHECK_TIMEOUT_MS,
): Promise<null | string> {
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })

  try {
    const instances = await Promise.race([listInstances(), timedOut])
    return Array.isArray(instances) && instances.length === 0 ? trialPageUrl(origin) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
