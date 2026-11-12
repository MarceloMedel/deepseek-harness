/**
 * dsh-shell-panel — browser half.
 *
 * One seat, `shell.overlay`: a floating `>_` button that opens a drawer, and the
 * drawer itself — the header with the directory and sandbox mode the host
 * resolved for this session, the scrollback of commands and their output, and
 * the input row.
 *
 * The panel owns only what the browser knows: the scrollback of this page, the
 * command history of this page, and which run is being polled. The tracked
 * directory and the sandbox mode are the host's facts and arrive with every
 * answer, so closing the drawer, switching sessions, or reloading never invents
 * a directory: the header always prints what the host just resolved.
 *
 * Each command is one execution, so `cd` moves the directory for the NEXT
 * command rather than inside a shell that outlives it. That is the difference
 * the header's directory line exists to make visible.
 */

window.__ModuleLoader__.load({
  id: 'dsh-shell-panel',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    /** Route prefix owned by the host half. */
    const ROUTE = '/shell-panel'
    /** Session key the host reads as "no session on stage". */
    const NO_SESSION = 'none'
    /** How often a running command's output is requested, in milliseconds. */
    const POLL_MS = 400

    /** Product copy, English source of truth plus Spanish (MDL-LOCALE-01). */
    const STRINGS = {
      en: {
        buttonLabel: '>_',
        buttonTitle: 'Shell in the session workspace',
        title: 'Shell',
        clear: 'Clear',
        close: 'Close',
        run: 'Run',
        stop: 'Stop',
        placeholder: 'ls -la',
        running: 'running…',
        exit: 'exit',
        denied: 'sandbox denied',
        resolving: 'resolving the workspace…',
        noShell: 'this deployment mounts no shell service',
        emptyHint: 'Each command runs in its own process, starting in the directory above. A command that begins with cd moves that directory for the next one; cd, cd ~ and cd alone return to the workspace root.',
        errorPrefix: 'Error: ',
        busyOther: 'Another view of this session is running a command; this panel attached to it.',
      },
      es: {
        buttonLabel: '>_',
        buttonTitle: 'Shell en el workspace de la sesión',
        title: 'Shell',
        clear: 'Limpiar',
        close: 'Cerrar',
        run: 'Ejecutar',
        stop: 'Detener',
        placeholder: 'ls -la',
        running: 'ejecutando…',
        exit: 'salida',
        denied: 'denegado por el sandbox',
        resolving: 'resolviendo el workspace…',
        noShell: 'este despliegue no monta el servicio de shell',
        emptyHint: 'Cada comando corre en su propio proceso, empezando en el directorio de arriba. Un comando que empieza con cd mueve ese directorio para el siguiente; cd, cd ~ y cd a secas vuelven a la raíz del workspace.',
        errorPrefix: 'Error: ',
        busyOther: 'Otra vista de esta sesión está ejecutando un comando; este panel se enganchó a él.',
      },
    }

    /**
     * Panel stylesheet. Colors come from theme tokens only — no literal color —
     * so all three themes stay legible (MDL-THEME-01, MDL-THEME-02).
     */
    const CSS = [
      '.dsh-sp-fab{pointer-events:auto;position:fixed;right:12px;bottom:calc(104px + env(safe-area-inset-bottom,0px));z-index:60;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:22px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 2px 10px rgba(0,0,0,.18);cursor:pointer}',
      '.dsh-sp-fab:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsh-sp-drawer{pointer-events:auto;position:fixed;left:0;right:0;bottom:0;z-index:61;display:flex;flex-direction:column;height:min(62dvh,520px);background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2);box-shadow:0 -8px 28px rgba(0,0,0,.22)}',
      '.dsh-sp-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-sp-title{font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.dsh-sp-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;overflow:hidden}',
      '.dsh-sp-cwd{direction:rtl;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary)}',
      '.dsh-sp-mode{font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dsh-sp-btn{min-height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}',
      '.dsh-sp-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-sp-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-sp-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsh-sp-primary:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-sp-out{flex:1;overflow:auto;padding:10px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overscroll-behavior:contain}',
      '.dsh-sp-block{margin-bottom:10px}',
      '.dsh-sp-cmd{color:var(--dsw-alias-brand-primary);white-space:pre-wrap;word-break:break-word}',
      '.dsh-sp-pre{margin:2px 0 0;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);font:inherit}',
      '.dsh-sp-status{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-sp-ok{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-sp-fail{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-sp-empty{color:var(--dsw-alias-label-secondary)}',
      '.dsh-sp-in{display:flex;align-items:center;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-sp-prompt{color:var(--dsw-alias-label-secondary);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.dsh-sp-field{flex:1;min-width:0;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:16px/1 ui-monospace,SFMono-Regular,Menlo,monospace}',
      // Below the shell's phone breakpoint the drawer takes the full height band
      // it needs and leaves the composer reachable above it.
      '@media (max-width: 767px){.dsh-sp-drawer{height:min(70dvh,560px)}}',
    ].join('\n')

    /** The copy table for one locale, falling back to the English source. */
    function textFor(locale) {
      return STRINGS[locale] ?? STRINGS.en
    }

    /** The host's session key for the session on stage. */
    function keyFor(sessionId) {
      return typeof sessionId === 'string' && sessionId !== '' ? sessionId : NO_SESSION
    }

    /** One request against the panel's own route. */
    async function callPanel(key, action, method, body) {
      const url = `${ROUTE}/${encodeURIComponent(key)}/${action}`
      const init = method === 'GET'
        ? { method, headers: { accept: 'application/json' } }
        : {
            method,
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body ?? {}),
          }
      const response = await fetch(url, init)
      const value = await response.json().catch(() => null)
      if (value === null || typeof value !== 'object') {
        return { ok: false, code: 'HTTP', error: `HTTP ${String(response.status)}` }
      }
      return value
    }

    exports.inject = ['slots', 'locale']

    /**
     * Install the panel.
     * @param ctx - the client plugin context.
     */
    exports.apply = function apply(ctx) {
      const h = React.createElement

      ctx.effect(() => {
        const el = document.createElement('style')
        el.dataset.plugin = 'dsh-shell-panel'
        el.textContent = CSS
        document.head.append(el)
        return () => el.remove()
      }, 'shell-panel: stylesheet')

      /** The panel: the floating button, and the drawer it opens. */
      function ShellPanel(props) {
        const useSessions = typeof props?.useSessions === 'function' ? props.useSessions : null
        const sessionId = useSessions === null ? undefined : useSessions((state) => state.current)
        const key = keyFor(sessionId)

        const [locale, setLocale] = React.useState(ctx.locale.getLocale().active)
        const [open, setOpen] = React.useState(false)
        const [blocks, setBlocks] = React.useState([])
        const [draft, setDraft] = React.useState('')
        const [activeRun, setActiveRun] = React.useState(null)
        const [info, setInfo] = React.useState(null)
        const [history, setHistory] = React.useState([])
        const [historyIndex, setHistoryIndex] = React.useState(-1)
        const outRef = React.useRef(null)
        const t = textFor(locale)

        React.useEffect(() => {
          const sync = () => setLocale(ctx.locale.getLocale().active)
          sync()
          return ctx.locale.subscribe(sync)
        }, [])

        // The header always prints what the host resolved for this session, so a
        // session switch, a reload, or a deleted directory is never guessed.
        React.useEffect(() => {
          if (!open) return undefined
          let cancelled = false
          callPanel(key, 'info', 'GET').then((value) => {
            if (!cancelled) setInfo(value)
          }).catch(() => {
            if (!cancelled) setInfo(null)
          })
          return () => { cancelled = true }
        }, [open, key])

        React.useEffect(() => {
          const node = outRef.current
          if (node !== null) node.scrollTop = node.scrollHeight
        }, [blocks])

        React.useEffect(() => {
          if (activeRun === null) return undefined
          const runId = activeRun
          const timer = window.setInterval(() => {
            callPanel(key, 'poll', 'POST', { runId }).then((value) => {
              if (value.ok !== true || value.code === 'UNKNOWN_RUN') {
                setActiveRun(null)
                return
              }
              setBlocks((prev) => prev.map((block) => block.runId === runId
                ? { ...block, text: String(value.text ?? ''), running: value.running === true, exitCode: value.exitCode ?? null, denied: value.denied === true }
                : block))
              if (value.running !== true) setActiveRun(null)
            }).catch(() => setActiveRun(null))
          }, POLL_MS)
          return () => window.clearInterval(timer)
        }, [activeRun, key])

        const append = (block) => setBlocks((prev) => prev.concat([block]))

        const submit = () => {
          const command = draft.trim()
          if (command === '' || activeRun !== null) return
          setDraft('')
          setHistory((prev) => prev.concat([command]).slice(-50))
          setHistoryIndex(-1)
          callPanel(key, 'start', 'POST', { command }).then((value) => {
            if (value.ok !== true) {
              if (value.code === 'BUSY' && typeof value.runId === 'string') {
                append({ runId: value.runId, command, text: t.busyOther, running: true, exitCode: null, denied: false })
                setActiveRun(value.runId)
                return
              }
              append({ runId: null, command, text: String(value.error ?? value.code ?? 'error'), running: false, exitCode: null, denied: false })
              return
            }
            if (typeof value.cwd === 'string') setInfo((prev) => (prev === null ? prev : { ...prev, cwd: value.cwd }))
            append({ runId: value.runId, command, text: '', running: true, exitCode: null, denied: false })
            setActiveRun(value.runId)
          }).catch((error) => {
            append({ runId: null, command, text: t.errorPrefix + String(error?.message ?? error), running: false, exitCode: null, denied: false })
          })
        }

        const stop = () => {
          if (activeRun === null) return
          callPanel(key, 'kill', 'POST', { runId: activeRun }).catch(() => undefined)
        }

        const onKeyDown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
            return
          }
          if (event.key === 'ArrowUp' && history.length > 0) {
            event.preventDefault()
            const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1)
            setHistoryIndex(next)
            setDraft(history[next])
            return
          }
          if (event.key === 'ArrowDown' && historyIndex >= 0) {
            event.preventDefault()
            const next = historyIndex + 1
            if (next >= history.length) {
              setHistoryIndex(-1)
              setDraft('')
            } else {
              setHistoryIndex(next)
              setDraft(history[next])
            }
          }
        }

        const cwd = typeof info?.cwd === 'string' ? info.cwd : null
        const cwdLabel = cwd === null ? t.resolving : cwd
        const modeLabel = info === null
          ? ''
          : info.hasShell === false
            ? t.noShell
            : String(info.mode ?? '')

        if (!open) {
          return h('button', {
            className: 'dsh-sp-fab',
            title: t.buttonTitle,
            'aria-label': t.buttonTitle,
            onClick: () => setOpen(true),
          }, t.buttonLabel)
        }

        const blockEls = blocks.map((block, index) => {
          const statusClass = block.running
            ? 'dsh-sp-status'
            : `dsh-sp-status ${block.exitCode === 0 ? 'dsh-sp-ok' : 'dsh-sp-fail'}`
          const label = block.running
            ? t.running
            : `${t.exit} ${String(block.exitCode)}${block.denied ? ` · ${t.denied}` : ''}`
          return h('div', { className: 'dsh-sp-block', key: block.runId === null ? `local-${String(index)}` : block.runId },
            h('div', { className: 'dsh-sp-cmd' }, `$ ${block.command}`),
            block.text === '' ? null : h('pre', { className: 'dsh-sp-pre' }, block.text),
            h('div', { className: statusClass }, label),
          )
        })

        return h('div', { className: 'dsh-sp-drawer' },
          h('div', { className: 'dsh-sp-head' },
            h('span', { className: 'dsh-sp-title' }, t.title),
            h('span', { className: 'dsh-sp-meta' },
              h('span', { className: 'dsh-sp-cwd', title: cwdLabel }, cwdLabel),
              h('span', { className: 'dsh-sp-mode' }, modeLabel),
            ),
            h('button', { className: 'dsh-sp-btn', onClick: () => setBlocks([]), disabled: activeRun !== null }, t.clear),
            h('button', { className: 'dsh-sp-btn', onClick: () => setOpen(false) }, t.close),
          ),
          h('div', { className: 'dsh-sp-out', ref: outRef },
            blocks.length === 0 ? h('div', { className: 'dsh-sp-empty' }, t.emptyHint) : blockEls,
          ),
          h('div', { className: 'dsh-sp-in' },
            h('span', { className: 'dsh-sp-prompt' }, '$'),
            h('input', {
              className: 'dsh-sp-field',
              value: draft,
              placeholder: t.placeholder,
              autoCapitalize: 'off',
              autoCorrect: 'off',
              spellCheck: false,
              enterKeyHint: 'send',
              onChange: (event) => setDraft(event.target.value),
              onKeyDown,
            }),
            activeRun !== null
              ? h('button', { className: 'dsh-sp-btn', onClick: stop }, t.stop)
              : h('button', { className: 'dsh-sp-btn dsh-sp-primary', onClick: submit, disabled: draft.trim() === '' }, t.run),
          ),
        )
      }

      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'shell-panel', order: 103 },
        ShellPanel,
      ))
    }

    return module.exports
  },
})
