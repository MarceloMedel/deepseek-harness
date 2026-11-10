/**
 * dsh-cat-mascot — browser half.
 *
 * One seat: `conversation.input.dock` (order 9), a 32px black cat above the
 * composer that appears while this session's agent is running. The image is a
 * plain same-origin route served by the host half, so the browser decodes the
 * GIF file itself; no data URL crosses a sandbox.
 *
 * Per-session visibility: the host stores a hidden/show preference per session
 * (the `cat_mascot` Tool writes it, HTTP POST can too). This half reads the
 * page's current session id from `localStorage["dsh.sessions.current"]` — the
 * key the conversation shell updates when the user opens another session — and
 * refetches the preference whenever the rendered session state changes, which
 * covers both session switches and idle→running→idle transitions. While idle,
 * or hidden for the session, the dock contributes nothing.
 */

window.__ModuleLoader__.load({
  id: 'dsh-cat-mascot',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    /** Dock image size in px. */
    const SIZE = 32
    /** The conversation shell's current-session key. */
    const CURRENT_KEY = 'dsh.sessions.current'

    const CSS = [
      '.dsh-cat-mascot { display: flex; align-items: center; padding: 0 4px; line-height: 0; }',
      '.dsh-cat-mascot img { width: ' + SIZE + 'px; height: ' + SIZE + 'px; display: block; }',
      '.dsh-cat-mascot-note { line-height: 1.2; font-size: 10px; color: #f87171; }',
    ].join('\n')

    function currentSessionId() {
      try {
        const value = window.localStorage.getItem(CURRENT_KEY)
        return value === null || value === '' ? undefined : value
      } catch {
        return undefined
      }
    }

    /**
     * One cat while the agent works, in sessions that have not hidden it.
     * The refetch dependency is the session object the dock receives, so a
     * session switch and any turn transition refresh the preference.
     */
    function CatDock(props) {
      const session = props.session
      const [failed, setFailed] = React.useState(false)
      const [hidden, setHidden] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        const sessionId = currentSessionId()
        if (sessionId === undefined) {
          setHidden(false)
          return undefined
        }
        fetch('/cat-mascot/pref?sessionId=' + encodeURIComponent(sessionId))
          .then(response => response.json())
          .then((body) => {
            if (alive && body && typeof body.hidden === 'boolean') setHidden(body.hidden)
          })
          .catch(() => {
            if (alive) setHidden(false)
          })
        return () => { alive = false }
      }, [session])

      if (!session || !session.running || hidden) return null
      if (failed) {
        return React.createElement('div', { className: 'dsh-cat-mascot-note' }, 'cat: image failed to load')
      }
      return React.createElement('div', { className: 'dsh-cat-mascot' },
        React.createElement('img', {
          src: '/cat-mascot/cat.gif',
          alt: '',
          'aria-hidden': 'true',
          draggable: false,
          onError: () => { setFailed(true) },
        }))
    }

    /** Services this client half requires. */
    exports.inject = ['slots']

    /**
     * Register the dock seat and the stylesheet.
     * @param ctx - client context carrying the slot registry.
     */
    exports.apply = function apply(ctx) {
      ctx.effect(() => {
        const el = document.createElement('style')
        el.dataset.plugin = 'dsh-cat-mascot'
        el.textContent = CSS
        document.head.append(el)
        return () => { el.remove() }
      }, 'cat-mascot: stylesheet')

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'cat-mascot', order: 9 },
        CatDock,
      ))
    }

    return module.exports
  },
})
