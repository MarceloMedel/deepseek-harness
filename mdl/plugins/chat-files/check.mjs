#!/usr/bin/env node
/**
 * Self-contained check for dsh-chat-files (SPEC-025).
 *
 * Runs both halves without a browser and without a running dsh process:
 *
 *   - `install.sh` publishes the bundle into a throwaway DSH home whose
 *     `profiles/node_modules` links the real one, so the check exercises the
 *     same layout the profile loads (bare imports resolved from the fallback,
 *     the bundle's own dependency tree linked beside it) and leaves the live
 *     deployment untouched.
 *   - The host half is mounted over the REAL `@deepseek-ai/dsh-fs-local`
 *     backend with pass-through `webServer`, `tools` and `sessions` registries,
 *     and its route is invoked with real request bodies. That is what proves
 *     the fencing and the staging rules: traversal names, symlinked uploads
 *     directories, byte caps, extension admission, and the git exclude.
 *   - The client half runs the way the shell runs it: the factory is handed a
 *     `require` bound to a stub module table, `apply` runs against a stub slot
 *     registry, and both seats render into a jsdom document. Uploads go to a
 *     stubbed `fetch`, so the draft reference and the image rail hand-off are
 *     observable without a host.
 *
 * Usage: `node check.mjs` from anywhere. Environment:
 *   CHAT_FILES_MODULES  directory whose `@deepseek-ai/*` packages the throwaway
 *                       home links (default `$DSH_HOME/profiles/node_modules`)
 *   DSH_HOME            the live DSH home, used only to locate the default above
 *   JSDOM_FROM          directory whose node_modules resolves `jsdom`
 *                       (default: the repository root that contains this file)
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const liveHome = process.env.DSH_HOME ?? join(process.env.HOME ?? '/root', '.dsh')
const moduleSource = process.env.CHAT_FILES_MODULES ?? join(liveHome, 'profiles/node_modules')
const harnessDir = join(process.env.TMPDIR ?? '/tmp', 'chat-files-check')
const checkHome = join(harnessDir, 'home')
const profileModules = join(checkHome, 'profiles/node_modules')
const bundle = join(profileModules, 'dsh-chat-files')
const workspace = join(harnessDir, 'ws')

let checks = 0
let failures = 0

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

// ── publish ─────────────────────────────────────────────────────────────────

console.log('publish')

rmSync(harnessDir, { recursive: true, force: true })
mkdirSync(workspace, { recursive: true })
mkdirSync(join(checkHome, 'profiles', 'web'), { recursive: true })
mkdirSync(profileModules, { recursive: true })
for (const entry of readdirSync(moduleSource)) {
  if (entry === 'dsh-chat-files') continue
  symlinkSync(join(moduleSource, entry), join(profileModules, entry), 'dir')
}
writeFileSync(join(checkHome, 'profiles', 'web', 'cordis.yml'), '# profile root\n')
execFileSync('bash', [join(here, 'install.sh')], { env: { ...process.env, DSH_HOME: checkHome, MDL_DSH_PROFILE: 'web' }, stdio: 'pipe' })

const patch = readFileSync(join(checkHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
check('install.sh publishes every bundle file', ['package.json', 'host.mjs', 'xlsx.mjs', 'client.js', 'cordis.patch.yml', 'README.md']
  .every(name => readdirSync(bundle).includes(name)), readdirSync(bundle).join())
check('install.sh links the dependency tree', readdirSync(bundle).includes('node_modules'))
check('install.sh composes the row into the profile', patch.includes('id: chat-files') && patch.includes('name: dsh-chat-files'))
execFileSync('bash', [join(here, 'install.sh')], { env: { ...process.env, DSH_HOME: checkHome, MDL_DSH_PROFILE: 'web' }, stdio: 'pipe' })
check('install.sh is idempotent',
  readFileSync(join(checkHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8') === patch)

// ── host half ───────────────────────────────────────────────────────────────

console.log('host half')

// A git repository stands in for a project checkout: the exclude file is what
// keeps staged attachments out of `git status`.
mkdirSync(join(workspace, '.git', 'info'), { recursive: true })
writeFileSync(join(workspace, '.git', 'info', 'exclude'), '# created by git\n')
// The escape target a symlinked uploads directory would expose.
const outside = join(harnessDir, 'outside')
mkdirSync(outside, { recursive: true })
copyFileSync(join(here, 'fixtures/report.pdf'), join(workspace, 'fixtures-report.pdf'))
copyFileSync(join(here, 'fixtures/report.docx'), join(workspace, 'fixtures-report.docx'))
copyFileSync(join(here, 'fixtures/report.xlsx'), join(workspace, 'fixtures-report.xlsx'))

const { Context } = await import(join(profileModules, '@deepseek-ai/cordis/lib/index.js'))
const { default: LocalFileSystem } = await import(join(profileModules, '@deepseek-ai/dsh-fs-local/lib/index.js'))
const plugin = await import(join(bundle, 'host.mjs'))

let handler
const routes = []
const tools = []
const ctx = new Context()
ctx.provide('webServer', {
  register: (route) => {
    routes.push(route)
    handler = route.handler
    return () => {}
  },
})
ctx.provide('tools', {
  register: (tool) => {
    tools.push(tool)
    return () => {}
  },
})
ctx.provide('sessions', {
  get: (id) => (id !== 's1' ? undefined : { header: { id: 's1', cwd: workspace }, events: [] }),
})
ctx.provide('logger', { warn: () => {}, info: () => {} })
ctx.plugin(LocalFileSystem, { cwd: workspace })
await new Promise(settle => setTimeout(settle, 50))
// Caps small enough to exercise each branch with a tiny body, large enough for
// the three document fixtures.
const config = plugin.Config({
  maxFileBytes: 65536,
  maxTextBytes: 512,
  maxExtractedChars: 400,
  maxSheetRows: 3,
  maxSheets: 1,
})
ctx.plugin(plugin, config)
await new Promise(settle => setTimeout(settle, 50))

check('registers one prefix route and the tool',
  routes.length === 1 && routes[0].path === '/chat-files' && routes[0].kind === 'prefix'
  && tools.map(tool => tool.name).join() === 'read_document',
  routes.map(route => route.path).join())

/** Build the request shape the http server hands the route. */
function request(options) {
  const body = options.body ?? Buffer.alloc(0)
  const listeners = new Map()
  const req = {
    method: options.method ?? 'POST',
    url: options.url,
    headers: options.headers ?? {},
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return req
    },
    destroy() {},
  }
  // Deliver the body on the next tick, the way a socket would.
  setTimeout(() => {
    if (body.length > 0) for (const listener of listeners.get('data') ?? []) listener(body)
    for (const listener of listeners.get('end') ?? []) listener()
  }, 0)
  return req
}

/** Invoke the route and collect the response. */
function call(options) {
  return new Promise((done) => {
    const res = {
      headersSent: false,
      status: 0,
      body: '',
      writeHead(status) {
        this.status = status
        this.headersSent = true
      },
      end(body) {
        this.body = body === undefined ? '' : String(body)
        done(this)
      },
    }
    handler(request(options), res)
  })
}

/** One upload call with a sane default envelope. */
function upload(name, body, extra) {
  return call({
    url: `/chat-files/s1/upload?name=${encodeURIComponent(name)}`,
    headers: { 'content-type': 'application/octet-stream', host: '127.0.0.1:3080', ...extra?.headers },
    body: Buffer.isBuffer(body) ? body : Buffer.from(body),
  })
}

/** The parsed JSON body of one call. */
async function json(options) {
  return JSON.parse((await call(options)).body)
}

const staged = []
const first = await upload('notes.md', '# Notes\n\nContext the user attached.\n')
staged.push(JSON.parse(first.body))
check('stages a Markdown file and answers with its workspace path',
  first.status === 200 && staged[0].ok === true && staged[0].path === '.dsh-uploads/notes.md',
  first.body)
check('writes the file inside the workspace',
  readFileSync(join(workspace, '.dsh-uploads/notes.md'), 'utf8').includes('Context the user attached'))
check('keeps the uploads directory out of git status',
  readFileSync(join(workspace, '.git', 'info', 'exclude'), 'utf8').split('\n').includes('.dsh-uploads/'))

const second = JSON.parse((await upload('notes.md', 'second body')).body)
check('never overwrites a staged file', second.path === '.dsh-uploads/notes-1.md', second.path)
check('the second file holds the second body',
  readFileSync(join(workspace, '.dsh-uploads/notes-1.md'), 'utf8') === 'second body')

const traversal = JSON.parse((await upload('../../../etc/passwd.md', 'x')).body)
check('drops the directory part of a traversal name',
  traversal.ok === true && traversal.path === '.dsh-uploads/passwd.md', traversal.path)
check('nothing was written outside the uploads directory', !readdirSync(harnessDir).includes('etc'))

const nully = JSON.parse((await upload('bad\u0000name.md', 'x')).body)
check('refuses a name carrying NUL', nully.ok === false && nully.code === 'BAD_REQUEST', JSON.stringify(nully))

const rejected = JSON.parse((await upload('payload.exe', 'MZ')).body)
check('refuses an extension it cannot read',
  rejected.ok === false && rejected.code === 'UNSUPPORTED_TYPE' && rejected.ext === 'exe', JSON.stringify(rejected))

const tooLarge = JSON.parse((await upload('big.md', 'x'.repeat(70000))).body)
check('refuses a file above the byte cap',
  tooLarge.ok === false && tooLarge.code === 'TOO_LARGE' && tooLarge.maxMB === '0', JSON.stringify(tooLarge))
check('the refused oversize file was not written', !readdirSync(join(workspace, '.dsh-uploads')).includes('big.md'))

const empty = JSON.parse((await upload('empty.md', '')).body)
check('refuses an empty file', empty.ok === false && empty.code === 'EMPTY_FILE', JSON.stringify(empty))

const unknown = JSON.parse((await call({
  url: '/chat-files/nope/upload?name=a.md',
  headers: { 'content-type': 'application/octet-stream' },
  body: Buffer.from('x'),
})).body)
check('refuses an unknown session', unknown.ok === false && unknown.code === 'UNKNOWN_SESSION', JSON.stringify(unknown))

const wrongType = JSON.parse((await upload('a.md', 'x', { headers: { 'content-type': 'text/plain' } })).body)
check('refuses a body that is not octet-stream', wrongType.ok === false && wrongType.code === 'BAD_REQUEST')
const wrongOrigin = JSON.parse((await upload('a.md', 'x', { headers: { origin: 'https://evil.example' } })).body)
check('refuses a cross-origin upload', wrongOrigin.ok === false && wrongOrigin.code === 'BAD_REQUEST')
const sameOrigin = JSON.parse((await upload('origin.md', 'x', { headers: { origin: 'http://127.0.0.1:3080' } })).body)
check('accepts a same-origin upload', sameOrigin.ok === true)

const read = await call({ method: 'GET', url: '/chat-files/s1/upload?name=a.md' })
check('refuses a read method', read.status === 405)

// A symlinked uploads directory would redirect every write outside the tree.
rmSync(join(workspace, '.dsh-uploads'), { recursive: true, force: true })
symlinkSync(outside, join(workspace, '.dsh-uploads'), 'dir')
const viaSymlink = JSON.parse((await upload('escape.md', 'secret')).body)
check('refuses a symlinked uploads directory',
  viaSymlink.ok === false && viaSymlink.code === 'STAGING_FAILED', JSON.stringify(viaSymlink))
check('nothing landed through the symlink', readdirSync(outside).length === 0)
rmSync(join(workspace, '.dsh-uploads'), { force: true })
// Restore the staged file the symlink test removed the directory under.
await upload('notes.md', '# Notes\n\nContext the user attached.\n')

/** Run one tool call against the session workspace. */
async function readDocument(path) {
  return tools[0].execute({ path }, { agent: { session: { header: { id: 's1', cwd: workspace } } }, signal: undefined })
}

const textRead = await readDocument('.dsh-uploads/notes.md')
check('reads a staged Markdown file', textRead.kind === 'text' && textRead.text.includes('Context the user attached'), textRead.kind)
check('reports the character count', textRead.chars === textRead.text.length && textRead.truncated === false)
check('renders a model-facing header',
  tools[0].output.render({ path: '.dsh-uploads/notes.md' }, textRead)[0].text.startsWith('.dsh-uploads/notes.md (text, '))

writeFileSync(join(workspace, 'long.md'), 'a'.repeat(450))
const longRead = await readDocument('long.md')
check('truncates at the extraction cap and says so',
  longRead.truncated === true && longRead.text.includes('truncated'), String(longRead.truncated))
writeFileSync(join(workspace, 'huge.md'), 'b'.repeat(900))
let hugeError
try {
  await readDocument('huge.md')
} catch (error) {
  hugeError = String(error.message)
}
check('refuses a text file above the inline cap and names the way out',
  hugeError !== undefined && hugeError.includes('read tool'), hugeError)

const pdf = await readDocument('fixtures-report.pdf')
check('extracts a PDF text layer', pdf.kind === 'pdf' && pdf.text.includes('Hello PDF 42'), pdf.text.slice(0, 60))
const docx = await readDocument('fixtures-report.docx')
check('extracts DOCX paragraphs',
  docx.kind === 'docx' && docx.text.includes('Quarterly report') && docx.text.includes('42 percent'), docx.text.slice(0, 60))
const xlsx = await readDocument('fixtures-report.xlsx')
check('extracts a spreadsheet as CSV per sheet',
  xlsx.kind === 'xlsx' && xlsx.text.includes('## Sheet: Q3') && xlsx.text.includes('North,1200'), xlsx.text.slice(0, 80))
check('quotes a cell carrying a comma', xlsx.text.includes('"Comma, ""quoted"""'))
check('announces the sheet and row caps',
  xlsx.text.includes('only the first 1 of 2 sheets') && xlsx.text.includes('up to 3 rows'), xlsx.text)

const outsideRead = await readDocument('../outside/x.md').then(() => undefined, error => String(error.message))
check('refuses a path outside the workspace', outsideRead?.includes('outside the session workspace') === true, outsideRead)
const missingRead = await readDocument('nope.md').then(() => undefined, error => String(error.message))
check('names a missing file', missingRead?.includes('does not exist') === true, missingRead)
const extRead = await readDocument('payload.bin').then(() => undefined, error => String(error.message))
check('refuses an extension with no reader', extRead?.includes('no reader') === true, extRead)

// ── client half ─────────────────────────────────────────────────────────────

console.log('client half')

const profileRequire = createRequire(join(profileModules, 'noop.cjs'))
const React = profileRequire('react')
const { createRoot } = profileRequire('react-dom/client')
const { JSDOM } = createRequire(join(process.env.JSDOM_FROM ?? repoRoot, 'noop.cjs'))('jsdom')

const dom = new JSDOM('<!doctype html><html><body><div id="composer"></div><div id="overlay"></div></body></html>', { url: 'http://127.0.0.1:3080/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.location = dom.window.location
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let handoff
globalThis.window.__ModuleLoader__ = { load: (value) => { handoff = value } }
dom.window.eval(readFileSync(join(bundle, 'client.js'), 'utf8'))
check('registers the bundle under its package id', handoff !== undefined && handoff.id === 'dsh-chat-files')

const ClipIcon = () => React.createElement('svg', { className: 'stub-clip' })
const mod = handoff.factory((spec) => {
  if (spec === 'react') return React
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return { IconPaperclipOutline16: ClipIcon }
  throw new Error(`unexpected require: ${spec}`)
})

const seats = []
let activeLocale = 'en'
const localeListeners = new Set()
const conversation = {
  created: [],
  releaseDraftImage() {},
  createDraftImages(files) {
    const drafts = files.map((file, index) => ({ id: `draft-${String(index)}`, file }))
    this.created.push(...drafts)
    return drafts
  },
}
mod.apply({
  effect(fn) { return fn() },
  get(name) { return name === 'conversation' ? conversation : undefined },
  locale: {
    getLocale: () => ({ active: activeLocale }),
    subscribe(listener) {
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
const seat = name => seats.find(entry => entry.registration.name === name)?.Component
check('registers the composer seat and the overlay',
  seat('conversation.input.left') !== undefined && seat('shell.overlay') !== undefined
  && seats.length === 2, seats.map(entry => entry.registration.name).join())
check('injects the stylesheet', document.querySelector('style[data-plugin="dsh-chat-files"]') !== null)

const calls = []
let nextAnswer = { ok: true, path: '.dsh-uploads/report.pdf', name: 'report.pdf', ext: 'pdf', bytes: 10 }
let nextStatus = 200
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init })
  return { ok: nextStatus === 200, status: nextStatus, json: async () => nextAnswer }
}

const composerRoot = createRoot(document.getElementById('composer'))
const overlayRoot = createRoot(document.getElementById('overlay'))
const settle = () => React.act(async () => { await new Promise(done => setTimeout(done, 30)) })

/** Props one `conversation.input.left` entry receives, with a draft writer. */
function composerProps(draft) {
  return {
    sessionId: 's1',
    input: { draft },
    inputActions: {
      drafts: [],
      setDraft(text) { this.drafts.push(text) },
      addImages(ids) { this.images = ids; return true },
      removeImage() {},
      pruneImages() {},
      submit() {},
    },
  }
}

let props = composerProps('')
await React.act(async () => {
  composerRoot.render(React.createElement(seat('conversation.input.left'), props))
  overlayRoot.render(React.createElement(seat('shell.overlay'), {}))
})
const button = () => document.querySelector('.dsh-cf-button')
check('renders the clip button beside the composer chrome',
  button() !== null && button().getAttribute('aria-label') === 'Attach a file')
check('offers a multiple file picker with an accept list',
  (() => {
    const picker = document.querySelector('.dsh-cf-picker')
    return picker !== null && picker.multiple === true && picker.getAttribute('accept').includes('.pdf')
  })())

let pickerOpened = 0
dom.window.HTMLInputElement.prototype.click = function click() { pickerOpened += 1 }
await React.act(async () => { button().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
check('the button opens the picker', pickerOpened === 1)

/** Choose one file through the input element. */
async function choose(files) {
  const picker = document.querySelector('.dsh-cf-picker')
  Object.defineProperty(picker, 'files', { value: files, configurable: true })
  await React.act(async () => { picker.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
  await settle()
}

const docFile = new dom.window.File(['pdf bytes'], 'report.pdf', { type: 'application/pdf' })
await choose([docFile])
check('uploads a chosen document to the session route',
  calls.length === 1 && calls[0].url === '/chat-files/s1/upload?name=report.pdf', calls.map(entry => entry.url).join())
check('uploads it as a byte stream',
  calls[0].init.method === 'POST' && calls[0].init.headers['content-type'] === 'application/octet-stream')
check('writes the reference into the draft',
  props.inputActions.drafts.length === 1
  && props.inputActions.drafts[0] === '[attached file: .dsh-uploads/report.pdf (read_document)]\n\n',
  JSON.stringify(props.inputActions.drafts[0]))

nextAnswer = { ok: true, path: '.dsh-uploads/notes.md', name: 'notes.md', ext: 'md', bytes: 10 }
props = composerProps(props.inputActions.drafts[0])
await React.act(async () => { composerRoot.render(React.createElement(seat('conversation.input.left'), props)) })
await choose([new dom.window.File(['# x'], 'notes.md', { type: 'text/markdown' })])
check('appends a second reference to the existing draft',
  props.inputActions.drafts.length === 1
  && props.inputActions.drafts[0].includes('(read_document)') && props.inputActions.drafts[0].includes('(read)')
  && props.inputActions.drafts[0].startsWith('[attached file: .dsh-uploads/report.pdf'),
  JSON.stringify(props.inputActions.drafts[0]))

const beforeImages = calls.length
props = composerProps('typed text')
await React.act(async () => { composerRoot.render(React.createElement(seat('conversation.input.left'), props)) })
await choose([new dom.window.File(['png'], 'shot.png', { type: 'image/png' })])
check('hands an image to the shipped rail instead of staging it',
  conversation.created.length === 1 && props.inputActions.images?.length === 1 && calls.length === beforeImages)
check('an image leaves the draft alone', props.inputActions.drafts.length === 0)

nextAnswer = { ok: false, code: 'TOO_LARGE', maxMB: '25', error: 'The file exceeds the limit.' }
nextStatus = 413
props = composerProps('')
await React.act(async () => { composerRoot.render(React.createElement(seat('conversation.input.left'), props)) })
await choose([new dom.window.File(['x'], 'big.pdf', { type: 'application/pdf' })])
const toast = document.querySelector('.dsh-cf-toast')
check('surfaces a host rejection in the interface language',
  toast !== null && toast.textContent === '"big.pdf" was not attached: The file is larger than 25 MB.'
  && toast.getAttribute('data-kind') === 'error', toast?.textContent)
check('a rejected upload leaves the draft untouched', props.inputActions.drafts.length === 0)

activeLocale = 'es'
for (const listener of localeListeners) listener()
await settle()
check('follows the interface language',
  button().getAttribute('aria-label') === 'Adjuntar un archivo', button().getAttribute('aria-label'))

/**
 * Dispatch one drag event with a synthetic data transfer, reporting whether a
 * listener stopped it. jsdom does not reflect `stopPropagation` in
 * `cancelBubble`, so the method itself is wrapped.
 */
async function drag(type, { items, files }) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], items, files, dropEffect: 'none' },
    configurable: true,
  })
  let stops = 0
  const original = event.stopPropagation.bind(event)
  event.stopPropagation = () => {
    stops += 1
    original()
  }
  await React.act(async () => {
    document.dispatchEvent(event)
    await new Promise(done => setTimeout(done, 10))
  })
  await settle()
  return { event, stopped: () => stops > 0 }
}

nextStatus = 200
nextAnswer = { ok: true, path: '.dsh-uploads/spec.md', name: 'spec.md', ext: 'md', bytes: 10 }
props = composerProps('')
await React.act(async () => { composerRoot.render(React.createElement(seat('conversation.input.left'), props)) })

const imageOnly = await drag('dragenter', { items: [{ kind: 'file', type: 'image/png' }], files: [] })
check('an image-only drag stays with the shell', imageOnly.stopped() === false)
check('an image-only drag shows no invitation',
  document.querySelector('[data-dsh-chat-files="drop"]') === null)
const claimed = await drag('dragenter', { items: [{ kind: 'file', type: 'text/markdown' }], files: [] })
check('a document drag is claimed and stops propagating', claimed.stopped() === true)
check('the drop invitation appears over the page',
  document.querySelector('[data-dsh-chat-files="drop"]') !== null)

const beforeDrop = calls.length
const dropped = await drag('drop', { items: [{ kind: 'file', type: 'text/markdown' }], files: [new dom.window.File(['# spec'], 'spec.md', { type: 'text/markdown' })] })
check('a dropped document is uploaded and referenced',
  calls.length === beforeDrop + 1 && props.inputActions.drafts[0] === '[attached file: .dsh-uploads/spec.md (read)]\n\n',
  JSON.stringify(props.inputActions.drafts[0]))
check('the drop is claimed and the invitation closes',
  dropped.stopped() === true && document.querySelector('[data-dsh-chat-files="drop"]') === null)

// ── result ──────────────────────────────────────────────────────────────────

rmSync(harnessDir, { recursive: true, force: true })
console.log(`\n${String(checks - failures)}/${String(checks)} checks passed`)
if (failures > 0) process.exitCode = 1
