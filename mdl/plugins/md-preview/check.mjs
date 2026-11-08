#!/usr/bin/env node
/**
 * Self-contained check for dsh-md-preview (SPEC-022).
 *
 * Runs both halves without a browser and without a running dsh process:
 *
 *   - The host half is mounted over the REAL `@deepseek-ai/dsh-fs-local`
 *     backend, with pass-through `webServer`, `tools` and `sessions`
 *     registries, and its request handlers are invoked directly. This is what
 *     proves the fencing: traversal, symlink escapes through realpath,
 *     extension filtering, and reply reads from the session log.
 *   - The client half is executed the way the shell executes it: its factory is
 *     handed a `require` bound to a stub module table, `apply` runs against a
 *     stub slot registry, and the seats render into a jsdom document.
 *     `MarkdownText` is replaced by a minimal Markdown renderer, so this checks
 *     the reader's own behaviour and not the conversation renderer.
 *
 * Usage: `node check.mjs` (from anywhere). Environment:
 *   DSH_HOME     DSH home holding `profiles/node_modules` (default `~/.dsh`)
 *   JSDOM_FROM   directory whose node_modules resolves `jsdom`
 *                (default: the repository root that contains this file)
 */

import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const dshHome = process.env.DSH_HOME ?? join(process.env.HOME ?? '/root', '.dsh')
const profileModules = join(dshHome, 'profiles/node_modules')
const bundle = join(profileModules, 'dsh-md-preview')
const harnessDir = join(process.env.TMPDIR ?? '/tmp', 'md-preview-check')

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

// ── host half ───────────────────────────────────────────────────────────────

console.log('host half')

const workspace = join(harnessDir, 'ws')
rmSync(harnessDir, { recursive: true, force: true })
mkdirSync(join(workspace, 'docs/img'), { recursive: true })
mkdirSync(join(workspace, 'node_modules/skip'), { recursive: true })
writeFileSync(join(workspace, 'README.md'), '# Title\n\n![d](docs/img/a.png)\n')
writeFileSync(join(workspace, 'docs/guide.md'), '## Guide\n\nBody\n')
writeFileSync(join(workspace, 'docs/img/a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
writeFileSync(join(workspace, 'node_modules/skip/x.md'), '# not listed\n')
// A symlink whose real target is outside the workspace must never be offered.
writeFileSync(join(harnessDir, 'outside.md'), '# secret outside\n')
symlinkSync(join(harnessDir, 'outside.md'), join(workspace, 'docs/escape.md'))

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
ctx.plugin(plugin, {})
await new Promise(settle => setTimeout(settle, 50))

/** Invoke the served route and collect the response. */
function call(url, method = 'GET') {
  return new Promise((done) => {
    const res = {
      headersSent: false, status: 0, body: '',
      writeHead(status) {
        this.status = status
        this.headersSent = true
      },
      end(body) {
        this.body = body === undefined ? '' : String(body)
        done(this)
      },
    }
    handler({ method, url }, res)
  })
}

/** The parsed JSON body of one call. */
async function json(url) {
  return JSON.parse((await call(url)).body)
}

check('registers one prefix route and the tool',
  routes.length === 1 && routes[0].path === '/md-viewer' && tools.map(tool => tool.name).join() === 'md_preview',
  routes.map(route => route.path).join())
const listing = await json('/md-viewer/s1/__list')
check('lists the workspace documents by path',
  listing.files.map(file => file.path).join() === 'README.md,docs/guide.md', JSON.stringify(listing.files))
check('skips node_modules', !listing.files.some(file => file.path.includes('node_modules')))
check('omits a symlink that leaves the workspace', !listing.files.some(file => file.path.includes('escape')))
const doc = await json('/md-viewer/s1/__doc?path=README.md')
check('serves a document with its directory and title', doc.ok === true && doc.dir === '' && doc.title === 'Title')
check('serves a nested document with its directory', (await json('/md-viewer/s1/__doc?path=docs/guide.md')).dir === 'docs')
check('rejects a traversal path',
  (await json('/md-viewer/s1/__doc?path=../../etc/passwd')).error === 'The path cannot leave the session workspace.')
check('rejects an encoded traversal path',
  (await json('/md-viewer/s1/__doc?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd')).error === 'The path cannot leave the session workspace.')
check('rejects a symlink whose real target is outside',
  (await json('/md-viewer/s1/__doc?path=docs/escape.md')).error === 'That path is outside the session workspace.')
check('rejects a non-Markdown extension', (await json('/md-viewer/s1/__doc?path=docs/img/a.png')).ok === false)
check('serves an asset as bytes', (await call('/md-viewer/s1/docs/img/a.png')).body.length === 4)
check('refuses an asset outside the workspace', (await call('/md-viewer/s1/docs/escape.md')).status === 403)
check('answers an unknown session with 404', (await call('/md-viewer/nope/__list')).status === 404)
check('refuses a write method', (await call('/md-viewer/s1/__list', 'POST')).status === 405)

// ── client half ─────────────────────────────────────────────────────────────

console.log('client half')

const profileRequire = createRequire(join(profileModules, 'noop.cjs'))
const React = profileRequire('react')
const { createRoot } = profileRequire('react-dom/client')
const { JSDOM } = createRequire(join(process.env.JSDOM_FROM ?? repoRoot, 'noop.cjs'))('jsdom')

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="overlay"></div></body></html>', { url: 'http://127.0.0.1:3080/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.location = dom.window.location
globalThis.Blob = dom.window.Blob
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.URL.createObjectURL = () => 'blob:stub'
globalThis.URL.revokeObjectURL = () => {}

// A matchMedia whose viewport the run can flip, so one pass covers both layouts.
let narrow = true
const queries = []
dom.window.matchMedia = (media) => {
  const query = {
    media,
    matches: narrow,
    listeners: new Set(),
    addEventListener(_type, listener) { query.listeners.add(listener) },
    removeEventListener(_type, listener) { query.listeners.delete(listener) },
    addListener(listener) { query.listeners.add(listener) },
    removeListener(listener) { query.listeners.delete(listener) },
  }
  queries.push(query)
  return query
}
/** Pretend the viewport changed, as a rotation or a resized window would. */
function setNarrow(value) {
  narrow = value
  for (const query of queries) {
    query.matches = value
    for (const listener of query.listeners) listener()
  }
}

const documents = {
  'README.md': {
    ok: true, path: 'README.md', dir: '', sizeBytes: 120, title: 'Project',
    text: '# Project\n\nSee [the guide](docs/guide.md) and ![logo](docs/img/logo.png).\n\n## Install\n\n```sh\nnpm i\n```\n\n## Usage\n\ntext\n',
  },
  'docs/guide.md': {
    ok: true, path: 'docs/guide.md', dir: 'docs', sizeBytes: 40, title: 'Guide',
    text: '# Guide\n\nBack to [readme](../README.md).\n',
  },
  'docs/deep/api.md': {
    ok: true, path: 'docs/deep/api.md', dir: 'docs/deep', sizeBytes: 60, title: 'API',
    text: '# API\n\nReference.\n',
  },
}
let clipboard = null
globalThis.fetch = async (url) => {
  const body = value => ({ ok: true, json: async () => value })
  if (url.includes('/__list')) {
    return body({
      ok: true, root: '/workspace/demo', truncated: false,
      files: [{ path: 'README.md', size: 120 }, { path: 'docs/deep/api.md', size: 60 }, { path: 'docs/guide.md', size: 40 }],
    })
  }
  if (url.includes('/__doc')) {
    const path = new URL(url, 'http://x').searchParams.get('path')
    return body(documents[path] ?? { ok: false, error: `missing ${path}` })
  }
  throw new Error(`unexpected fetch ${url}`)
}
dom.window.navigator.clipboard = { writeText: async (value) => { clipboard = value } }
const downloads = []
dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download) }

let handoff
globalThis.window.__ModuleLoader__ = { load: (value) => { handoff = value } }
dom.window.eval(readFileSync(join(bundle, 'client.js'), 'utf8'))
check('registers the bundle under its package id', handoff !== undefined && handoff.id === 'dsh-md-preview')

/** Minimal Markdown stand-in: real headings, anchors and images. */
function inline(text) {
  const out = []
  const pattern = /(!?)\[([^\]]*)\]\(([^)]*)\)/g
  let last = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const [, bang, label, href] = match
    out.push(bang === '!'
      ? React.createElement('img', { key: match.index, src: href, alt: label })
      : React.createElement('a', { key: match.index, href }, label))
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return React.createElement(React.Fragment, null, ...out)
}
const MarkdownText = ({ text }) => React.createElement('div', { className: 'stub-markdown', 'data-text': text },
  ...text.split('\n').map((line, index) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) return React.createElement(`h${heading[1].length}`, { key: index }, heading[2])
    if (line.trim() === '' || line.startsWith('```')) return null
    return React.createElement('p', { key: index }, inline(line))
  }))
const writeClipboard = async (value) => { clipboard = value; return true }

const mod = handoff.factory((spec) => {
  if (spec === 'react') return React
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText, writeClipboard }
  throw new Error(`unexpected require: ${spec}`)
})
const seats = []
mod.apply({
  effect(fn) { return fn() },
  locale: { getLocale: () => ({ active: 'en' }), subscribe: () => () => {} },
  slots: {
    inject(_name, callback) { callback() },
    register(registration, Component) {
      seats.push({ registration, Component })
      return () => {}
    },
  },
})
const seat = name => seats.find(entry => entry.registration.name === name)?.Component
check('registers the header button and the tool card',
  seat('conversation.session.header.actions') !== undefined
  && seat('shell.overlay') !== undefined
  && seat('tool.call.toolview') !== undefined
  && seat('conversation.chat.assistant-actions') === undefined,
  seats.map(entry => entry.registration.name).join())

const headerRoot = createRoot(document.getElementById('root'))
const overlayRoot = createRoot(document.getElementById('overlay'))
const extra = document.createElement('div')
document.body.append(extra)
const extraRoot = createRoot(extra)
const settle = () => React.act(async () => {
  await new Promise(done => setTimeout(done, 30))
})
const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const rows = () => [...document.querySelectorAll('.dsh-mdp-item')].map(node => node.textContent)
const iconButton = name => document.querySelector(`.dsh-mdp-ibtn[aria-label="${name}"]`)
const toolbar = () => [...document.querySelectorAll('.dsh-mdp-btn')]

await React.act(async () => {
  headerRoot.render(React.createElement(seat('conversation.session.header.actions'), { sessionId: 's1' }))
  overlayRoot.render(React.createElement(seat('shell.overlay'), {}))
  await new Promise(done => setTimeout(done, 30))
})
check('the panel starts closed', document.querySelector('.dsh-mdp-card') === null)

// ── phone layout ──
click(document.querySelector('.dsh-mdp-hbtn'))
await settle()
const card = document.querySelector('.dsh-mdp-card')
check('the panel opens in the phone layout', card?.getAttribute('data-narrow') === 'true')
// The shell floats its menu button above this panel's stacking context, so the
// phone layout must break at the same width and leave the menu's band empty.
check('the phone layout uses the shell\'s own breakpoint',
  queries.some(query => query.media === '(max-width: 767px)'),
  queries.map(query => query.media).join())
const style = document.head.querySelector('style[data-plugin="dsh-md-preview"]')?.textContent ?? ''
check('the phone panel reserves the floating menu band at the top',
  style.includes('padding:calc(58px + env(safe-area-inset-top, 0px))'),
  'no 58px top reservation in the phone card rule')
check('a phone opens on the file list, not on a document', document.querySelector('.dsh-mdp-doc') === null && document.querySelector('.dsh-mdp-side') !== null)
check('folders start collapsed, so only the root file and the folder show',
  rows().join() === 'README.md,docs', rows().join())
check('the folder row is a disclosure', document.querySelector('.dsh-mdp-dir')?.getAttribute('aria-expanded') === 'false')

click([...document.querySelectorAll('.dsh-mdp-dir')][0])
await settle()
check('opening a folder reveals its documents and nested folder',
  rows().join() === 'README.md,docs,guide.md,deep', rows().join())

click([...document.querySelectorAll('.dsh-mdp-item')].find(node => node.textContent === 'guide.md'))
await settle()
check('picking a document switches to the document pane', document.querySelector('.dsh-mdp-doc') !== null && document.querySelector('.dsh-mdp-side') === null)
check('the document pane shows the file name and a back button',
  document.querySelector('.dsh-mdp-mname')?.textContent === 'guide.md' && iconButton('Back to the list') !== null)
check('the document renders', document.querySelector('.stub-markdown')?.textContent.includes('Guide'))

click(iconButton('Outline'))
await settle()
check('the outline opens as a sheet over the document',
  document.querySelector('.dsh-mdp-sheet') !== null
  && [...document.querySelectorAll('.dsh-mdp-sheet .dsh-mdp-tocitem')].map(node => node.textContent).join() === 'Guide')
click(iconButton('Outline'))
await settle()

click(iconButton('Back to the list'))
await settle()
check('back returns to the list with the folder still open',
  document.querySelector('.dsh-mdp-side') !== null && rows().join() === 'README.md,docs,guide.md,deep')

click([...document.querySelectorAll('.dsh-mdp-item')].find(node => node.textContent === 'deep'))
await settle()
check('a nested folder opens in place', rows().join() === 'README.md,docs,guide.md,deep,api.md', rows().join())

// ── desktop layout ──
setNarrow(false)
await settle()
check('a wide viewport returns to the three-column layout',
  document.querySelector('.dsh-mdp-card')?.getAttribute('data-narrow') === 'false' && document.querySelector('.dsh-mdp-doc') !== null)
check('the tree, the document and the toolbar share the panel',
  document.querySelector('.dsh-mdp-side') !== null && toolbar().length === 5, toolbar().map(node => node.textContent).join())

if (document.querySelector('.dsh-mdp-toc') === null) {
  click(toolbar().find(node => node.textContent === 'Outline'))
  await settle()
}
check('the outline lists the headings with levels',
  [...document.querySelectorAll('.dsh-mdp-toc .dsh-mdp-tocitem')].map(node => `${node.getAttribute('data-level')}:${node.textContent}`).join() === '1:Guide')

click([...document.querySelectorAll('.dsh-mdp-doc a')].find(node => node.getAttribute('href').endsWith('README.md')))
await settle()
check('a relative link opens the other document in place',
  document.querySelector('.dsh-mdp-sub')?.textContent === 'README.md')
check('the outline follows the document that just opened',
  [...document.querySelectorAll('.dsh-mdp-toc .dsh-mdp-tocitem')].map(node => `${node.getAttribute('data-level')}:${node.textContent}`).join() === '1:Project,2:Install,2:Usage')
check('a relative image becomes a route URL',
  document.querySelector('.stub-markdown').getAttribute('data-text').includes('![logo](http://127.0.0.1:3080/md-viewer/s1/docs/img/logo.png)'))

click(toolbar().find(node => node.textContent === 'Copy'))
await settle()
check('copy sends the whole document to the clipboard', clipboard !== null && clipboard.startsWith('# Project'))
check('copy reports success in the toolbar', toolbar().some(node => node.textContent === 'Copied ✓'))

click(toolbar().find(node => node.textContent === 'Download'))
await settle()
check('download names the file after the document', downloads.join() === 'README.md', downloads.join())

await React.act(async () => {
  extraRoot.render(React.createElement(seat('tool.call.toolview'), {
    sessionId: 's1',
    block: { kind: 'tool-result', call: { argsRaw: '{"path":"docs/guide.md"}' } },
  }))
  await new Promise(done => setTimeout(done, 30))
})
check('the tool card reads the path from the call', extra.textContent.includes('docs/guide.md'))

// A reply that links the report it wrote renders a plain anchor outside the
// panel; clicking it must open the document instead of navigating the shell.
const chat = document.createElement('div')
chat.innerHTML = '<p>Wrote <a href="docs/guide.md">the guide</a> and '
  + '<a href="https://example.com/x.md">a remote one</a> and '
  + '<a href="docs/guide.md" target="_blank">a new-tab one</a>.</p>'
document.body.append(chat)
click(chat.querySelector('a[href="docs/guide.md"]'))
await settle()
check('a document link in a reply opens the reader on that file',
  document.querySelector('.dsh-mdp-card') !== null
  && document.querySelector('.stub-markdown')?.textContent.includes('Guide'),
  document.querySelector('.dsh-mdp-sub')?.textContent)
// A file token (an inline-code mention or a produced-files chip) is a button
// whose title is the full path; it must open the reader rather than the OS.
const chip = document.createElement('div')
chip.innerHTML = '<button type="button" title="docs/guide.md">guide.md</button>'
  + '<button type="button" title="Save as .md">Save</button>'
document.body.append(chip)
const chipEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
chip.querySelector('button[title="docs/guide.md"]').dispatchEvent(chipEvent)
await settle()
check('a document file token opens the reader too', chipEvent.defaultPrevented === true)
const decoy = chip.querySelector('button[title="Save as .md"]')
const decoyEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
decoy.dispatchEvent(decoyEvent)
check('a control whose label merely ends in .md is left alone', decoyEvent.defaultPrevented === false)

const remote = chat.querySelector('a[href^="https://"]')
const remoteEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
remote.dispatchEvent(remoteEvent)
check('a remote link keeps the browser\'s behaviour', remoteEvent.defaultPrevented === false)
const newTab = chat.querySelector('a[target="_blank"]')
const newTabEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
newTab.dispatchEvent(newTabEvent)
check('a link that asks for a new tab is left alone', newTabEvent.defaultPrevented === false)

click(document.querySelector('.dsh-mdp-hbtn'))
await settle()
check('the header button closes the panel again', document.querySelector('.dsh-mdp-card') === null)

rmSync(harnessDir, { recursive: true, force: true })
console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
