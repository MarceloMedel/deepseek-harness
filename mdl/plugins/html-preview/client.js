/**
 * dsh-html-preview — browser half.
 *
 * Three seats, one shared store:
 *   - `conversation.session.header.actions`: the `HTML` button that toggles the viewer.
 *   - `shell.overlay`: the viewer — the workspace's HTML pages and the selected
 *     one framed over the conversation.
 *   - `tool.call.toolview` key `html_preview`: the card the agent's call renders into.
 *
 * The page is framed with `srcdoc`, which is what paints inside the shell. The
 * host half has already rebased the page's relative references onto the route,
 * so a framed page keeps its own stylesheet, scripts, images and data. `Abrir ↗`
 * uses the raw route, which mirrors the workspace tree and needs no rewriting.
 *
 * Two layouts share one state machine. Width is the only difference: below
 * `NARROW_WIDTH` the panel takes the viewport and shows one pane at a time —the
 * page list, then the page with a back button — because a list column and a
 * document column on a phone leave neither readable. Wider than that keeps the
 * list and the page side by side.
 */

window.__ModuleLoader__.load({
  id: 'dsh-html-preview',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    /** Route prefix owned by the host half. */
    const ROUTE = '/html-viewer'
    /**
     * Viewport width at or below which the panel becomes a single-pane phone
     * layout. It must match the shell's own phone breakpoint (`MOBILE_MAX` in
     * `packages/client/ui-layout/src/client/columns.ts`): above it the shell
     * still floats its menu button, which sits at a higher stacking level than
     * the overlay slot this panel renders into.
     */
    const NARROW_WIDTH = 767
    /**
     * Leading band the phone layout must leave empty, matching the shell's
     * `MOBILE_MENU_RESERVED`: the floating menu control is a 38px box at a 10px
     * inset plus a 10px gap. The menu lives outside this panel's stacking
     * context, so no z-index here can cover it — the panel starts below it.
     */
    const MENU_RESERVED = 58

    /** Product copy, English source of truth plus Spanish (MDL-LOCALE-01). */
    const STRINGS = {
      en: {
        buttonLabel: 'HTML',
        buttonTitle: 'Viewer for the workspace HTML pages',
        panelTitle: 'HTML viewer',
        searching: 'Looking for pages…',
        emptyFiles: 'No HTML pages in this workspace.',
        pickPage: 'Choose a page from the list.',
        loading: 'Rendering the page…',
        refresh: 'Refresh',
        reload: 'Reload',
        open: 'Open ↗',
        openTitle: 'Open the page in its own tab',
        close: 'Close',
        closeTitle: 'Close the viewer',
        back: 'Back to the list',
        cardTitle: 'HTML preview',
        noPath: 'The viewer could not find a path in that call.',
        listError: 'The workspace could not be read',
        loadError: 'The page could not be rendered',
        truncated: 'The list stops at 400 pages.',
      },
      es: {
        buttonLabel: 'HTML',
        buttonTitle: 'Visor de las páginas HTML del workspace',
        panelTitle: 'Visor HTML',
        searching: 'Buscando páginas…',
        emptyFiles: 'No hay páginas HTML en este workspace.',
        pickPage: 'Elige una página de la lista.',
        loading: 'Renderizando la página…',
        refresh: 'Actualizar',
        reload: 'Recargar',
        open: 'Abrir ↗',
        openTitle: 'Abrir la página en su propia pestaña',
        close: 'Cerrar',
        closeTitle: 'Cerrar el visor',
        back: 'Volver a la lista',
        cardTitle: 'Vista previa HTML',
        noPath: 'El visor no pudo leer la ruta de la llamada.',
        listError: 'No se pudo leer el workspace',
        loadError: 'No se pudo renderizar la página',
        truncated: 'La lista se detiene en 400 páginas.',
      },
    }

    /** Copy for one locale, falling back to English for an unpublished id. */
    function strings(locale) {
      return STRINGS[locale] ?? STRINGS.en
    }

    const CSS = [
      // The header control beside the session title.
      '.dsh-hp-hbtn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:7px;padding:3px 9px;font-size:12px;font-weight:600;line-height:1.5;cursor:pointer;display:inline-flex;align-items:center;gap:4px}',
      '.dsh-hp-hbtn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-hp-hbtn[data-open="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      // The floating panel.
      '.dsh-hp-card{pointer-events:auto;position:fixed;right:24px;bottom:24px;width:min(1100px,92vw);height:min(760px,82vh);display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 24px 60px rgba(0,0,0,.45);z-index:9999}',
      '.dsh-hp-root{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);min-width:0}',
      '.dsh-hp-card .dsh-hp-root{flex:1 1 auto;min-height:0}',
      '.dsh-hp-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
      '.dsh-hp-title{font-weight:600;letter-spacing:-.01em}',
      '.dsh-hp-sub{color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44ch}',
      '.dsh-hp-spacer{flex:1 1 auto}',
      '.dsh-hp-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 9px;font-size:12px;line-height:1.5;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px;font-family:inherit}',
      '.dsh-hp-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-hp-ibtn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:7px;width:30px;height:30px;padding:0;font-size:15px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-family:inherit}',
      '.dsh-hp-body{display:flex;gap:8px;min-width:0;flex:1 1 auto;min-height:0}',
      '.dsh-hp-list{width:220px;flex:0 0 220px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:4px}',
      '.dsh-hp-item{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:5px 8px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:inherit}',
      '.dsh-hp-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-hp-item[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsh-hp-doc{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px}',
      // The framed page paints over its own white ground whatever the GUI theme is.
      '.dsh-hp-frame{flex:1 1 auto;min-width:0;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:#fff;display:block}',
      '.dsh-hp-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6;padding:12px;max-width:52ch}',
      '.dsh-hp-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.6;padding:12px;max-width:52ch}',
      '.dsh-hp-chip{font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 8px}',
      // Phone layout: the panel owns the viewport and leaves the menu band free.
      `.dsh-hp-card[data-narrow="true"]{right:0;bottom:0;left:0;top:0;width:auto;height:auto;border-radius:0;border:0;padding:calc(${String(MENU_RESERVED)}px + env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px));box-shadow:none}`,
      '.dsh-hp-card[data-narrow="true"] .dsh-hp-body{flex-direction:column;gap:8px}',
      '.dsh-hp-card[data-narrow="true"] .dsh-hp-list{width:auto;flex:1 1 auto;min-height:0}',
      '.dsh-hp-card[data-narrow="true"] .dsh-hp-item{padding:9px 10px;font-size:14px}',
      '.dsh-hp-card[data-narrow="true"] .dsh-hp-doc{flex:1 1 auto;min-height:0}',
    ].join('\n')

    /** True while the viewport is at or below the shell's phone breakpoint. */
    function isNarrow() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      return window.matchMedia(`(max-width: ${String(NARROW_WIDTH)}px)`).matches
    }

    /** Follow the viewport width, so one mounted panel serves both layouts. */
    function useNarrow() {
      const [narrow, setNarrow] = React.useState(isNarrow)
      React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const query = window.matchMedia(`(max-width: ${String(NARROW_WIDTH)}px)`)
        const sync = () => setNarrow(query.matches)
        sync()
        query.addEventListener('change', sync)
        return () => query.removeEventListener('change', sync)
      }, [])
      return narrow
    }

    /**
     * The document that frames one page outside the GUI. A page opened on its
     * own has no way back, and on a phone the installed app leaves no browser
     * chrome to escape with, so the route answers with the page under a bar
     * carrying the return target and a reload.
     */
    function openUrlFor(sessionId, path, locale) {
      const back = typeof window !== 'undefined' && typeof window.location?.href === 'string' ? window.location.href : ''
      const query = `path=${encodeURIComponent(path)}&lang=${encodeURIComponent(locale)}`
      return `${ROUTE}/${encodeURIComponent(String(sessionId))}/__page?${query}${back === '' ? '' : `&back=${encodeURIComponent(back)}`}`
    }

    /** Human-readable byte count. */
    function formatSize(bytes) {
      const value = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / (1024 * 1024)).toFixed(1)} MB`
    }

    /** Error text from anything thrown. */
    function messageOf(error) {
      if (error === null || error === undefined) return 'unknown error'
      return typeof error === 'string' ? error : String(error.message ?? error)
    }

    /** Base name of one workspace path. */
    function nameOf(path) {
      const cut = String(path).lastIndexOf('/')
      return cut < 0 ? String(path) : String(path).slice(cut + 1)
    }

    // Shared in-memory state: which workspace, whether the viewer is open, what is selected.
    const listeners = new Set()
    let state = { sessionId: '', open: false, path: null, locale: 'en' }
    function publish(patch) {
      state = {
        sessionId: patch.sessionId === undefined ? state.sessionId : patch.sessionId,
        open: patch.open === undefined ? state.open : patch.open,
        path: patch.path === undefined ? state.path : patch.path,
        locale: patch.locale === undefined ? state.locale : patch.locale,
      }
      for (const listener of listeners) {
        try {
          listener(state)
        } catch {
          /* one broken subscriber must not stop the others */
        }
      }
    }
    const store = {
      get: () => state,
      subscribe(fn) {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      setSession(sessionId) {
        if (typeof sessionId === 'string' && sessionId.length > 0 && sessionId !== state.sessionId) publish({ sessionId })
      },
      setLocale(locale) {
        if (typeof locale === 'string' && locale.length > 0 && locale !== state.locale) publish({ locale })
      },
      toggle() {
        publish({ open: !state.open })
      },
      close() {
        publish({ open: false })
      },
      openPage(path) {
        publish({ open: true, path })
      },
      select(path) {
        if (path !== state.path) publish({ path })
      },
    }

    /** Small shared button. */
    function button(label, onClick) {
      return React.createElement('button', { type: 'button', className: 'dsh-hp-btn', onClick }, label)
    }

    /** A compact control for the phone toolbar. */
    function iconButton(glyph, label, onClick) {
      return React.createElement('button', { type: 'button', className: 'dsh-hp-ibtn', 'aria-label': label, title: label, onClick }, glyph)
    }

    /** Secondary text block. */
    function note(text) {
      return React.createElement('div', { className: 'dsh-hp-note' }, text)
    }

    /** Read the workspace's pages. */
    async function listPages(sessionId) {
      const response = await fetch(`${ROUTE}/${encodeURIComponent(sessionId)}/__list`)
      const payload = await response.json()
      const files = Array.isArray(payload?.files)
        ? payload.files.map(file => ({ path: String(file.path), size: typeof file.size === 'number' ? file.size : 0 }))
        : []
      return {
        ok: payload?.ok === true,
        root: typeof payload?.root === 'string' ? payload.root : '',
        truncated: payload?.truncated === true,
        files,
        error: typeof payload?.error === 'string' ? payload.error : null,
      }
    }

    /** Read one page prepared for the framed document. */
    async function loadPage(sessionId, path) {
      const response = await fetch(`${ROUTE}/${encodeURIComponent(sessionId)}/__doc?path=${encodeURIComponent(path)}`)
      const payload = await response.json()
      if (payload?.ok !== true) {
        return { status: 'error', html: null, size: 0, path: '', dir: '', error: typeof payload?.error === 'string' ? payload.error : null }
      }
      return {
        status: 'ok',
        html: String(payload.html ?? ''),
        size: typeof payload.sizeBytes === 'number' ? payload.sizeBytes : 0,
        path: String(payload.path ?? path),
        dir: typeof payload.dir === 'string' ? payload.dir : '',
        error: null,
      }
    }

    /** The `HTML` toggle in the session header. */
    function HeaderButton(props) {
      const sessionId = props?.sessionId
      const [current, setCurrent] = React.useState(store.get())

      React.useEffect(() => {
        if (typeof sessionId === 'string' && sessionId.length > 0) store.setSession(sessionId)
        setCurrent({ ...store.get() })
        return store.subscribe(next => setCurrent({ ...next }))
      }, [sessionId])

      const t = strings(current.locale)
      return React.createElement('button', {
        type: 'button',
        className: 'dsh-hp-hbtn',
        'data-open': current.open ? 'true' : 'false',
        title: t.buttonTitle,
        onClick: () => store.toggle(),
      }, t.buttonLabel)
    }

    /** The page list plus the framed page. */
    function Viewer() {
      const [snapshot, setSnapshot] = React.useState(store.get())
      const narrow = useNarrow()
      const [pane, setPane] = React.useState('list')
      const [listing, setListing] = React.useState({ loading: true, files: [], root: '', truncated: false, error: null })
      const [doc, setDoc] = React.useState({ status: 'idle', html: null, size: 0, path: '', dir: '', error: null })
      const [generation, setGeneration] = React.useState(0)
      const [frameTick, setFrameTick] = React.useState(0)

      React.useEffect(() => store.subscribe(next => setSnapshot(next)), [])

      React.useEffect(() => {
        if (snapshot.open !== true || snapshot.sessionId === '') return undefined
        let alive = true
        setListing({ loading: true, files: [], root: '', truncated: false, error: null })
        listPages(snapshot.sessionId).then((result) => {
          if (!alive) return
          setListing({ loading: false, files: result.files, root: result.root, truncated: result.truncated, error: result.error })
          const wanted = store.get().path
          const stillThere = wanted !== null && result.files.some(file => file.path === wanted)
          if (!stillThere) store.select(result.files.length > 0 ? result.files[0].path : null)
        }).catch((error) => {
          if (!alive) return
          setListing({ loading: false, files: [], root: '', truncated: false, error: `${strings(store.get().locale).listError}: ${messageOf(error)}` })
        })
        return () => { alive = false }
      }, [snapshot.open, snapshot.sessionId, generation])

      React.useEffect(() => {
        if (snapshot.open !== true || snapshot.path === null || snapshot.sessionId === '') {
          setDoc({ status: 'idle', html: null, size: 0, path: '', dir: '', error: null })
          return undefined
        }
        let alive = true
        setDoc({ status: 'loading', html: null, size: 0, path: '', dir: '', error: null })
        loadPage(snapshot.sessionId, snapshot.path).then((next) => {
          if (alive) setDoc(next)
        }).catch((error) => {
          if (alive) setDoc({ status: 'error', html: null, size: 0, path: '', dir: '', error: `${strings(store.get().locale).loadError}: ${messageOf(error)}` })
        })
        return () => { alive = false }
      }, [snapshot.open, snapshot.path, snapshot.sessionId, frameTick])

      if (snapshot.open !== true) return null

      const t = strings(snapshot.locale)
      const selected = snapshot.path
      const known = selected === null ? undefined : listing.files.find(file => file.path === selected)
      const link = selected === null ? null : openUrlFor(snapshot.sessionId, selected, snapshot.locale)

      const toolbar = narrow
        ? React.createElement('div', { className: 'dsh-hp-bar' },
            selected === null ? null : iconButton('←', t.back, () => setPane('list')),
            React.createElement('span', { className: 'dsh-hp-title' }, selected === null ? t.panelTitle : nameOf(selected)),
            React.createElement('span', { className: 'dsh-hp-spacer' }),
            iconButton('⟳', t.reload, () => setFrameTick(tick => tick + 1)),
            link === null ? null : React.createElement('a', { className: 'dsh-hp-ibtn', href: link, target: '_blank', rel: 'noreferrer noopener', title: t.openTitle, 'aria-label': t.openTitle }, '↗'),
            iconButton('✕', t.closeTitle, () => store.close()),
          )
        : React.createElement('div', { className: 'dsh-hp-bar' },
            React.createElement('span', { className: 'dsh-hp-title' }, t.panelTitle),
            listing.root !== '' ? React.createElement('span', { className: 'dsh-hp-sub', title: listing.root }, listing.root) : null,
            React.createElement('span', { className: 'dsh-hp-spacer' }),
            known === undefined ? null : React.createElement('span', { className: 'dsh-hp-chip' }, formatSize(known.size)),
            button(t.refresh, () => setGeneration(value => value + 1)),
            selected === null ? null : button(t.reload, () => setFrameTick(tick => tick + 1)),
            link === null ? null : React.createElement('a', { className: 'dsh-hp-btn', href: link, target: '_blank', rel: 'noreferrer noopener', title: t.openTitle }, t.open),
            button(t.close, () => store.close()),
          )

      const list = React.createElement('div', { className: 'dsh-hp-list' },
        listing.files.length === 0
          ? note(listing.loading ? t.searching : t.emptyFiles)
          : listing.files.map(file => React.createElement('button', {
              key: file.path,
              type: 'button',
              className: 'dsh-hp-item',
              'data-active': file.path === selected ? 'true' : 'false',
              title: file.path,
              onClick: () => {
                store.select(file.path)
                if (narrow) setPane('doc')
              },
            }, file.path)),
      )

      let frame
      if (doc.status === 'error') frame = React.createElement('div', { className: 'dsh-hp-error' }, doc.error)
      else if (doc.status === 'ok' && doc.html !== null) {
        frame = React.createElement('iframe', {
          key: `page:${String(selected)}:${frameTick}`,
          className: 'dsh-hp-frame',
          title: `Preview of ${String(selected)}`,
          // No `sandbox`: the page runs in the GUI's origin, exactly as it does
          // opened in its own tab, which is what keeps its scripts and fetches
          // working. The content is a workspace file the session itself wrote.
          srcDoc: doc.html,
        })
      } else if (selected === null) frame = note(t.pickPage)
      else frame = note(t.loading)

      // The phone layout shows one pane at a time; the page pane only exists
      // once a page is selected.
      const showList = !narrow || pane === 'list' || selected === null
      const showDoc = !narrow || !showList

      return React.createElement('div', { className: 'dsh-hp-card', 'data-narrow': narrow ? 'true' : 'false' },
        React.createElement('div', { className: 'dsh-hp-root' },
          toolbar,
          listing.error !== null ? React.createElement('div', { className: 'dsh-hp-error' }, listing.error) : null,
          listing.truncated ? note(t.truncated) : null,
          React.createElement('div', { className: 'dsh-hp-body' },
            showList ? list : null,
            showDoc ? React.createElement('div', { className: 'dsh-hp-doc' }, frame) : null,
          ),
        ),
      )
    }

    /** The path a Tool card was called with (running or settled call). */
    function pathFromBlock(block) {
      let raw = null
      if (block !== null && typeof block === 'object') {
        if (block.kind === 'tool-result') {
          if (typeof block.call?.argsRaw === 'string') raw = block.call.argsRaw
        } else if (typeof block.argsRaw === 'string') {
          raw = block.argsRaw
        }
      }
      if (raw === null) return null
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.path === 'string' && parsed.path.length > 0) return parsed.path
      } catch {
        /* partial JSON: fall through to the tolerant scan */
      }
      const match = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)
      if (match === null) return null
      return match[1]
        .replace(/\\(["\\/])/g, '$1')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_whole, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    }

    /** The `html_preview` Tool card. */
    function PreviewCard(props) {
      const path = pathFromBlock(props?.block)
      const sessionId = props?.sessionId
      const [doc, setDoc] = React.useState({ status: 'idle', html: null, size: 0, path: '', dir: '', error: null })
      const [snapshot, setSnapshot] = React.useState(store.get())
      const [tick, setTick] = React.useState(0)

      React.useEffect(() => {
        if (typeof sessionId === 'string' && sessionId.length > 0) store.setSession(sessionId)
        setSnapshot({ ...store.get() })
        return store.subscribe(next => setSnapshot({ ...next }))
      }, [sessionId])

      React.useEffect(() => {
        if (path === null || typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        let alive = true
        setDoc({ status: 'loading', html: null, size: 0, path: '', dir: '', error: null })
        loadPage(sessionId, path).then((next) => {
          if (alive) setDoc(next)
        }).catch((error) => {
          if (alive) setDoc({ status: 'error', html: null, size: 0, path: '', dir: '', error: `${strings(store.get().locale).loadError}: ${messageOf(error)}` })
        })
        return () => { alive = false }
      }, [path, sessionId, tick])

      const t = strings(snapshot.locale)
      if (path === null) {
        return React.createElement('div', { className: 'dsh-hp-root' }, note(t.noPath))
      }

      const bar = React.createElement('div', { className: 'dsh-hp-bar' },
        React.createElement('span', { className: 'dsh-hp-title' }, t.cardTitle),
        React.createElement('span', { className: 'dsh-hp-sub', title: path }, path),
        doc.status === 'ok' ? React.createElement('span', { className: 'dsh-hp-chip' }, formatSize(doc.size)) : null,
        React.createElement('span', { className: 'dsh-hp-spacer' }),
        button(t.reload, () => setTick(value => value + 1)),
        button(t.open, () => store.openPage(path)),
      )

      let body
      if (doc.status === 'error') body = React.createElement('div', { className: 'dsh-hp-error' }, doc.error)
      else if (doc.status === 'ok' && doc.html !== null) {
        body = React.createElement('iframe', {
          key: `card:${path}:${tick}`,
          className: 'dsh-hp-frame',
          style: { height: '340px', flex: '0 0 auto' },
          title: `Preview of ${path}`,
          srcDoc: doc.html,
        })
      } else body = note(t.loading)

      return React.createElement('div', { className: 'dsh-hp-root' }, bar, body)
    }

    /** Services this client half requires. */
    exports.inject = ['slots', 'locale']

    /**
     * Register the three seats and follow the locale preference.
     * @param ctx - client context carrying the slot registry and the locale service.
     */
    exports.apply = function apply(ctx) {
      ctx.effect(() => {
        const el = document.createElement('style')
        el.dataset.plugin = 'dsh-html-preview'
        el.textContent = CSS
        document.head.append(el)
        return () => el.remove()
      }, 'html-preview: stylesheet')

      ctx.effect(() => {
        const sync = () => store.setLocale(ctx.locale.getLocale().active)
        sync()
        return ctx.locale.subscribe(sync)
      }, 'html-preview: locale preference')

      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
        { name: 'conversation.session.header.actions', id: 'html-preview-open', order: 30 },
        HeaderButton,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'html-preview-viewer', order: 100 },
        Viewer,
      ))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
        { name: 'tool.call.toolview', key: 'html_preview' },
        PreviewCard,
      ))
    }

    return module.exports
  },
})
