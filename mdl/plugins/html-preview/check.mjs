#!/usr/bin/env node
/**
 * Self-contained check for dsh-html-preview (SPEC-023).
 *
 * Runs both halves without a browser and without a running dsh process:
 *
 *   - The host half is mounted over the REAL `@deepseek-ai/dsh-fs-local`
 *     backend, with pass-through `webServer`, `tools`, `sessions` and `logger`
 *     registries, and its request handlers are invoked directly. This is what
 *     proves the fencing — traversal, symlink escapes through realpath,
 *     extension filtering — and the reference rewriting a framed page needs.
 *   - The client half is executed the way the shell executes it: its factory is
 *     handed a `require` bound to a stub module table, `apply` runs against a
 *     stub slot registry with a locale, and the seats render into a jsdom
 *     document whose viewport width the run controls.
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
const bundle = join(profileModules, 'dsh-html-preview')
const harnessDir = join(process.env.TMPDIR ?? '/tmp', 'html-preview-check')

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
mkdirSync(join(workspace, 'docs'), { recursive: true })
mkdirSync(join(workspace, 'img'), { recursive: true })
mkdirSync(join(workspace, 'node_modules/skip'), { recursive: true })
mkdirSync(join(workspace, 'base'), { recursive: true })
writeFileSync(join(workspace, 'index.html'), [
  '<!doctype html><html><head>',
  '<link rel="stylesheet" href="style.css">',
  '<style>.hero{background:url(img/a.png);}</style>',
  '</head><body>',
  '<a href="#top">top</a>',
  '<a href="docs/other.html">other</a>',
  '<a href="https://example.com/x.html">remote</a>',
  '<img src="img/a.png"><img src="/img/root.png"><img src="data:image/gif;base64,R0lGOD">',
  '<div style="background-image:url(\'img/a.png\')"></div>',
  '<script src="app.js"></script>',
  '</body></html>',
  '',
].join('\n'))
writeFileSync(join(workspace, 'docs/other.html'), '<img src="../img/a.png"><link href="../style.css" rel="stylesheet">\n')
writeFileSync(join(workspace, 'style.css'), 'body{margin:0}\n')
writeFileSync(join(workspace, 'app.js'), 'console.log(1)\n')
writeFileSync(join(workspace, 'img/a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
writeFileSync(join(workspace, 'base/page.html'), '<base href="assets/"><img src="logo.png">\n')
writeFileSync(join(workspace, 'node_modules/skip/x.html'), '<p>not listed</p>\n')
writeFileSync(join(workspace, 'notes.md'), '# not a page\n')
// A symlink whose real target is outside the workspace must never be offered.
writeFileSync(join(harnessDir, 'outside.html'), '<p>secret outside</p>\n')
symlinkSync(join(harnessDir, 'outside.html'), join(workspace, 'docs/escape.html'))
// A directory asked for by name serves its own entry page.
mkdirSync(join(workspace, 'site'), { recursive: true })
writeFileSync(join(workspace, 'site/index.html'), '<p>site entry</p>\n')

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
      headersSent: false, status: 0, headers: {}, body: '',
      writeHead(status, headers) {
        this.status = status
        this.headers = headers ?? {}
        this.headersSent = true
      },
      end(body) {
        this.body = body === undefined ? '' : String(body)
        done(this)
      },
    }
    handler({ method, url, headers: { host: '127.0.0.1:3080' } }, res)
  })
}

/** The parsed JSON body of one call. */
async function json(url) {
  return JSON.parse((await call(url)).body)
}

check('registers one prefix route and the tool',
  routes.length === 1 && routes[0].path === '/html-viewer' && tools.map(tool => tool.name).join() === 'html_preview',
  routes.map(route => route.path).join())
const listing = await json('/html-viewer/s1/__list')
check('lists the workspace pages with the entry page first',
  listing.files.map(file => file.path).join() === 'index.html,site/index.html,base/page.html,docs/other.html', JSON.stringify(listing.files))
check('skips node_modules', !listing.files.some(file => file.path.includes('node_modules')))
check('omits a symlink that leaves the workspace', !listing.files.some(file => file.path.includes('escape')))
check('omits a non-page file', !listing.files.some(file => file.path === 'notes.md'))

const doc = await json('/html-viewer/s1/__doc?path=index.html')
check('serves a page with its directory and size',
  doc.ok === true && doc.dir === '' && doc.path === 'index.html' && doc.sizeBytes > 0)
check('rebases a relative stylesheet and script onto the route',
  doc.ok === true
  && doc.html.includes('href="/html-viewer/s1/style.css"')
  && doc.html.includes('src="/html-viewer/s1/app.js"'),
  doc.html)
check('rebases a relative image and a CSS url()',
  doc.ok === true
  && doc.html.includes('src="/html-viewer/s1/img/a.png"')
  && doc.html.includes('url("/html-viewer/s1/img/a.png")'),
  doc.html)
check('rebases a quoted CSS url() inside a style attribute',
  doc.ok === true && doc.html.includes('background-image:url(\'/html-viewer/s1/img/a.png\')') === false
  && doc.html.includes('url("/html-viewer/s1/img/a.png")'))
check('rebases a root-absolute reference onto the workspace root',
  doc.ok === true && doc.html.includes('src="/html-viewer/s1/img/root.png"'))
check('leaves a remote reference alone',
  doc.ok === true && doc.html.includes('href="https://example.com/x.html"'))
check('leaves a data: reference alone',
  doc.ok === true && doc.html.includes('src="data:image/gif;base64,R0lGOD"'))
check('leaves a fragment alone', doc.ok === true && doc.html.includes('href="#top"'))
check('rebases a sibling reference from a nested page',
  (await json('/html-viewer/s1/__doc?path=docs/other.html')).html.includes('src="/html-viewer/s1/img/a.png"')
  && (await json('/html-viewer/s1/__doc?path=docs/other.html')).html.includes('href="/html-viewer/s1/style.css"'))
check('gives a page without a head a base URL for its own directory',
  (await json('/html-viewer/s1/__doc?path=docs/other.html')).html.startsWith('<base href="/html-viewer/s1/docs/">'),
  (await json('/html-viewer/s1/__doc?path=docs/other.html')).html.slice(0, 60))
check('places the injected base inside the page head',
  /<head[^>]*><base href="\/html-viewer\/s1\/">/.test((await json('/html-viewer/s1/__doc?path=index.html')).html))
check('rebases a base the page declares instead of adding a second one',
  (await json('/html-viewer/s1/__doc?path=base/page.html')).html.includes('<base href="/html-viewer/s1/base/assets/">')
  && ((await json('/html-viewer/s1/__doc?path=base/page.html')).html.match(/<base\b/gi) ?? []).length === 1)
const chrome = await call('/html-viewer/s1/__page?path=index.html&back=%2Fworkspace%2Fdemo%2F%3Fsession%3Ds1&lang=es')
check('the chrome document frames the page and offers a way back',
  chrome.status === 200
  && chrome.headers['content-type'] === 'text/html; charset=utf-8'
  && chrome.body.includes('<iframe class="page" srcdoc="')
  && chrome.body.includes('href="/workspace/demo/?session=s1"')
  && chrome.body.includes('Volver a la GUI'),
  chrome.body.slice(0, 120))
check('the chrome document frames the same rewritten page the panel shows',
  chrome.body.includes('/html-viewer/s1/style.css') && chrome.body.includes('&quot;'))
check('the chrome document drops a return target on another host',
  (await call('/html-viewer/s1/__page?path=index.html&back=https%3A%2F%2Fevil.example%2Fx')).body.includes('class="back" href="/"'))
check('the chrome document reports an unusable path instead of framing it',
  (await call('/html-viewer/s1/__page?path=..%2F..%2Fetc%2Fpasswd')).body.includes('cannot leave the session workspace'))
check('rejects a traversal path',
  (await json('/html-viewer/s1/__doc?path=../../etc/passwd')).error === 'The path cannot leave the session workspace.')
check('rejects an encoded traversal path',
  (await json('/html-viewer/s1/__doc?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd')).error === 'The path cannot leave the session workspace.')
check('rejects a symlink whose real target is outside',
  (await json('/html-viewer/s1/__doc?path=docs/escape.html')).error === 'That path is outside the session workspace.')
check('rejects a non-HTML extension', (await json('/html-viewer/s1/__doc?path=style.css')).error?.includes('Only HTML pages') === true)
check('serves an asset as bytes with its content type',
  (await call('/html-viewer/s1/img/a.png')).body.length === 4
  && (await call('/html-viewer/s1/img/a.png')).headers['content-type'] === 'image/png')
check('serves the page source unrewritten on the raw route',
  (await call('/html-viewer/s1/style.css')).headers['content-type'] === 'text/css; charset=utf-8'
  && (await call('/html-viewer/s1/index.html')).body.includes('href="style.css"'))
check('serves index.html for a folder', (await call('/html-viewer/s1/site')).body.includes('site entry'))
check('refuses an asset outside the workspace', (await call('/html-viewer/s1/docs/escape.html')).status === 403)
check('answers an unknown session with 404', (await call('/html-viewer/nope/__list')).status === 404)
check('refuses a write method', (await call('/html-viewer/s1/__list', 'POST')).status === 405)
check('refuses a NUL in the route', (await call('/html-viewer/s1/index%00.html')).status === 403)

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
globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

const pages = {
  'index.html': {
    ok: true, path: 'index.html', dir: '', sizeBytes: 900,
    html: '<!doctype html><link href="/html-viewer/s1/style.css" rel="stylesheet"><img src="/html-viewer/s1/img/a.png">',
  },
  'docs/other.html': {
    ok: true, path: 'docs/other.html', dir: 'docs', sizeBytes: 40,
    html: '<p>other page</p>',
  },
}
const requested = []
globalThis.fetch = async (url) => {
  requested.push(url)
  const body = value => ({ ok: true, json: async () => value })
  if (url.includes('/__list')) {
    return body({
      ok: true, root: '/workspace/demo', truncated: false,
      files: [
        { path: 'index.html', size: 900 },
        { path: 'site/index.html', size: 20 },
        { path: 'docs/other.html', size: 40 },
      ],
    })
  }
  if (url.includes('/__doc')) {
    const path = new URL(url, 'http://x').searchParams.get('path')
    return body(pages[path] ?? { ok: false, error: `missing ${path}` })
  }
  throw new Error(`unexpected fetch ${url}`)
}

let handoff
dom.window.__ModuleLoader__ = { load: (value) => { handoff = value } }
dom.window.eval(readFileSync(join(bundle, 'client.js'), 'utf8'))
check('registers the bundle under its package id', handoff !== undefined && handoff.id === 'dsh-html-preview')

const mod = handoff.factory((spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require: ${spec}`)
})
const seats = []
const locales = new Set()
let activeLocale = 'en'
mod.apply({
  effect(fn) { return fn() },
  locale: {
    getLocale: () => ({ active: activeLocale }),
    subscribe: (listener) => {
      locales.add(listener)
      return () => locales.delete(listener)
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
check('registers the header button, the viewer and the tool card',
  seat('conversation.session.header.actions') !== undefined
  && seat('shell.overlay') !== undefined
  && seat('tool.call.toolview') !== undefined,
  seats.map(entry => entry.registration.name).join())
check('the tool card owns the html_preview key',
  seats.some(entry => entry.registration.key === 'html_preview'))

const headerRoot = createRoot(document.getElementById('root'))
const overlayRoot = createRoot(document.getElementById('overlay'))
const extra = document.createElement('div')
document.body.append(extra)
const extraRoot = createRoot(extra)
const settle = () => React.act(async () => {
  await new Promise(done => setTimeout(done, 30))
})
const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const rows = () => [...document.querySelectorAll('.dsh-hp-item')].map(node => node.textContent)
const toolbar = () => [...document.querySelectorAll('.dsh-hp-btn')].map(node => node.textContent)
const iconButton = name => document.querySelector(`.dsh-hp-ibtn[aria-label="${name}"]`)

await React.act(async () => {
  headerRoot.render(React.createElement(seat('conversation.session.header.actions'), { sessionId: 's1' }))
  overlayRoot.render(React.createElement(seat('shell.overlay'), {}))
  await new Promise(done => setTimeout(done, 30))
})
check('the viewer starts closed', document.querySelector('.dsh-hp-card') === null)
check('the header control is labelled in English by default',
  document.querySelector('.dsh-hp-hbtn')?.textContent === 'HTML')

// ── phone layout ──
click(document.querySelector('.dsh-hp-hbtn'))
await settle()
const card = document.querySelector('.dsh-hp-card')
check('the panel opens in the phone layout', card?.getAttribute('data-narrow') === 'true')
// The shell floats its menu button above this panel's stacking context, so the
// phone layout must break at the same width and leave the menu's band empty.
check('the phone layout uses the shell\'s own breakpoint',
  queries.some(query => query.media === '(max-width: 767px)'),
  queries.map(query => query.media).join())
const style = document.head.querySelector('style[data-plugin="dsh-html-preview"]')?.textContent ?? ''
check('the phone panel reserves the floating menu band at the top',
  style.includes('padding:calc(58px + env(safe-area-inset-top, 0px))'),
  'no 58px top reservation in the phone card rule')
check('the list shows every page, entry pages first',
  rows().join() === 'index.html,site/index.html,docs/other.html', rows().join())
check('a phone opens on the list, with no page framed yet', document.querySelector('.dsh-hp-doc') === null)
check('the phone toolbar offers reload, open and close as icons',
  iconButton('Reload') !== null && iconButton('Close the viewer') !== null
  && document.querySelector('a.dsh-hp-ibtn')?.getAttribute('href')?.startsWith('/html-viewer/s1/__page?path=index.html&lang=en&back='))

click([...document.querySelectorAll('.dsh-hp-item')].find(node => node.textContent === 'docs/other.html'))
await settle()
check('picking a page switches to the page pane', document.querySelector('.dsh-hp-doc')?.querySelector('.dsh-hp-frame') !== null)
check('the page pane names the file and offers a way back',
  document.querySelector('.dsh-hp-title')?.textContent === 'other.html' && iconButton('Back to the list') !== null)
check('the frame receives the page source as srcdoc',
  document.querySelector('.dsh-hp-frame')?.getAttribute('srcdoc') === '<p>other page</p>')
click(iconButton('Back to the list'))
await settle()
check('back returns to the list', document.querySelector('.dsh-hp-list') !== null && document.querySelector('.dsh-hp-doc') === null)

// ── desktop layout ──
setNarrow(false)
await settle()
check('a wide viewport keeps the list and the page together',
  document.querySelector('.dsh-hp-card')?.getAttribute('data-narrow') === 'false'
  && document.querySelector('.dsh-hp-list') !== null && document.querySelector('.dsh-hp-doc') !== null)
check('the wide toolbar is labelled', toolbar().join() === 'Refresh,Reload,Open ↗,Close', toolbar().join())
click([...document.querySelectorAll('.dsh-hp-item')].find(node => node.textContent === 'index.html'))
await settle()
check('the wide list swaps the framed page in place',
  document.querySelector('.dsh-hp-doc')?.querySelector('.dsh-hp-frame') !== null
  && document.querySelector('.dsh-hp-list') !== null)
check('the framed page carries its rebased references',
  document.querySelector('.dsh-hp-frame')?.getAttribute('srcdoc')?.includes('/html-viewer/s1/style.css'))
check('open points at the chrome document, with the way back and the locale',
  (() => {
    const href = document.querySelector('a.dsh-hp-btn')?.getAttribute('href') ?? ''
    return href.startsWith('/html-viewer/s1/__page?path=index.html&lang=en&back=')
      && href.endsWith(encodeURIComponent('http://127.0.0.1:3080/'))
  })(),
  document.querySelector('a.dsh-hp-btn')?.getAttribute('href'))
click(toolbarButton('Refresh'))
await settle()
check('refresh re-reads the listing', requested.filter(url => url.includes('/__list')).length >= 2)
click(toolbarButton('Close'))
await settle()
check('close hides the panel', document.querySelector('.dsh-hp-card') === null)

/** One wide-toolbar button by its label. */
function toolbarButton(label) {
  return [...document.querySelectorAll('.dsh-hp-btn')].find(node => node.textContent === label)
}

// ── the Tool card ──
await React.act(async () => {
  extraRoot.render(React.createElement(seat('tool.call.toolview'), {
    sessionId: 's1',
    block: { kind: 'tool-result', call: { argsRaw: '{"path":"docs/other.html"}' } },
  }))
  await new Promise(done => setTimeout(done, 30))
})
check('the tool card reads the path from the call and frames the page',
  extra.textContent.includes('docs/other.html')
  && extra.querySelector('.dsh-hp-frame')?.getAttribute('srcdoc') === '<p>other page</p>')
check('the tool card can hand the page to the viewer',
  [...extra.querySelectorAll('.dsh-hp-btn')].some(node => node.textContent === 'Open ↗'))

// ── locale ──
activeLocale = 'es'
await React.act(async () => {
  for (const listener of locales) listener()
  await new Promise(done => setTimeout(done, 30))
})
const spanishLabels = [...extra.querySelectorAll('.dsh-hp-btn')].map(node => node.textContent).join()
check('the tool card follows the Spanish locale', spanishLabels === 'Recargar,Abrir ↗', spanishLabels)
activeLocale = 'zh'
await React.act(async () => {
  for (const listener of locales) listener()
  await new Promise(done => setTimeout(done, 30))
})
const fallbackLabels = [...extra.querySelectorAll('.dsh-hp-btn')].map(node => node.textContent).join()
check('a locale without copy falls back to English', fallbackLabels === 'Reload,Open ↗', fallbackLabels)

rmSync(harnessDir, { recursive: true, force: true })
console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
