import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const UPDATE_CHECK_FILE = path.join(os.homedir(), '.xano', 'update-check.json')
const CHECK_INTERVAL_MS = 8 * 60 * 60 * 1000 // 8 hours

interface UpdateCheckCache {
  lastCheck: number
  latestVersion: string
}

function isBeta(version: string): boolean {
  return version.includes('beta') || version.includes('alpha') || version.includes('rc')
}

/** Returns true if `latest` is a higher semver than `current`. */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }

  return false
}

function readCache(): UpdateCheckCache | null {
  try {
    if (!fs.existsSync(UPDATE_CHECK_FILE)) return null
    const data = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, 'utf8'))
    if (data && typeof data.lastCheck === 'number' && typeof data.latestVersion === 'string') {
      return data as UpdateCheckCache
    }

    return null
  } catch {
    return null
  }
}

export function clearUpdateCache(): void {
  try {
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      fs.unlinkSync(UPDATE_CHECK_FILE)
    }
  } catch {
    // Silently fail
  }
}

function writeCache(latestVersion: string): void {
  try {
    const dir = path.dirname(UPDATE_CHECK_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true})
    }

    fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify({lastCheck: Date.now(), latestVersion}))
  } catch {
    // Silently fail — update check is best-effort
  }
}

function fetchLatestVersion(): string | null {
  try {
    return execSync('npm view @xano/cli version', {encoding: 'utf8', timeout: 5000}).trim()
  } catch {
    return null
  }
}

/**
 * Check if an update is available. Returns an update message string if there
 * is an update, or null if the CLI is up to date / on a beta / check not due.
 *
 * The check hits npm at most once every 24 hours and caches the result.
 */
export function checkForUpdate(currentVersion: string, forceCheck = false): string | null {
  if (!forceCheck && isBeta(currentVersion)) return null

  const cache = readCache()
  const now = Date.now()

  let latestVersion: string | null = null

  if (cache && now - cache.lastCheck < CHECK_INTERVAL_MS) {
    latestVersion = cache.latestVersion
  } else {
    latestVersion = fetchLatestVersion()
    if (latestVersion) {
      writeCache(latestVersion)
    }
  }

  if (!latestVersion || !isNewer(latestVersion, currentVersion)) return null

  const yellow = '\u001B[33m'
  const cyan = '\u001B[36m'
  const reset = '\u001B[0m'
  return `\n${yellow}Notice: Update available ${currentVersion} → ${latestVersion}\nRun ${cyan}xano update${yellow} to update${reset}\n`
}
