import {Config} from '@oclif/core'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import inquirer from 'inquirer'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import Auth, {callbackSuccessPage} from '../../../src/commands/auth/index.js'
import {
  isXanoCloudOrigin,
  NO_INSTANCE_CODE,
  noInstanceMessage,
  trialPageIfNoInstance,
  trialPageUrl,
} from '../../../src/utils/first-instance.js'

// DEV-10170: an account made from `xano auth`'s sign-up has no instance (its first one comes from
// the trial the dashboard's sign-up reaches through /welcome -> /trial), so the CLI sends it to
// Xano's trial page instead of ending at "No instances found".

const ORIGIN = 'https://app.dev.xano.com'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status})
const anInstance = {display: 'US-1', id: 7, meta_api: 'https://x1.dev.xano.io/api:meta', name: 'x1'}

describe('an account with no instance yet (DEV-10170)', () => {
  describe('first instance helpers (DEV-10170)', () => {
    it('knows the Xano control planes from a self-hosted origin', () => {
      expect(isXanoCloudOrigin('https://app.xano.com')).to.equal(true)
      expect(isXanoCloudOrigin('https://app.dev.xano.com')).to.equal(true)
      expect(isXanoCloudOrigin('https://xano.mycompany.com')).to.equal(false)
      expect(isXanoCloudOrigin('http://app.xano.com')).to.equal(false)
    })

    it('names the trial page on the origin, with or without a trailing slash', () => {
      expect(trialPageUrl(ORIGIN)).to.equal('https://app.dev.xano.com/trial')
      expect(trialPageUrl(`${ORIGIN}/`)).to.equal('https://app.dev.xano.com/trial')
    })

    it('says where to start the trial and what to run after', () => {
      expect(noInstanceMessage(ORIGIN, 'xano auth')).to.equal(
        'Your Xano account has no instance yet. Start your free trial at https://app.dev.xano.com/trial to get one, then run `xano auth` again.',
      )
    })

    it('answers the trial page only for an empty listing', async () => {
      expect(await trialPageIfNoInstance(async () => [], ORIGIN)).to.equal('https://app.dev.xano.com/trial')
      expect(await trialPageIfNoInstance(async () => [anInstance], ORIGIN)).to.equal(null)
    })

    it('answers null when the listing fails or takes too long', async () => {
      expect(
        await trialPageIfNoInstance(async () => {
          throw new Error('API request failed with status 500')
        }, ORIGIN),
      ).to.equal(null)
      expect(await trialPageIfNoInstance(() => new Promise<unknown[]>(() => {}), ORIGIN, 20)).to.equal(null)
    })
  })

  describe('auth callback page (DEV-10170)', () => {
    it('sends an account with no instance on to the trial', () => {
      const page = callbackSuccessPage('https://app.dev.xano.com/trial')
      expect(page).to.contain('Authentication Successful')
      expect(page).to.contain('<a class="next" href="https://app.dev.xano.com/trial">Start free trial</a>')
      expect(page).to.not.contain('You can now close this window')
    })

    it('keeps the plain page for an account with an instance', () => {
      const page = callbackSuccessPage(null)
      expect(page).to.contain('You can now close this window and return to your terminal.')
      expect(page).to.not.contain('Start free trial')
    })

    it('escapes the trial link', () => {
      expect(callbackSuccessPage('https://a.xano.com/trial?"><script>')).to.contain(
        'href="https://a.xano.com/trial?&quot;&gt;&lt;script&gt;"',
      )
    })
  })

  describe('auth with an account that has no instance (DEV-10170)', () => {
    let config: Config
    let directory: string
    let originalFetch: typeof globalThis.fetch
    let originalPrompt: typeof inquirer.prompt
    let originalExit: typeof process.exit
    let instanceLists: unknown[][]
    let requested: string[]

    before(async () => {
      config = await Config.load({root: process.cwd()})
    })

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-auth-'))
      originalFetch = globalThis.fetch
      originalPrompt = inquirer.prompt
      originalExit = process.exit
      requested = []
      instanceLists = [[]]
      // A non-interactive run must never prompt; the interactive tests answer for the user.
      inquirer.prompt = (async () => {
        throw new Error('unexpected prompt')
      }) as unknown as typeof inquirer.prompt
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        requested.push(url.pathname)
        if (url.pathname === '/api:meta/auth/me') return json({email: 'new@example.com', id: 1, name: 'New'})
        if (url.pathname === '/api:meta/instance') return json(instanceLists.length > 1 ? instanceLists.shift() : instanceLists[0])
        if (url.pathname === '/api:meta/workspace') return json([])
        return json({message: 'not found'}, 404)
      }) as typeof globalThis.fetch
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
      inquirer.prompt = originalPrompt
      process.exit = originalExit
      process.exitCode = undefined
      fs.rmSync(directory, {force: true, recursive: true})
    })

    const credentials = () => path.join(directory, 'credentials.yaml')

    it('stops a non-interactive run with the trial page, and saves no profile', async () => {
      const {error} = await runCommand(['auth', '--code', 'tok', '--origin', ORIGIN, '--config', credentials()], config)
      expect(error?.message).to.equal(noInstanceMessage(ORIGIN, 'xano auth'))
      expect((error as {code?: string})?.code).to.equal(NO_INSTANCE_CODE)
      expect(fs.existsSync(credentials())).to.equal(false)
    })

    it('gives --json consumers the no_instance code and the trial page', async () => {
      const {stdout} = await runCommand(['auth', '--code', 'tok', '--origin', ORIGIN, '--config', credentials(), '--json'], config)
      const parsed = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {error: {code: string; message: string}}
      expect(parsed.error.code).to.equal(NO_INSTANCE_CODE)
      expect(parsed.error.message).to.contain('https://app.dev.xano.com/trial')
    })

    it('still saves a profile for an account with an instance', async () => {
      instanceLists = [[anInstance]]
      process.exit = (() => {
        throw new Error('exit')
      }) as typeof process.exit
      const {error} = await runCommand(['auth', '--code', 'tok', '--origin', ORIGIN, '--config', credentials()], config)
      expect(error?.message).to.equal('exit')
      expect(fs.readFileSync(credentials(), 'utf8')).to.contain('instance_origin: https://x1.dev.xano.io')
    })

    describe('the browser callback check', () => {
      // A protected method: the callback server that calls it opens a real browser.
      let check: (origin: string) => Promise<null | string>

      beforeEach(() => {
        const auth = new Auth([], config) as unknown as {trialPageFor(t: string, o: string): Promise<null | string>}
        check = (origin) => auth.trialPageFor('tok', origin)
      })

      it('links the trial for a Xano account with no instance', async () => {
        expect(await check(ORIGIN)).to.equal('https://app.dev.xano.com/trial')
        expect(requested).to.deep.equal(['/api:meta/instance'])
      })

      it('shows the plain page for an account with an instance', async () => {
        instanceLists = [[anInstance]]
        expect(await check(ORIGIN)).to.equal(null)
      })

      it('shows the plain page when the listing is refused', async () => {
        globalThis.fetch = (async () => json({message: 'Unauthorized'}, 401)) as typeof globalThis.fetch
        expect(await check(ORIGIN)).to.equal(null)
      })

      it('never checks a self-hosted origin', async () => {
        expect(await check('https://xano.mycompany.com')).to.equal(null)
        expect(requested).to.deep.equal([])
      })
    })

    describe('interactively', () => {
      let auth: Auth
      const answers: boolean[] = []

      beforeEach(() => {
        auth = new Auth([], config)
        answers.length = 0
        inquirer.prompt = (async () => ({again: answers.shift()})) as unknown as typeof inquirer.prompt
      })

      // A protected method: driven directly, since the browser login in front of it opens a real browser.
      const wait = (token: string, nonInteractive: boolean) =>
        (auth as unknown as {waitForFirstInstance(t: string, o: string, n: boolean): Promise<unknown[]>}).waitForFirstInstance(
          token,
          ORIGIN,
          nonInteractive,
        )

      it('checks again until the trial instance is listed', async () => {
        instanceLists = [[], [anInstance]]
        answers.push(true, true)
        const instances = await wait('tok', false)
        expect(instances).to.have.length(1)
        expect(requested.filter((p) => p === '/api:meta/instance')).to.have.length(2)
      })

      it('stops with the trial page when the user does not check again', async () => {
        answers.push(false)
        let caught: undefined | {code?: string; message: string}
        try {
          await wait('tok', false)
        } catch (error) {
          caught = error as {code?: string; message: string}
        }

        expect(caught?.message).to.equal(noInstanceMessage(ORIGIN, 'xano auth'))
        expect(caught?.code).to.equal(NO_INSTANCE_CODE)
      })
    })
  })

  describe('profile wizard with an account that has no instance (DEV-10170)', () => {
    let config: Config
    let originalFetch: typeof globalThis.fetch
    let originalPrompt: typeof inquirer.prompt

    before(async () => {
      config = await Config.load({root: process.cwd()})
    })

    beforeEach(() => {
      originalFetch = globalThis.fetch
      originalPrompt = inquirer.prompt
      globalThis.fetch = (async () => json([])) as typeof globalThis.fetch
      inquirer.prompt = (async () => ({accessToken: 'tok'})) as unknown as typeof inquirer.prompt
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
      inquirer.prompt = originalPrompt
      process.exitCode = undefined
    })

    it('sends a Xano account to the trial page', async () => {
      const {error} = await runCommand(['profile', 'wizard', '--origin', ORIGIN], config)
      expect(error?.message).to.equal(noInstanceMessage(ORIGIN, 'xano profile wizard'))
    })

    it('keeps the token hint for a self-hosted origin', async () => {
      const {error} = await runCommand(['profile', 'wizard', '--origin', 'https://xano.mycompany.com'], config)
      expect(error?.message).to.equal('No instances found. Please check your access token.')
    })
  })
})
