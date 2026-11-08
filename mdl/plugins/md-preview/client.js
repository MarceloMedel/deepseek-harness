/**
 * dsh-md-preview — browser half.
 *
 * Three seats, one shared store:
 *   - `conversation.session.header.actions`: the `MD` button that toggles the reader.
 *   - `shell.overlay`: the reader panel — a folder tree of the workspace's
 *     Markdown files, the selected document, and its outline.
 *   - `tool.call.toolview` key `md_preview`: the card the agent's call renders into.
 *
 * Documents render through `MarkdownText` from the platform module table, so a
 * preview is the conversation's own renderer — GFM, highlighted code and TeX —
 * without this bundle carrying a Markdown engine. The host half serves the text
 * and the assets a document references; this half rewrites relative image
 * destinations into route URLs (the renderer only accepts absolute HTTP(S)
 * images) and intercepts relative links so another document opens in place.
 *
 * Two layouts share one state machine. Width is the only difference: below
 * `NARROW_WIDTH` the panel takes the viewport and shows one pane at a time —
 * the tree, then the document with a back button and an outline sheet — because
 * three columns on a phone leave no readable column. Wider than that keeps the
 * tree, the outline and the document side by side.
 */

window.__ModuleLoader__.load({
  id: 'dsh-md-preview',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const MarkdownText = primitives.MarkdownText
    const writeClipboard = primitives.writeClipboard

    /** Route prefix owned by the host half. */
    const ROUTE = '/md-viewer'
    /** Extensions the reader opens in place when a document links to them. */
    const DOC_EXT = /\.(md|markdown|mdown|mkd)$/i
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
    /** How long a copy result stays visible. */
    const COPIED_MS = 1400

    /** Product copy, English source of truth plus Spanish (MDL-LOCALE-01). */
    const STRINGS = {
      en: {
        buttonLabel: 'MD',
        buttonTitle: 'Reader for the workspace Markdown files',
        panelTitle: 'Markdown reader',
        pickDoc: 'Choose a document from the list.',
        emptyFiles: 'No Markdown files in this workspace.',
        searching: 'Looking for documents…',
        loading: 'Rendering…',
        refresh: 'Refresh',
        copy: 'Copy',
        copied: 'Copied',
        copyFailed: 'Copy failed',
        download: 'Download',
        close: 'Close',
        back: 'Back to the list',
        toc: 'Outline',
        openInViewer: 'Open in the reader',
        cardTitle: 'Markdown',
        noPath: 'The reader could not find a path in that call.',
        listError: 'The workspace could not be read',
      },
      es: {
        buttonLabel: 'MD',
        buttonTitle: 'Visor de los archivos Markdown del workspace',
        panelTitle: 'Visor Markdown',
        pickDoc: 'Elige un documento de la lista.',
        emptyFiles: 'No hay archivos Markdown en este workspace.',
        searching: 'Buscando documentos…',
        loading: 'Renderizando…',
        refresh: 'Actualizar',
        copy: 'Copiar',
        copied: 'Copiado',
        copyFailed: 'No se pudo copiar',
        download: 'Descargar',
        close: 'Cerrar',
        back: 'Volver a la lista',
        toc: 'Índice',
        openInViewer: 'Abrir en el visor',
        cardTitle: 'Markdown',
        noPath: 'El visor no encontró una ruta en esa llamada.',
        listError: 'No pude leer el workspace',
      },
    }

    /** Copy for one locale, falling back to English for an unpublished id. */
    function strings(locale) {
      return STRINGS[locale] ?? STRINGS.en
    }

    /** Whether the viewport is phone-sized. */
    function isNarrow() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      return window.matchMedia(`(max-width: ${String(NARROW_WIDTH)}px)`).matches
    }

    const CSS = [
      '.dsh-mdp-hbtn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:7px;padding:3px 9px;font-size:12px;font-weight:600;line-height:1.5;cursor:pointer;display:inline-flex;align-items:center;gap:4px}',
      '.dsh-mdp-hbtn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-mdp-hbtn[data-open="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-mdp-card{pointer-events:auto;position:fixed;right:24px;bottom:24px;width:min(1120px,94vw);height:min(780px,86vh);display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 24px 60px rgba(0,0,0,.45);z-index:9999}',
      '.dsh-mdp-root{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);min-width:0}',
      '.dsh-mdp-card .dsh-mdp-root{flex:1 1 auto;min-height:0}',
      '.dsh-mdp-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsh-mdp-title{font-weight:600;letter-spacing:-.01em;white-space:nowrap}',
      '.dsh-mdp-sub{color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:38ch}',
      '.dsh-mdp-spacer{flex:1 1 auto}',
      '.dsh-mdp-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 9px;font-size:12px;line-height:1.5;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}',
      '.dsh-mdp-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-mdp-btn[data-on="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-mdp-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-mdp-ibtn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:8px;min-width:36px;height:34px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;font-size:12px}',
      '.dsh-mdp-ibtn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-mdp-ibtn[data-on="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-mdp-ibtn[data-state="ok"]{color:var(--dsw-alias-brand-primary)}',
      '.dsh-mdp-ibtn[data-state="failed"]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-mdp-ibtn:disabled{opacity:.45;cursor:default}',
      '.dsh-mdp-icon{width:16px;height:16px;flex:0 0 auto;display:block}',
      '.dsh-mdp-body{display:flex;gap:10px;min-width:0;flex:1 1 auto;min-height:0}',
      '.dsh-mdp-side{width:248px;flex:0 0 248px;display:flex;flex-direction:column;min-height:0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:4px}',
      '.dsh-mdp-list{overflow:auto;min-height:0;flex:1 1 auto;overscroll-behavior:contain}',
      '.dsh-mdp-item{display:flex;align-items:center;gap:5px;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:6px 8px;border-radius:6px;font:inherit;font-size:12.5px;line-height:1.4;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-mdp-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-mdp-item[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsh-mdp-dir{color:var(--dsw-alias-label-secondary);font-weight:600}',
      '.dsh-mdp-dir:hover{color:inherit}',
      '.dsh-mdp-dir[data-open="true"]{color:inherit}',
      '.dsh-mdp-caret{width:12px;height:12px;flex:0 0 auto;transition:transform .12s ease;opacity:.8}',
      '.dsh-mdp-dir[data-open="true"] .dsh-mdp-caret{transform:rotate(90deg)}',
      '.dsh-mdp-folder{width:13px;height:13px;flex:0 0 auto;opacity:.65}',
      '.dsh-mdp-toc{width:206px;flex:0 0 206px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:4px;min-height:0}',
      '.dsh-mdp-tocitem{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:3px 8px;border-radius:6px;font:inherit;font-size:11.5px;line-height:1.45;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-mdp-tocitem:hover{background:var(--dsw-alias-bg-layer-2);color:inherit}',
      '.dsh-mdp-tocitem[data-active="true"]{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsh-mdp-tocitem[data-level="2"]{padding-left:18px}',
      '.dsh-mdp-tocitem[data-level="3"]{padding-left:28px}',
      '.dsh-mdp-tocitem[data-level="4"]{padding-left:38px}',
      '.dsh-mdp-tocitem[data-level="5"]{padding-left:48px}',
      '.dsh-mdp-tocitem[data-level="6"]{padding-left:58px}',
      '.dsh-mdp-docwrap{position:relative;flex:1 1 auto;min-width:0;min-height:0;display:flex}',
      // `position:relative` makes this element the headings' offsetParent, so the
      // outline can compare `offsetTop` against `scrollTop` directly.
      '.dsh-mdp-doc{position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:18px 26px}',
      '.dsh-mdp-page{max-width:860px;margin:0 auto;font-size:14px;line-height:1.62}',
      '.dsh-mdp-page img{max-width:100%;height:auto}',
      '.dsh-mdp-sheet{position:absolute;top:0;left:0;right:0;max-height:62%;overflow:auto;z-index:2;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 40px rgba(0,0,0,.4);padding:6px}',
      '.dsh-mdp-sheet .dsh-mdp-tocitem{padding:8px 10px;font-size:13px}',
      '.dsh-mdp-empty{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6;padding:12px;max-width:52ch}',
      '.dsh-mdp-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.6;padding:8px 2px}',
      '.dsh-mdp-chip{font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 8px;white-space:nowrap}',
      '.dsh-mdp-carddoc{max-height:340px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:12px 16px}',
      // Phone layout: the panel takes the viewport and shows one pane at a time.
      `.dsh-mdp-card[data-narrow="true"]{right:0;bottom:0;left:0;top:0;width:auto;height:auto;border-radius:0;border:0;padding:calc(${String(MENU_RESERVED)}px + env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px));box-shadow:none}`,
      '.dsh-mdp-card[data-narrow="true"] .dsh-mdp-body{flex-direction:column;gap:8px}',
      '.dsh-mdp-card[data-narrow="true"] .dsh-mdp-side{width:auto;flex:1 1 auto;min-height:0}',
      '.dsh-mdp-card[data-narrow="true"] .dsh-mdp-item{padding:9px 10px;font-size:14px}',
      '.dsh-mdp-card[data-narrow="true"] .dsh-mdp-doc{padding:14px 16px}',
      '.dsh-mdp-card[data-narrow="true"] .dsh-mdp-page{font-size:15px;line-height:1.66}',
      '.dsh-mdp-mbar{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsh-mdp-mtitle{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dsh-mdp-mname{font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mdp-mpath{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mdp-mactions{display:flex;align-items:center;gap:6px;flex:0 0 auto}',
    ].join('\n')

    /** Inline SVG path set, drawn with `currentColor` so it follows the theme. */
    const ICONS = {
      back: 'M15 18l-6-6 6-6',
      close: 'M6 6l12 12M18 6L6 18',
      caret: 'M9 18l6-6-6-6',
      folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      outline: 'M4 6h16M4 12h16M4 18h10',
      copy: 'M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
      check: 'M20 6L9 17l-5-5',
      download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
      refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
    }

    /** One stroked icon. */
    function icon(name, className) {
      return React.createElement('svg', {
        className: className ?? 'dsh-mdp-icon',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, React.createElement('path', { d: ICONS[name] }))
    }

    /** Encode each path segment for a URL. */
    function encodeRel(rel) {
      return String(rel).split('/').map(part => encodeURIComponent(part)).join('/')
    }

    /** Absolute URL of one workspace path under the host route. */
    function assetUrl(sessionId, rel) {
      return `${location.origin}${ROUTE}/${encodeURIComponent(String(sessionId))}/${encodeRel(rel)}`
    }

    /** Whether one link destination addresses something outside the workspace. */
    function isAbsoluteDest(dest) {
      return dest.startsWith('#') || dest.startsWith('/') || dest.startsWith('//')
        || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(dest)
    }

    /** Split a link destination into its path body and its `?query`/`#fragment` suffix. */
    function splitDest(dest) {
      const cut = dest.search(/[?#]/)
      return cut < 0
        ? { body: dest, suffix: '' }
        : { body: dest.slice(0, cut), suffix: dest.slice(cut) }
    }

    /** Resolve a document-relative path against its directory, or null when it leaves the workspace. */
    function resolveRel(baseDir, rel) {
      const stack = baseDir === '' ? [] : String(baseDir).split('/')
      for (const part of String(rel).split('/')) {
        if (part === '' || part === '.') continue
        if (part === '..') {
          if (stack.length === 0) return null
          stack.pop()
          continue
        }
        stack.push(part)
      }
      return stack.length === 0 ? null : stack.join('/')
    }

    /**
     * Point the document's relative image destinations at the host route.
     *
     * `MarkdownText` renders an image only for an absolute HTTP(S) URL, so a
     * document that references `img/diagram.png` would otherwise show its alt
     * text. Fenced code is skipped so a code sample that looks like an image
     * is never rewritten.
     * @param text - the document source.
     * @param dir - directory of the document inside the workspace ('' at the root).
     * @param sessionId - session whose workspace serves the assets.
     * @returns the source with relative image destinations made absolute.
     */
    function rewriteAssets(text, dir, sessionId) {
      let fence = null
      return String(text).split('\n').map((line) => {
        const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
        if (fence !== null) {
          if (marker !== null && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
          return line
        }
        if (marker !== null) {
          fence = marker[1]
          return line
        }
        return line.replace(/(!\[[^\]\n]*\]\()([^)\s]+)((?:\s+"[^"\n]*")?\))/g, (whole, lead, dest, tail) => {
          if (isAbsoluteDest(dest) || /^data:/.test(dest)) return whole
          const { body, suffix } = splitDest(dest)
          const resolved = resolveRel(dir, body)
          if (resolved === null) return whole
          return `${lead}${assetUrl(sessionId, resolved)}${suffix}${tail}`
        })
      }).join('\n')
    }

    /** Strip inline Markdown markers so an outline entry reads as plain text. */
    function plainInline(text) {
      return String(text)
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    /**
     * The document's headings, in order, skipping fenced code.
     * @param text - the document source.
     * @returns one entry per ATX heading.
     */
    function headingsOf(text) {
      const out = []
      let fence = null
      for (const line of String(text).split('\n')) {
        const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
        if (fence !== null) {
          if (marker !== null && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
          continue
        }
        if (marker !== null) {
          fence = marker[1]
          continue
        }
        const heading = /^\s{0,3}(#{1,6})\s+(.*\S)\s*#*\s*$/.exec(line)
        if (heading === null) continue
        const label = plainInline(heading[2])
        if (label.length > 0) out.push({ level: heading[1].length, label })
      }
      return out
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

    /** Last path segment of a workspace path. */
    function baseName(path) {
      const cut = String(path).lastIndexOf('/')
      return cut < 0 ? String(path) : String(path).slice(cut + 1)
    }

    /** Directory segments of one path, outermost first. */
    function dirsOf(path) {
      const parts = String(path).split('/')
      parts.pop()
      const out = []
      let prefix = ''
      for (const part of parts) {
        prefix = prefix === '' ? part : `${prefix}/${part}`
        out.push(prefix)
      }
      return out
    }

    /**
     * Group the flat listing into folders.
     *
     * The listing is ordered so a document never appears before the folder that
     * holds it; the client only has to nest it.
     * @param files - the workspace listing.
     * @returns the root node of the folder tree.
     */
    function buildTree(files) {
      const root = { name: '', path: '', dirs: new Map(), files: [] }
      for (const file of files) {
        const parts = String(file.path).split('/')
        let node = root
        let prefix = ''
        for (const part of parts.slice(0, -1)) {
          prefix = prefix === '' ? part : `${prefix}/${part}`
          let next = node.dirs.get(part)
          if (next === undefined) {
            next = { name: part, path: prefix, dirs: new Map(), files: [] }
            node.dirs.set(part, next)
          }
          node = next
        }
        node.files.push(file)
      }
      return root
    }

    /** Stable scroll-memory key for one reader target. */
    function keyOf(target) {
      if (target === null || target === undefined) return ''
      return `file:${target.path}`
    }

    // Shared in-memory reader state: which workspace, whether it is open, what is selected.
    const listeners = new Set()
    /** Reading positions, kept per document while the page lives. */
    const scrollMemo = new Map()
    let state = { sessionId: '', open: false, target: null, locale: 'en' }

    /** Replace the state and notify every subscriber. */
    function publish(patch) {
      const next = { ...state }
      for (const key of Object.keys(patch)) next[key] = patch[key]
      state = next
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
      openFile(path) {
        publish({ open: true, target: { kind: 'file', path: String(path) } })
      },
    }

    /** Read the workspace listing. */
    async function listWorkspace(sessionId) {
      const response = await fetch(`${ROUTE}/${encodeURIComponent(sessionId)}/__list`)
      const payload = await response.json()
      const files = Array.isArray(payload.files)
        ? payload.files.map(file => ({ path: String(file.path), size: typeof file.size === 'number' ? file.size : 0 }))
        : []
      return {
        ok: payload.ok === true,
        root: typeof payload.root === 'string' ? payload.root : '',
        truncated: payload.truncated === true,
        files,
        error: typeof payload.error === 'string' ? payload.error : null,
      }
    }

    /** Read one document. */
    async function loadDocument(sessionId, path) {
      const response = await fetch(`${ROUTE}/${encodeURIComponent(sessionId)}/__doc?path=${encodeURIComponent(path)}`)
      const payload = await response.json()
      if (payload.ok !== true) {
        return { status: 'error', text: null, title: '', dir: '', size: 0, path: '', error: typeof payload.error === 'string' ? payload.error : 'The document could not be read.' }
      }
      return {
        status: 'ok',
        text: String(payload.text ?? ''),
        title: typeof payload.title === 'string' ? payload.title : '',
        dir: typeof payload.dir === 'string' ? payload.dir : '',
        size: typeof payload.sizeBytes === 'number' ? payload.sizeBytes : 0,
        path: typeof payload.path === 'string' ? payload.path : '',
        error: null,
      }
    }

    /** A labelled desktop toolbar button. */
    function button(label, onClick, extra) {
      return React.createElement('button', { type: 'button', className: 'dsh-mdp-btn', onClick, ...extra }, label)
    }

    /** A compact icon button carrying its label as tooltip and accessible name. */
    function iconButton(name, label, onClick, extra) {
      return React.createElement('button', {
        type: 'button',
        className: 'dsh-mdp-ibtn',
        title: label,
        'aria-label': label,
        onClick,
        ...extra,
      }, icon(name))
    }

    /** Secondary text block. */
    function note(text) {
      return React.createElement('div', { className: 'dsh-mdp-empty' }, text)
    }

    /** Save text as a file from the browser. */
    function downloadText(text, filename) {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }

    /** The `MD` toggle in the session header. */
    function HeaderButton(props) {
      const sessionId = props?.sessionId
      const [snapshot, setSnapshot] = React.useState(store.get())

      React.useEffect(() => {
        if (typeof sessionId === 'string' && sessionId.length > 0) store.setSession(sessionId)
        setSnapshot({ ...store.get() })
        return store.subscribe(next => setSnapshot({ ...next }))
      }, [sessionId])

      const t = strings(snapshot.locale)
      return React.createElement('button', {
        type: 'button',
        className: 'dsh-mdp-hbtn',
        'data-open': snapshot.open ? 'true' : 'false',
        title: t.buttonTitle,
        onClick: () => store.toggle(),
      }, t.buttonLabel)
    }

    /**
     * Flatten one folder into list rows, folders collapsed until the user opens
     * them. `out` collects the rows so nesting needs no fragment keys.
     * @param node - the folder to render.
     * @param depth - indentation level.
     * @param view - selection, expansion and callbacks.
     * @param out - the row accumulator.
     */
    function renderTree(node, depth, view, out) {
      for (const file of node.files) {
        out.push(React.createElement('button', {
          key: `f:${file.path}`,
          type: 'button',
          className: 'dsh-mdp-item',
          'data-active': file.path === view.selected ? 'true' : 'false',
          title: file.path,
          style: { paddingLeft: `${String(10 + depth * 14)}px` },
          onClick: () => view.onSelect(file.path),
        }, baseName(file.path)))
      }
      for (const dir of node.dirs.values()) {
        const open = view.expanded.has(dir.path)
        out.push(React.createElement('button', {
          key: `d:${dir.path}`,
          type: 'button',
          className: 'dsh-mdp-item dsh-mdp-dir',
          'data-open': open ? 'true' : 'false',
          'aria-expanded': open ? 'true' : 'false',
          title: dir.path,
          style: { paddingLeft: `${String(8 + depth * 14)}px` },
          onClick: () => view.onToggle(dir.path),
        },
        React.createElement('svg', {
          className: 'dsh-mdp-caret',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '3',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        }, React.createElement('path', { d: ICONS.caret })),
        icon('folder', 'dsh-mdp-folder'),
        dir.name,
        ))
        if (open) renderTree(dir, depth + 1, view, out)
      }
    }

    /** The reader panel. */
    function Reader() {
      const [current, setCurrent] = React.useState(store.get())
      const [narrow, setNarrow] = React.useState(isNarrow)
      const [listing, setListing] = React.useState({ loading: false, files: [], root: '', truncated: false, error: null })
      const [doc, setDoc] = React.useState({ status: 'idle', text: null, title: '', dir: '', size: 0, path: '', error: null })
      const [generation, setGeneration] = React.useState(0)
      const [expanded, setExpanded] = React.useState(() => new Set())
      const [pane, setPane] = React.useState('list')
      const [outlineOpen, setOutlineOpen] = React.useState(() => !isNarrow())
      const [copyState, setCopyState] = React.useState(null)
      const [activeHeading, setActiveHeading] = React.useState(0)
      const scrollRef = React.useRef(null)
      const copyTimer = React.useRef(null)
      const lastOpened = React.useRef('')

      React.useEffect(() => {
        setCurrent({ ...store.get() })
        return store.subscribe(next => setCurrent({ ...next }))
      }, [])

      React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const query = window.matchMedia(`(max-width: ${String(NARROW_WIDTH)}px)`)
        const sync = () => setNarrow(query.matches)
        sync()
        if (typeof query.addEventListener === 'function') {
          query.addEventListener('change', sync)
          return () => query.removeEventListener('change', sync)
        }
        /* Older engines only offer the deprecated listener API. */
        query.addListener(sync)
        return () => query.removeListener(sync)
      }, [])

      React.useEffect(() => () => {
        if (copyTimer.current !== null) clearTimeout(copyTimer.current)
      }, [])

      // Opening the panel resumes the document that was open, and starts on the
      // tree when nothing is selected yet.
      React.useEffect(() => {
        if (current.open !== true) return
        setPane(keyOf(store.get().target) === '' ? 'list' : 'doc')
      }, [current.open])

      const target = current.target
      const targetKey = keyOf(target)

      // Opening a document switches the phone layout to the document pane and
      // reveals the folder that holds it.
      React.useEffect(() => {
        if (targetKey === '' || targetKey === lastOpened.current) return
        lastOpened.current = targetKey
        setPane('doc')
        if (target !== null && target.kind === 'file') {
          const dirs = dirsOf(target.path)
          setExpanded(previous => {
            if (dirs.every(dir => previous.has(dir))) return previous
            const next = new Set(previous)
            for (const dir of dirs) next.add(dir)
            return next
          })
        }
      }, [targetKey])

      React.useEffect(() => {
        if (current.open !== true || current.sessionId === '') return undefined
        let alive = true
        setListing(previous => ({ ...previous, loading: true, error: null }))
        listWorkspace(current.sessionId).then((result) => {
          if (!alive) return
          setListing({ loading: false, files: result.files, root: result.root, truncated: result.truncated, error: result.error })
        }).catch((error) => {
          if (!alive) return
          setListing({ loading: false, files: [], root: '', truncated: false, error: `${strings(store.get().locale).listError}: ${messageOf(error)}` })
        })
        return () => { alive = false }
      }, [current.open, current.sessionId, generation])

      React.useEffect(() => {
        if (current.open !== true || target === null || current.sessionId === '') {
          setDoc({ status: 'idle', text: null, title: '', dir: '', size: 0, path: '', error: null })
          return undefined
        }
        let alive = true
        setDoc({ status: 'loading', text: null, title: '', dir: '', size: 0, path: '', error: null })
        loadDocument(current.sessionId, target.path).then((next) => {
          if (alive) setDoc(next)
        }).catch((error) => {
          if (alive) setDoc({ status: 'error', text: null, title: '', dir: '', size: 0, path: '', error: messageOf(error) })
        })
        return () => { alive = false }
      }, [current.open, current.sessionId, targetKey, generation])

      React.useEffect(() => {
        const el = scrollRef.current
        if (el === null || doc.status !== 'ok') return
        el.scrollTop = scrollMemo.get(targetKey) ?? 0
        setActiveHeading(0)
      }, [targetKey, doc.status, doc.text])

      if (current.open !== true) return null

      const t = strings(current.locale)
      const headings = doc.status === 'ok' && doc.text !== null ? headingsOf(doc.text) : []
      const selected = target !== null ? target.path : null
      const tree = buildTree(listing.files)
      const rows = []
      renderTree(tree, 0, {
        selected,
        expanded,
        onSelect: path => store.openFile(path),
        onToggle: (path) => {
          setExpanded((previous) => {
            const next = new Set(previous)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
          })
        },
      }, rows)

      /** Keep the reading position and the active outline entry in step with the viewport. */
      const onScroll = () => {
        const el = scrollRef.current
        if (el === null) return
        scrollMemo.set(targetKey, el.scrollTop)
        const nodes = el.querySelectorAll('h1,h2,h3,h4,h5,h6')
        let next = 0
        for (let index = 0; index < nodes.length; index += 1) {
          if (nodes[index].offsetTop <= el.scrollTop + 32) next = index
          else break
        }
        setActiveHeading(previous => (previous === next ? previous : next))
      }

      /** Open a relative link in place instead of navigating away from the application. */
      const onClickDoc = (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const node = event.target
        if (node === null || node === undefined || typeof node.closest !== 'function') return
        const anchor = node.closest('a[href]')
        if (anchor === null) return
        const href = anchor.getAttribute('href') ?? ''
        if (href === '' || isAbsoluteDest(href)) return
        const { body } = splitDest(href)
        const resolved = resolveRel(doc.dir, body)
        if (resolved === null) return
        event.preventDefault()
        if (DOC_EXT.test(resolved)) store.openFile(resolved)
        else window.open(assetUrl(current.sessionId, resolved), '_blank', 'noopener,noreferrer')
      }

      /** Copy the open document, reporting the outcome in the toolbar. */
      const onCopy = async () => {
        if (doc.status !== 'ok' || doc.text === null) return
        const done = await writeClipboard(doc.text)
        setCopyState(done ? 'ok' : 'failed')
        if (copyTimer.current !== null) clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => setCopyState(null), COPIED_MS)
      }

      /** Save the open document under its own file name. */
      const onDownload = () => {
        if (doc.status !== 'ok' || doc.text === null) return
        downloadText(doc.text, doc.path !== '' ? baseName(doc.path) : 'document.md')
      }

      /** Jump the document to one outline entry. */
      const jumpTo = (index) => {
        const el = scrollRef.current
        if (el === null) return
        const node = el.querySelectorAll('h1,h2,h3,h4,h5,h6')[index]
        if (node === undefined) return
        el.scrollTop = Math.max(0, node.offsetTop - 12)
        if (narrow) setOutlineOpen(false)
      }

      const outlineEntries = headings.map((heading, index) => React.createElement('button', {
        key: `${String(index)}:${heading.label}`,
        type: 'button',
        className: 'dsh-mdp-tocitem',
        'data-active': index === activeHeading ? 'true' : 'false',
        'data-level': String(heading.level),
        title: heading.label,
        onClick: () => jumpTo(index),
      }, heading.label))

      let docBody
      if (doc.status === 'error') docBody = React.createElement('div', { className: 'dsh-mdp-error' }, doc.error)
      else if (doc.status === 'ok' && doc.text !== null) {
        docBody = React.createElement('div', { className: 'dsh-mdp-doc', ref: scrollRef, onScroll, onClick: onClickDoc },
          React.createElement('div', { className: 'dsh-mdp-page' },
            React.createElement(MarkdownText, { text: rewriteAssets(doc.text, doc.dir, current.sessionId) }),
          ),
        )
      } else docBody = note(target === null ? t.pickDoc : t.loading)

      const treePane = React.createElement('div', { className: 'dsh-mdp-side' },
        React.createElement('div', { className: 'dsh-mdp-list' },
          listing.files.length === 0
            ? React.createElement('div', { className: 'dsh-mdp-empty' }, listing.loading ? t.searching : t.emptyFiles)
            : rows,
        ),
      )

      const outlineList = React.createElement('div', { className: 'dsh-mdp-toc' }, outlineEntries)

      const copyLabel = copyState === 'ok' ? `${t.copied} ✓` : copyState === 'failed' ? t.copyFailed : t.copy

      const desktopBar = React.createElement('div', { className: 'dsh-mdp-bar' },
        React.createElement('span', { className: 'dsh-mdp-title' }, t.panelTitle),
        doc.status === 'ok' && doc.path !== '' ? React.createElement('span', { className: 'dsh-mdp-sub', title: doc.path }, doc.path) : null,
        listing.root !== '' ? React.createElement('span', { className: 'dsh-mdp-sub', title: listing.root }, listing.root) : null,
        doc.status === 'ok' ? React.createElement('span', { className: 'dsh-mdp-chip' }, formatSize(doc.size)) : null,
        React.createElement('span', { className: 'dsh-mdp-spacer' }),
        button(t.toc, () => setOutlineOpen(value => !value), { 'data-on': outlineOpen ? 'true' : 'false', disabled: headings.length === 0 }),
        button(copyLabel, onCopy),
        button(t.download, onDownload),
        button(t.refresh, () => setGeneration(value => value + 1)),
        button(t.close, () => store.close()),
      )

      const mobileListBar = React.createElement('div', { className: 'dsh-mdp-mbar' },
        React.createElement('div', { className: 'dsh-mdp-mtitle' },
          React.createElement('span', { className: 'dsh-mdp-mname' }, t.panelTitle),
          listing.root !== '' ? React.createElement('span', { className: 'dsh-mdp-mpath', title: listing.root }, listing.root) : null,
        ),
        React.createElement('div', { className: 'dsh-mdp-mactions' },
          iconButton('refresh', t.refresh, () => setGeneration(value => value + 1)),
          iconButton('close', t.close, () => store.close()),
        ),
      )

      const mobileDocBar = React.createElement('div', { className: 'dsh-mdp-mbar' },
        iconButton('back', t.back, () => { setOutlineOpen(false); setPane('list') }),
        React.createElement('div', { className: 'dsh-mdp-mtitle' },
          React.createElement('span', { className: 'dsh-mdp-mname', title: doc.path }, doc.path !== '' ? baseName(doc.path) : (doc.title !== '' ? doc.title : t.panelTitle)),
          React.createElement('span', { className: 'dsh-mdp-mpath', title: doc.path !== '' ? doc.path : doc.title }, doc.status === 'ok' ? formatSize(doc.size) : listing.root),
        ),
        React.createElement('div', { className: 'dsh-mdp-mactions' },
          iconButton('outline', t.toc, () => setOutlineOpen(value => !value), { 'data-on': outlineOpen ? 'true' : 'false', disabled: headings.length === 0 }),
          iconButton(copyState === 'ok' ? 'check' : 'copy', copyLabel, onCopy, copyState === null ? undefined : { 'data-state': copyState }),
          iconButton('download', t.download, onDownload),
          iconButton('close', t.close, () => store.close()),
        ),
      )

      const cardProps = {
        className: 'dsh-mdp-card',
        'data-narrow': narrow ? 'true' : 'false',
      }

      if (narrow) {
        const showingDoc = pane === 'doc'
        return React.createElement('div', cardProps,
          React.createElement('div', { className: 'dsh-mdp-root' },
            showingDoc ? mobileDocBar : mobileListBar,
            listing.error !== null && !showingDoc ? React.createElement('div', { className: 'dsh-mdp-error' }, listing.error) : null,
            React.createElement('div', { className: 'dsh-mdp-body' },
              showingDoc
                ? React.createElement('div', { className: 'dsh-mdp-docwrap' },
                    outlineOpen && headings.length > 0 ? React.createElement('div', { className: 'dsh-mdp-sheet' }, outlineEntries) : null,
                    docBody,
                  )
                : treePane,
            ),
          ),
        )
      }

      return React.createElement('div', cardProps,
        React.createElement('div', { className: 'dsh-mdp-root' },
          desktopBar,
          listing.error !== null ? React.createElement('div', { className: 'dsh-mdp-error' }, listing.error) : null,
          React.createElement('div', { className: 'dsh-mdp-body' },
            treePane,
            outlineOpen && headings.length > 0 ? outlineList : null,
            React.createElement('div', { className: 'dsh-mdp-docwrap' }, docBody),
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
        /* partial JSON while the call streams: fall through to the tolerant scan */
      }
      const match = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)
      if (match === null) return null
      return match[1]
        .replace(/\\(["\\/])/g, '$1')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_whole, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    }

    /** The `md_preview` Tool card. */
    function ToolCard(props) {
      const path = pathFromBlock(props?.block)
      const sessionId = props?.sessionId
      const [doc, setDoc] = React.useState({ status: 'idle', text: null, title: '', dir: '', size: 0, path: '', error: null })
      const [snapshot, setSnapshot] = React.useState(store.get())

      React.useEffect(() => {
        if (typeof sessionId === 'string' && sessionId.length > 0) store.setSession(sessionId)
        setSnapshot({ ...store.get() })
        return store.subscribe(next => setSnapshot({ ...next }))
      }, [sessionId])

      React.useEffect(() => {
        if (path === null || typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        let alive = true
        setDoc({ status: 'loading', text: null, title: '', dir: '', size: 0, path: '', error: null })
        loadDocument(sessionId, path).then((next) => {
          if (alive) setDoc(next)
        }).catch((error) => {
          if (alive) setDoc({ status: 'error', text: null, title: '', dir: '', size: 0, path: '', error: messageOf(error) })
        })
        return () => { alive = false }
      }, [path, sessionId])

      const t = strings(snapshot.locale)
      if (path === null) {
        return React.createElement('div', { className: 'dsh-mdp-root' }, note(t.noPath))
      }

      const bar = React.createElement('div', { className: 'dsh-mdp-bar' },
        React.createElement('span', { className: 'dsh-mdp-title' }, t.cardTitle),
        React.createElement('span', { className: 'dsh-mdp-sub', title: path }, path),
        doc.status === 'ok' ? React.createElement('span', { className: 'dsh-mdp-chip' }, formatSize(doc.size)) : null,
        React.createElement('span', { className: 'dsh-mdp-spacer' }),
        button(t.openInViewer, () => store.openFile(path)),
      )

      let body
      if (doc.status === 'error') body = React.createElement('div', { className: 'dsh-mdp-error' }, doc.error)
      else if (doc.status === 'ok' && doc.text !== null) {
        body = React.createElement('div', { className: 'dsh-mdp-carddoc' },
          React.createElement(MarkdownText, { text: rewriteAssets(doc.text, doc.dir, String(sessionId)) }),
        )
      } else body = note(t.loading)

      return React.createElement('div', { className: 'dsh-mdp-root' }, bar, body)
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
        el.dataset.plugin = 'dsh-md-preview'
        el.textContent = CSS
        document.head.append(el)
        return () => el.remove()
      }, 'md-preview: stylesheet')

      ctx.effect(() => {
        const sync = () => store.setLocale(ctx.locale.getLocale().active)
        sync()
        return ctx.locale.subscribe(sync)
      }, 'md-preview: locale preference')

      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
        { name: 'conversation.session.header.actions', id: 'md-preview-open', order: 31 },
        HeaderButton,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'md-preview-reader', order: 101 },
        Reader,
      ))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
        { name: 'tool.call.toolview', key: 'md_preview' },
        ToolCard,
      ))
    }

    return module.exports
  },
})
