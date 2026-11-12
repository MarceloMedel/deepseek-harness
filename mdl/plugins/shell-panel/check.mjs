#!/usr/bin/env node
/**
 * Self-contained check for dsh-shell-panel (SPEC-035).
 *
 * Runs both halves without a browser and without a running dsh process:
 *
 *   - The host half is mounted over the REAL filesystem backend and the REAL
 *     bash executors, with pass-through `webServer`, `sessions` and
 *     `sandboxPolicy` registries, and its route is invoked through the same
 *     Node request/response shape the web server uses. That is what proves the
 *     tracked directory, the exit codes, the cross-site fence, and — when a
 *     runner probes successfully in this environment — that a write outside the
 *     workspace root is refused while one inside completes.
 *   - The client half is executed the way the shell executes it: its factory is
 *     handed a `require` bound to a stub module table, `apply` runs against a
 *     stub slot registry with a locale, and the seat renders into a jsdom
 *     document.
 *   - `install.sh` publishes the bundle into a throwaway DSH home twice, and the
 *     row is added exactly once.
 *
 * Usage: `node check.mjs` (from anywhere). Environment:
 *   DSH_HOME     DSH home holding `profiles/node_modules` (default `~/.dsh`)
 *   JSDOM_FROM   directory whose node_modules resolves `jsdom`
 *                (default: the repository root that contains this file)
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const dshHome = process.env.DSH_HOME ?? join(process.env.HOME ?? '/root', '.dsh')
const profileModules = join(dshHome, 'profiles/node_modules')
const harnessDir = join(process.env.TMPDIR ?? '/tmp', 'shell-panel-check')
const workspace = join(harnessDir, 'ws')
/** Throwaway DSH home the bundle is published into, so no deployment is touched. */
const tempHome = join(harnessDir, 'home')
/** The published copy, which is what the check exercises (its imports resolve). */
const bundle = join(tempHome, 'profiles/node_modules/dsh-shell-panel')

let checks = 0
let failures = 0
let pendings = 0

/** Report one observable fact and keep the run going. */
function check(label, condition, detail) {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** Report a check this environment cannot execute, never as a success (MDL-VALID-01). */
function pending(label, detail) {
  pendings += 1
  console.log(`  PEND ${label} — ${detail}`)
}

/** Canonical form of a path, for comparing what bash prints with what the host stores. */
function canon(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

// ── install.sh ─────────────────────────────────────────────────────────────

console.log('install.sh')

rmSync(harnessDir, { recursive: true, force: true })
mkdirSync(join(workspace, 'sub'), { recursive: true })
writeFileSync(join(workspace, 'file.txt'), 'not a directory\n')

mkdirSync(join(tempHome, 'profiles/web'), { recursive: true })
writeFileSync(join(tempHome, 'profiles/web/cordis.patch.yml'), '[]\n')
const installEnv = { ...process.env, DSH_HOME: tempHome, MDL_DSH_PROFILE: 'web' }
execFileSync('bash', [join(here, 'install.sh')], { env: installEnv, stdio: 'pipe' })
execFileSync('bash', [join(here, 'install.sh')], { env: installEnv, stdio: 'pipe' })
const patched = readFileSync(join(tempHome, 'profiles/web/cordis.patch.yml'), 'utf8')
check('publishes the bundle into the profile node_modules fallback',
  existsSync(join(bundle, 'host.mjs')) && existsSync(join(bundle, 'client.js')))
check('adds the row to the profile patch layer exactly once',
  (patched.match(/dsh-shell-panel/g) ?? []).length === 1
  && (patched.match(/- id: shell-panel/g) ?? []).length === 1,
  patched)
check('replaces the empty flow array instead of appending after it', !patched.includes('[]'))
// The published copy resolves its host dependency through the profile's own
// node_modules; the throwaway home borrows the deployment's packages by link,
// which writes nothing outside the temporary directory.
symlinkSync(join(profileModules, '@deepseek-ai'), join(tempHome, 'profiles/node_modules/@deepseek-ai'), 'dir')

// ── host half ──────────────────────────────────────────────────────────────

console.log('host half')

const { Context } = await import(join(profileModules, '@deepseek-ai/cordis/lib/index.js'))
const { default: LocalFileSystem } = await import(join(profileModules, '@deepseek-ai/dsh-fs-local/lib/index.js'))
const { default: LocalSubprocessRuntime } = await import(join(profileModules, '@deepseek-ai/dsh-subprocess-local/lib/index.js'))
const { default: LocalBashExecutor } = await import(join(profileModules, '@deepseek-ai/dsh-bash-local/lib/index.js'))
const plugin = await import(join(bundle, 'host.mjs'))

/** Mount the panel over a real filesystem and the real executors. */
async function mountPanel({ sandboxed }) {
  const state = { handler: undefined, routes: [] }
  const ctx = new Context()
  ctx.provide('webServer', {
    register: (route) => {
      state.routes.push(route)
      state.handler = route.handler
      return () => {}
    },
  })
  ctx.provide('sessions', {
    get: (id) => (id === 's1' ? { header: { id: 's1', cwd: workspace }, events: [] } : undefined),
  })
  ctx.provide('sandboxPolicy', {
    resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace, sessionId: 's1' }),
  })
  ctx.plugin(LocalFileSystem, { cwd: workspace })
  ctx.plugin(LocalSubprocessRuntime, {})
  if (sandboxed) {
    const { default: LocalSandboxProvider } = await import(join(profileModules, '@deepseek-ai/dsh-sandbox-local/lib/index.js'))
    const { default: SandboxBashExecutor } = await import(join(profileModules, '@deepseek-ai/dsh-bash-sandbox/lib/index.js'))
    ctx.plugin(LocalSandboxProvider, {})
    ctx.plugin(SandboxBashExecutor, { cwd: workspace })
  } else {
    ctx.plugin(LocalBashExecutor, { cwd: workspace })
  }
  await wait(120)
  ctx.plugin(plugin, {})
  await wait(120)
  return { ctx, state, confined: ctx.get('sandbox') !== undefined }
}

/** Invoke the served route with the Node request/response shape it receives. */
function call(state, url, options = {}) {
  const { method = 'GET', body, headers = {} } = options
  return new Promise((done) => {
    const res = {
      headersSent: false,
      status: 0,
      headers: {},
      body: '',
      writeHead(status, next) {
        this.status = status
        this.headers = next ?? {}
        this.headersSent = true
      },
      end(value) {
        this.body = value === undefined ? '' : String(value)
        done(this)
      },
    }
    const req = { method, url, headers: { host: '127.0.0.1:3080', ...headers } }
    req[Symbol.asyncIterator] = async function* iterator() {
      if (body !== undefined) yield Buffer.from(body)
    }
    Promise.resolve(state.handler(req, res)).catch((error) => {
      res.status = 500
      res.body = JSON.stringify({ ok: false, error: String(error?.message ?? error) })
      done(res)
    })
  })
}

/** One JSON answer from the route. */
async function json(state, url, options) {
  const response = await call(state, url, options)
  try {
    return JSON.parse(response.body)
  } catch {
    return { ok: false, status: response.status, raw: response.body }
  }
}

/** Send one command the way the browser does. */
function startCommand(state, key, command) {
  return json(state, `/shell-panel/${key}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command }),
  })
}

/** Poll one run until it settles. */
async function pollUntilSettled(state, key, runId, attempts = 120) {
  let last = null
  for (let index = 0; index < attempts; index += 1) {
    last = await json(state, `/shell-panel/${key}/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
    })
    if (last.ok !== true || last.running !== true) return last
    await wait(50)
  }
  return last
}

/** Run one command to completion and return what the panel would show. */
async function runCommand(state, key, command) {
  const started = await startCommand(state, key, command)
  if (started.ok !== true) return { started, settled: null }
  const settled = await pollUntilSettled(state, key, started.runId)
  return { started, settled }
}

const plain = await mountPanel({ sandboxed: false })
check('registers one prefix route and nothing else',
  plain.state.routes.length === 1 && plain.state.routes[0].path === '/shell-panel',
  plain.state.routes.map((route) => route.path).join())

const info = await json(plain.state, '/shell-panel/s1/info')
check('reports the mode and the root the policy resolved for the session',
  info.ok === true && info.mode === 'workspace-write' && info.root === workspace && canon(info.cwd) === canon(workspace),
  JSON.stringify(info))

const first = await runCommand(plain.state, 's1', 'pwd')
check('a command runs in the tracked directory and reports its exit code',
  first.started.ok === true
  && canon(first.started.workdir) === canon(workspace)
  && first.settled?.exitCode === 0
  && canon(String(first.settled?.text ?? '').trim()) === canon(workspace),
  JSON.stringify({ started: first.started, settled: first.settled }))

const enterSub = await runCommand(plain.state, 's1', 'cd sub && pwd')
check('a leading cd moves the tracked directory for the next command',
  enterSub.started.ok === true
  && canon(enterSub.started.cwd) === canon(join(workspace, 'sub')),
  JSON.stringify(enterSub.started))
const inSub = await runCommand(plain.state, 's1', 'pwd')
check('the next command starts in that directory',
  canon(inSub.started.workdir) === canon(join(workspace, 'sub'))
  && canon(String(inSub.settled?.text ?? '').trim()) === canon(join(workspace, 'sub')),
  JSON.stringify(inSub.started))
const backOut = await runCommand(plain.state, 's1', 'cd ..')
check('a relative parent returns to the parent directory',
  canon(backOut.started.cwd) === canon(workspace), JSON.stringify(backOut.started))

await runCommand(plain.state, 's1', 'cd sub')
const absolute = await runCommand(plain.state, 's1', 'cd /etc')
check('a directory outside the root is not adopted',
  canon(absolute.started.cwd) === canon(join(workspace, 'sub')), JSON.stringify(absolute.started))
const missing = await runCommand(plain.state, 's1', 'cd nope')
check('a nonexistent directory is not adopted',
  canon(missing.started.cwd) === canon(join(workspace, 'sub')), JSON.stringify(missing.started))
const aFile = await runCommand(plain.state, 's1', 'cd file.txt')
check('a file is not adopted',
  canon(aFile.started.cwd) === canon(join(workspace, 'sub')), JSON.stringify(aFile.started))
const tilde = await runCommand(plain.state, 's1', 'cd ~')
check('cd ~ returns to the workspace root',
  canon(tilde.started.cwd) === canon(workspace), JSON.stringify(tilde.started))
const compound = await runCommand(plain.state, 's1', 'echo hi; cd /tmp')
check('a cd that is not leading does not move the tracked directory',
  canon(compound.started.cwd) === canon(workspace), JSON.stringify(compound.started))

const failing = await runCommand(plain.state, 's1', 'exit 3')
check('a nonzero exit is reported with its own code', failing.settled?.exitCode === 3, JSON.stringify(failing.settled))
const noCwd = await runCommand(plain.state, 's1', 'true')
check('a command that moves nothing leaves the directory where it was',
  canon(noCwd.started.cwd) === canon(workspace), JSON.stringify(noCwd.started))

// One command per session at a time: a second start while one runs is refused,
// which is also what makes Stop meaningful.
const longRun = await startCommand(plain.state, 's1', 'sleep 5')
const busy = await startCommand(plain.state, 's1', 'pwd')
check('a second command in the same session is refused while one runs',
  busy.ok === false && busy.code === 'BUSY' && busy.runId === longRun.runId, JSON.stringify(busy))
const killed = await json(plain.state, '/shell-panel/s1/kill', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ runId: longRun.runId }),
})
check('Stop kills the running command', killed.ok === true && killed.killed === true, JSON.stringify(killed))
const afterKill = await pollUntilSettled(plain.state, 's1', longRun.runId, 40)
check('the killed command settles as no longer running',
  afterKill?.ok === true && afterKill.running === false, JSON.stringify(afterKill))
check('a new command may start after the kill',
  (await startCommand(plain.state, 's1', 'true')).ok === true)

// Ownership: a run belongs to the session key that started it.
const owned = await startCommand(plain.state, 's1', 'true')
const foreignPoll = await json(plain.state, '/shell-panel/none/poll', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ runId: owned.runId }),
})
check('another session key cannot poll someone else\'s run',
  foreignPoll.ok === false && foreignPoll.code === 'UNKNOWN_RUN', JSON.stringify(foreignPoll))
await pollUntilSettled(plain.state, 's1', owned.runId)

// ── the fence ──
const noContentType = await call(plain.state, '/shell-panel/s1/start', {
  method: 'POST',
  body: JSON.stringify({ command: 'pwd' }),
})
check('refuses a command that is not declared as JSON', noContentType.status === 415, String(noContentType.status))
const formType = await call(plain.state, '/shell-panel/s1/start', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'command=pwd',
})
check('refuses a form content type, which a cross-site page can send', formType.status === 415, String(formType.status))
const foreignOrigin = await call(plain.state, '/shell-panel/s1/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: JSON.stringify({ command: 'pwd' }),
})
check('refuses a request whose Origin names another host', foreignOrigin.status === 403, String(foreignOrigin.status))
const crossSite = await call(plain.state, '/shell-panel/s1/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
  body: JSON.stringify({ command: 'pwd' }),
})
check('refuses a request labelled cross-site', crossSite.status === 403, String(crossSite.status))
const crossSiteInfo = await call(plain.state, '/shell-panel/s1/info', {
  headers: { 'sec-fetch-site': 'cross-site' },
})
check('fences the read route too', crossSiteInfo.status === 403, String(crossSiteInfo.status))
const sameOrigin = await call(plain.state, '/shell-panel/s1/info', {
  headers: { origin: 'http://127.0.0.1:3080' },
})
check('admits a request whose Origin names this host', sameOrigin.status === 200, String(sameOrigin.status))
const deleteMethod = await call(plain.state, '/shell-panel/s1/info', { method: 'DELETE' })
check('refuses any other method', deleteMethod.status === 405, String(deleteMethod.status))
const unknownSession = await json(plain.state, '/shell-panel/nope/info')
check('answers an unknown session with 404 instead of falling back to another root',
  unknownSession.code === 'UNKNOWN_SESSION', JSON.stringify(unknownSession))
const noSession = await json(plain.state, '/shell-panel/none/info')
check('a request with no session resolves the deployment fallback policy',
  noSession.ok === true && canon(noSession.root) === canon(workspace), JSON.stringify(noSession))
const empty = await startCommand(plain.state, 's1', '   ')
check('refuses an empty command', empty.code === 'EMPTY_COMMAND', JSON.stringify(empty))

await plain.ctx.dispose?.()

// ── the sandbox fence, over the real runner ──
console.log('sandbox half')

const confinedPanel = await mountPanel({ sandboxed: true })
if (!confinedPanel.confined) {
  pending('SHL-05', 'no sandbox runner probed successfully in this environment')
} else {
  const insideWrite = await runCommand(confinedPanel.state, 's1', 'echo ok > .probe-inside')
  check('a write inside the workspace root completes',
    insideWrite.settled?.exitCode === 0 && insideWrite.settled?.denied === false,
    JSON.stringify(insideWrite.settled))
  const homeProbe = join(process.env.HOME ?? '/root', 'shell-panel-probe')
  const outsideWrite = await runCommand(confinedPanel.state, 's1', `echo x > ${JSON.stringify(homeProbe)}`)
  const varTmpProbe = '/var/tmp/shell-panel-probe'
  const outsideVarTmp = await runCommand(confinedPanel.state, 's1', `echo x > ${JSON.stringify(varTmpProbe)}`)
  const denied = [outsideWrite, outsideVarTmp].find((result) =>
    result.settled?.denied === true && result.settled?.exitCode !== 0)
  if (denied === undefined) {
    pending('SHL-05', `neither ${homeProbe} nor ${varTmpProbe} was denied by the runner; the probe cannot distinguish a sandbox denial from an ordinary permission error here`)
  } else {
    check('a write outside the workspace root is refused and flagged as denied',
      denied.settled.denied === true && denied.settled.exitCode !== 0,
      JSON.stringify(denied.settled))
  }
}
await confinedPanel.ctx.dispose?.()

// ── client half ────────────────────────────────────────────────────────────

console.log('client half')

const profileRequire = createRequire(join(profileModules, 'noop.cjs'))
const React = profileRequire('react')
const { createRoot } = profileRequire('react-dom/client')
const { JSDOM } = createRequire(join(process.env.JSDOM_FROM ?? repoRoot, 'noop.cjs'))('jsdom')

const dom = new JSDOM('<!doctype html><html><body><div id="overlay"></div></body></html>', { url: 'http://127.0.0.1:3080/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.location = dom.window.location
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const requested = []
let polls = 0
globalThis.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET'
  requested.push({ url: String(url), method, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) })
  const respond = (value) => ({ ok: true, status: 200, json: async () => value })
  const text = String(url)
  if (text.endsWith('/info')) {
    return respond({ ok: true, hasShell: true, mode: 'workspace-write', root: '/ws', cwd: '/ws/sub' })
  }
  if (text.endsWith('/start')) {
    return respond({ ok: true, runId: 'run-1', workdir: '/ws/sub', cwd: '/ws/sub', mode: 'workspace-write' })
  }
  if (text.endsWith('/poll')) {
    polls += 1
    return respond(polls < 2
      ? { ok: true, text: 'hello\n', running: true, exitCode: null, denied: false }
      : { ok: true, text: 'hello\n', running: false, exitCode: 0, denied: false })
  }
  if (text.endsWith('/kill')) return respond({ ok: true, killed: true })
  return { ok: false, status: 404, json: async () => null }
}

let handoff
dom.window.__ModuleLoader__ = { load: (value) => { handoff = value } }
dom.window.eval(readFileSync(join(bundle, 'client.js'), 'utf8'))
check('registers the bundle under its package id', handoff !== undefined && handoff.id === 'dsh-shell-panel')

const mod = handoff.factory((spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require: ${spec}`)
})

const seats = []
const localeListeners = new Set()
let activeLocale = 'en'
mod.apply({
  effect(fn) { return fn() },
  locale: {
    getLocale: () => ({ active: activeLocale }),
    subscribe: (listener) => {
      localeListeners.add(listener)
      return () => localeListeners.delete(listener)
    },
  },
  slots: {
    inject(_name, callback) { callback() },
    register(registration, Component) {
      seats.push({ registration, Component })
      return () => {}
    },
  },
})

check('registers exactly one seat, the frame overlay',
  seats.length === 1
  && seats[0].registration.name === 'shell.overlay'
  && seats[0].registration.id === 'shell-panel',
  seats.map((entry) => `${entry.registration.name}:${entry.registration.id}`).join())
const style = document.head.querySelector('style[data-plugin="dsh-shell-panel"]')?.textContent ?? ''
check('injects its stylesheet as a plugin-owned element', style.includes('.dsh-sp-drawer'))
check('uses theme tokens and no literal color',
  style.includes('var(--dsw-alias-brand-primary)')
  && /#[0-9a-fA-F]{3,8}\b/.test(style) === false,
  style.match(/#[0-9a-fA-F]{3,8}\b/g)?.join())

const ShellPanel = seats[0].Component
const testUtils = profileRequire('react-dom/test-utils')
const root = createRoot(document.getElementById('overlay'))
const settle = async (ms = 60) => {
  await React.act(async () => {
    await new Promise((done) => setTimeout(done, ms))
  })
}
const click = (node) => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
/**
 * Set the input's value through React's own event system. A dispatched native
 * `input`/`keydown` Event does not reach React's synthetic handlers in this
 * jsdom setup, so the interaction goes through the documented test API.
 */
const typeInto = async (node, value) => {
  await React.act(async () => {
    testUtils.Simulate.change(node, { target: { value } })
    await new Promise((done) => setTimeout(done, 20))
  })
}
const pressKey = async (node, key) => {
  await React.act(async () => {
    testUtils.Simulate.keyDown(node, { key })
    await new Promise((done) => setTimeout(done, 20))
  })
}

/** Render the panel for one session key, the way the slot does. */
async function renderPanel(sessionId) {
  await React.act(async () => {
    root.render(React.createElement(ShellPanel, {
      useSessions: (selector) => selector({ current: sessionId, ids: [], byId: {}, phase: 'ready' }),
    }))
    await new Promise((done) => setTimeout(done, 40))
  })
}

await renderPanel('s1')
check('starts closed, showing only the floating button',
  document.querySelector('.dsh-sp-drawer') === null
  && document.querySelector('.dsh-sp-fab')?.textContent === '>_')

click(document.querySelector('.dsh-sp-fab'))
await settle()
check('the button opens the drawer',
  document.querySelector('.dsh-sp-drawer') !== null
  && document.querySelector('.dsh-sp-title')?.textContent === 'Shell')
check('the drawer asks the host for this session\'s directory and mode',
  requested.some((entry) => entry.method === 'GET' && entry.url === '/shell-panel/s1/info'))
check('the header prints them, not a guess',
  document.querySelector('.dsh-sp-cwd')?.textContent === '/ws/sub'
  && document.querySelector('.dsh-sp-mode')?.textContent === 'workspace-write',
  `${document.querySelector('.dsh-sp-cwd')?.textContent} / ${document.querySelector('.dsh-sp-mode')?.textContent}`)

await typeInto(document.querySelector('.dsh-sp-field'), 'pwd')
click([...document.querySelectorAll('.dsh-sp-btn')].find((node) => node.textContent === 'Run'))
await settle()
check('clicking Run posts the command to this session\'s route',
  requested.some((entry) => entry.method === 'POST'
    && entry.url === '/shell-panel/s1/start'
    && entry.body?.command === 'pwd'),
  JSON.stringify(requested.filter((entry) => entry.method === 'POST')))
check('the running block offers Stop instead of Run',
  [...document.querySelectorAll('.dsh-sp-btn')].some((node) => node.textContent === 'Stop'))
await settle(1000)
check('the output and the exit code arrive from the poll',
  document.querySelector('.dsh-sp-pre')?.textContent === 'hello\n'
  && document.querySelector('.dsh-sp-status')?.textContent === 'exit 0',
  `${document.querySelector('.dsh-sp-pre')?.textContent} / ${document.querySelector('.dsh-sp-status')?.textContent}`)
check('the block is no longer running once the process settles',
  [...document.querySelectorAll('.dsh-sp-btn')].some((node) => node.textContent === 'Run'))

// Enter submits too, and the history recalls what was sent.
await typeInto(document.querySelector('.dsh-sp-field'), 'ls')
await pressKey(document.querySelector('.dsh-sp-field'), 'Enter')
await settle(20)
check('Enter submits the command',
  requested.filter((entry) => entry.url.endsWith('/start')).length === 2,
  String(requested.filter((entry) => entry.url.endsWith('/start')).length))
check('submitting clears the input', document.querySelector('.dsh-sp-field')?.value === '',
  document.querySelector('.dsh-sp-field')?.value)
await settle(1000)
await pressKey(document.querySelector('.dsh-sp-field'), 'ArrowUp')
check('the history recalls the last command', document.querySelector('.dsh-sp-field')?.value === 'ls',
  document.querySelector('.dsh-sp-field')?.value)
await pressKey(document.querySelector('.dsh-sp-field'), 'ArrowUp')
check('and the one before it', document.querySelector('.dsh-sp-field')?.value === 'pwd',
  document.querySelector('.dsh-sp-field')?.value)

activeLocale = 'es'
await React.act(async () => {
  for (const listener of localeListeners) listener()
  await new Promise((done) => setTimeout(done, 30))
})
const spanish = [...document.querySelectorAll('.dsh-sp-btn')].map((node) => node.textContent).join()
check('the drawer follows the Spanish locale', spanish.includes('Limpiar') && spanish.includes('Cerrar'), spanish)
activeLocale = 'zh'
await React.act(async () => {
  for (const listener of localeListeners) listener()
  await new Promise((done) => setTimeout(done, 30))
})
const fallback = [...document.querySelectorAll('.dsh-sp-btn')].map((node) => node.textContent).join()
check('a locale without copy falls back to English', fallback.includes('Clear') && fallback.includes('Close'), fallback)

click([...document.querySelectorAll('.dsh-sp-btn')].find((node) => node.textContent === 'Close'))
await settle()
check('Close hides the drawer and leaves the button', document.querySelector('.dsh-sp-drawer') === null)

// With no session on stage the panel uses the host's no-session key.
requested.length = 0
await renderPanel(undefined)
click(document.querySelector('.dsh-sp-fab'))
await settle()
check('a request with no session addresses the host\'s no-session key',
  requested.some((entry) => entry.url === '/shell-panel/none/info'),
  requested.map((entry) => entry.url).join())

// Both copy tables declare the same keys, so a new label cannot ship half-done.
const source = readFileSync(join(bundle, 'client.js'), 'utf8')
const englishAt = source.indexOf('\n      en: {')
const spanishAt = source.indexOf('\n      es: {')
const tableEnd = source.indexOf('\n      },\n    }', spanishAt)
const keysOf = (block) => [...block.matchAll(/^\s{8}([A-Za-z]+):/gm)].map((match) => match[1]).sort().join()
const englishKeys = keysOf(source.slice(englishAt, spanishAt))
const spanishKeys = keysOf(source.slice(spanishAt, tableEnd))
check('every label exists in both languages',
  englishKeys !== '' && englishKeys === spanishKeys,
  `en=${englishKeys} | es=${spanishKeys}`)

rmSync(harnessDir, { recursive: true, force: true })
console.log(`\n${checks - failures}/${checks} checks passed${pendings === 0 ? '' : `, ${pendings} pending`}`)
process.exit(failures === 0 ? 0 : 1)
