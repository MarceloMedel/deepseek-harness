/**
 * dsh-chat-files — browser half.
 *
 * Two seats:
 *   - `conversation.input.left`: the paperclip button that opens the file
 *     picker, plus the whole-page drop intake for this session.
 *   - `shell.overlay`: the drop invitation and the attachment notices.
 *
 * Documents are POSTed to the host half, which stages them inside the session
 * workspace and answers with the workspace-relative path. That path is written
 * into the draft as a reference line, so the user sends a prompt whose text
 * names the file and the agent reads it with its own tools — no new content
 * block, and nothing the transcript cannot reconstruct.
 *
 * Images keep the shipped path: they become draft images of the conversation
 * service and ride the message as image blocks, exactly as a drop or a paste
 * does without this plugin. The intake therefore splits one gesture by kind
 * instead of replacing the shell's behaviour.
 *
 * The drop listeners run in the CAPTURE phase on `document` and stop
 * propagation only for a drag this plugin claims. The shell's own listeners are
 * bubble-phase, so an image-only drag never reaches this code and keeps its
 * overlay, its limits and its rail.
 */

window.__ModuleLoader__.load({
  id: 'dsh-chat-files',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const ClipIcon = primitives.IconPaperclipOutline16

    /** Route prefix owned by the host half. */
    const ROUTE = '/chat-files'
    /** Extensions the agent must read through the extraction tool. */
    const EXTRACTED_EXT = new Set(['pdf', 'docx', 'xlsx'])
    /** What the OS file picker offers; the host stays authoritative. */
    const ACCEPT = [
      'image/*', '.md', '.markdown', '.mdown', '.txt', '.text', '.csv', '.tsv', '.json', '.jsonl',
      '.yaml', '.yml', '.toml', '.ini', '.log', '.xml', '.html', '.pdf', '.docx', '.xlsx',
    ].join(',')
    /** How long one notice stays on screen. */
    const NOTICE_MS = 6000

    /** Interface copy, published in the product's shipped languages. */
    const STRINGS = {
      en: {
        attach: 'Attach a file',
        dropTitle: 'Drop to attach to this message',
        dropDetail: 'Documents are staged in the workspace and referenced in your message; images go straight into the message.',
        uploading: count => (count === 1 ? 'Attaching 1 file…' : `Attaching ${count} files…`),
        failed: (name, reason) => `"${name}" was not attached: ${reason}`,
        unsupported: ext => `".${ext}" is not an accepted attachment type.`,
        tooLarge: mb => `The file is larger than ${mb} MB.`,
        empty: 'The file is empty.',
        unknownSession: 'This conversation has no workspace to stage a file in.',
        imagesUnavailable: 'Images cannot be attached right now.',
        imageRejected: 'That image type is not supported here.',
        network: 'The upload did not reach the host.',
      },
      es: {
        attach: 'Adjuntar un archivo',
        dropTitle: 'Suelta para adjuntar a este mensaje',
        dropDetail: 'Los documentos se depositan en el workspace y se referencian en tu mensaje; las imágenes van directo al mensaje.',
        uploading: count => (count === 1 ? 'Adjuntando 1 archivo…' : `Adjuntando ${count} archivos…`),
        failed: (name, reason) => `«${name}» no se adjuntó: ${reason}`,
        unsupported: ext => `«.${ext}» no es un tipo de adjunto admitido.`,
        tooLarge: mb => `El archivo supera ${mb} MB.`,
        empty: 'El archivo está vacío.',
        unknownSession: 'Esta conversación no tiene workspace donde depositar el archivo.',
        imagesUnavailable: 'Ahora mismo no se pueden adjuntar imágenes.',
        imageRejected: 'Ese tipo de imagen no está admitido aquí.',
        network: 'La carga no llegó al host.',
      },
    }

    /** Copy for one locale, falling back to English for an unpublished id. */
    function strings(locale) {
      return STRINGS[locale] ?? STRINGS.en
    }

    /** Lowercase extension of one file name ('' when it has none). */
    function extOf(name) {
      const at = String(name).lastIndexOf('.')
      return at <= 0 ? '' : String(name).slice(at + 1).toLowerCase()
    }

    /** Whether one browser file is an image the shipped rail accepts. */
    function isImageFile(file) {
      return String(file?.type ?? '').startsWith('image/')
    }

    /**
     * One reference line for a staged document. It names the file and the tool
     * that reads it, so the model does not have to infer either.
     * @param path - workspace-relative path the host answered with.
     * @returns the draft line.
     */
    function markerFor(path) {
      const tool = EXTRACTED_EXT.has(extOf(path)) ? 'read_document' : 'read'
      return `[attached file: ${path} (${tool})]`
    }

    /**
     * Append reference lines to a draft, keeping the user's own text first and
     * leaving the caret room to continue.
     * @param draft - the current draft text.
     * @param markers - one line per staged file.
     * @returns the next draft.
     */
    function appendMarkers(draft, markers) {
      const block = markers.join('\n')
      const base = String(draft).replace(/\s+$/, '')
      return base === '' ? `${block}\n\n` : `${base}\n\n${block}\n`
    }

    // ── store ───────────────────────────────────────────────────────────────

    let state = { locale: 'en', dragging: false, busy: 0, notice: null, seq: 0 }
    const listeners = new Set()

    /** Publish one store patch to every subscriber. */
    function publish(patch) {
      state = { ...state, ...patch }
      for (const listener of [...listeners]) listener(state)
    }

    const store = {
      get: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      setLocale(locale) {
        if (typeof locale === 'string' && locale.length > 0 && locale !== state.locale) publish({ locale })
      },
      setDragging(dragging) {
        if (dragging !== state.dragging) publish({ dragging })
      },
      setBusy(busy) {
        publish({ busy: Math.max(0, busy) })
      },
      /** Surface one message and give it a sequence number so repeats re-render. */
      notify(text, kind) {
        const seq = state.seq + 1
        publish({ notice: text === null ? null : { text, kind: kind ?? 'error', seq }, seq })
      },
    }

    /** The client root context, set by apply (the conversation service is read lazily). */
    let rootCtx = null

    // ── transport ───────────────────────────────────────────────────────────

    /**
     * One attachment failure carrying the host's machine code.
     * @param code - host error code, or 'NETWORK'.
     * @param detail - host-supplied details for the message.
     * @param message - host-supplied English text, used only when nothing maps it.
     */
    function uploadError(code, detail, message) {
      const error = new Error(message ?? code)
      error.code = code
      error.detail = detail ?? {}
      return error
    }

    /**
     * Stage one file in the session workspace.
     * @param sessionId - the session whose workspace receives it.
     * @param file - the browser file.
     * @returns the host answer: path, name, ext and byte count.
     */
    async function uploadFile(sessionId, file) {
      let response
      try {
        response = await fetch(`${ROUTE}/${encodeURIComponent(sessionId)}/upload?name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: file,
        })
      } catch {
        throw uploadError('NETWORK', {})
      }
      const payload = await response.json().catch(() => undefined)
      if (response.ok && payload?.ok === true) return payload
      throw uploadError(
        typeof payload?.code === 'string' ? payload.code : `HTTP_${String(response.status)}`,
        payload,
        typeof payload?.error === 'string' ? payload.error : undefined,
      )
    }

    /** Localized text for one failed upload. */
    function failureText(t, file, error) {
      switch (error?.code) {
        case 'UNSUPPORTED_TYPE': return t.unsupported(error.detail?.ext ?? extOf(file.name))
        case 'TOO_LARGE': return t.tooLarge(error.detail?.maxMB ?? '')
        case 'EMPTY_FILE': return t.empty
        case 'UNKNOWN_SESSION': return t.unknownSession
        case 'NETWORK': return t.network
        default: return error?.message ?? t.network
      }
    }

    // ── drag classification ─────────────────────────────────────────────────

    /** Whether a drag carries files at all (a text drag carries none). */
    function dragHasFiles(event) {
      return event.dataTransfer?.types?.includes('Files') === true
    }

    /**
     * Whether this plugin claims the drag. Images stay with the shell, whose
     * overlay, limits and rail are shipped behaviour worth keeping; an untyped
     * file is claimed because the shell would only reject it.
     * @param event - the drag event.
     * @returns true when this plugin owns the gesture.
     */
    function dragWantsClaim(event) {
      if (!dragHasFiles(event)) return false
      const items = event.dataTransfer?.items
      if (items === undefined || items === null || items.length === 0) return true
      for (const item of items) {
        if (item.kind !== 'file') continue
        if (!String(item.type ?? '').startsWith('image/')) return true
      }
      return false
    }

    // ── components ──────────────────────────────────────────────────────────

    /** Per-session attach control: the picker button and the drop listeners. */
    function AttachButton(props) {
      const [snapshot, setSnapshot] = React.useState(store.get())
      React.useEffect(() => {
        setSnapshot({ ...store.get() })
        return store.subscribe(next => setSnapshot({ ...next }))
      }, [])

      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : ''
      const inputActions = props?.inputActions
      const pickerRef = React.useRef(null)
      // Optimistic draft mirror: two quick attachments must build on each other
      // even before React re-renders with the first marker.
      const draftRef = React.useRef('')
      draftRef.current = typeof props?.input?.draft === 'string' ? props.input.draft : draftRef.current

      /** Attach images through the conversation service (the shipped rail path). */
      const attachImages = React.useCallback((images) => {
        const t = strings(store.get().locale)
        const conversation = rootCtx?.get?.('conversation')
        if (conversation === undefined || typeof conversation?.createDraftImages !== 'function'
          || typeof inputActions?.addImages !== 'function') {
          store.notify(t.imagesUnavailable, 'error')
          return
        }
        let drafts
        try {
          drafts = conversation.createDraftImages(images)
        } catch {
          store.notify(t.imageRejected, 'error')
          return
        }
        if (!inputActions.addImages(drafts.map(draft => draft.id))) {
          for (const draft of drafts) conversation.releaseDraftImage?.(draft.id)
          store.notify(t.imagesUnavailable, 'error')
        }
      }, [inputActions])

      /** Stage documents and reference them in the draft. */
      const attachDocuments = React.useCallback(async (documents) => {
        if (sessionId === '') return
        store.setBusy(store.get().busy + 1)
        const staged = []
        const failures = []
        for (const file of documents) {
          try {
            staged.push({ file, answer: await uploadFile(sessionId, file) })
          } catch (error) {
            failures.push({ file, error })
          }
        }
        store.setBusy(store.get().busy - 1)
        if (staged.length > 0 && typeof inputActions?.setDraft === 'function') {
          const next = appendMarkers(draftRef.current, staged.map(entry => markerFor(entry.answer.path)))
          draftRef.current = next
          inputActions.setDraft(next)
        }
        if (failures.length > 0) {
          const t = strings(store.get().locale)
          const first = failures[0]
          store.notify(t.failed(first.file.name, failureText(t, first.file, first.error)), 'error')
        }
      }, [inputActions, sessionId])

      /** One gesture: split by kind, then hand each half to its owner. */
      const intake = React.useCallback((files) => {
        const list = [...files]
        if (list.length === 0) return
        const images = list.filter(file => isImageFile(file))
        const documents = list.filter(file => !isImageFile(file))
        if (images.length > 0) attachImages(images)
        if (documents.length > 0) void attachDocuments(documents)
      }, [attachDocuments, attachImages])

      // Whole-page intake for drags this plugin claims. Capture phase: the
      // shell's own bubble-phase listeners must never see a claimed drag.
      React.useEffect(() => {
        if (sessionId === '') return undefined
        let claimed = false
        let depth = 0
        const reset = () => {
          claimed = false
          depth = 0
          store.setDragging(false)
        }
        const onDragEnter = (event) => {
          if (!dragWantsClaim(event)) return
          event.preventDefault()
          event.stopPropagation()
          claimed = true
          depth += 1
          store.setDragging(true)
        }
        const onDragOver = (event) => {
          if (!claimed || !dragHasFiles(event)) return
          event.preventDefault()
          event.stopPropagation()
          if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
        }
        const onDragLeave = (event) => {
          if (!claimed || !dragHasFiles(event)) return
          event.stopPropagation()
          depth = Math.max(0, depth - 1)
          if (depth === 0) store.setDragging(false)
        }
        const onDrop = (event) => {
          if (!claimed || !dragHasFiles(event)) return
          event.preventDefault()
          event.stopPropagation()
          const files = [...(event.dataTransfer?.files ?? [])]
          reset()
          intake(files)
        }
        document.addEventListener('dragenter', onDragEnter, true)
        document.addEventListener('dragover', onDragOver, true)
        document.addEventListener('dragleave', onDragLeave, true)
        document.addEventListener('drop', onDrop, true)
        window.addEventListener('dragend', reset, true)
        return () => {
          document.removeEventListener('dragenter', onDragEnter, true)
          document.removeEventListener('dragover', onDragOver, true)
          document.removeEventListener('dragleave', onDragLeave, true)
          document.removeEventListener('drop', onDrop, true)
          window.removeEventListener('dragend', reset, true)
          reset()
        }
      }, [intake, sessionId])

      const t = strings(snapshot.locale)
      const disabled = sessionId === '' || typeof inputActions?.setDraft !== 'function'
      return React.createElement('span', { className: 'dsh-cf-seat' },
        React.createElement('input', {
          ref: pickerRef,
          type: 'file',
          multiple: true,
          accept: ACCEPT,
          className: 'dsh-cf-picker',
          'aria-hidden': 'true',
          tabIndex: -1,
          onChange: (event) => {
            const files = [...(event.target.files ?? [])]
            // The same file chosen twice must fire change again.
            event.target.value = ''
            intake(files)
          },
        }),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-cf-button',
          title: t.attach,
          'aria-label': t.attach,
          disabled,
          // Button presses must not steal focus from the textarea.
          onMouseDown: (event) => { event.preventDefault() },
          onClick: () => { pickerRef.current?.click() },
        }, React.createElement(ClipIcon, { size: 14 })),
      )
    }

    /** The drop invitation and the attachment notices. */
    function Overlay() {
      const [snapshot, setSnapshot] = React.useState(store.get())
      React.useEffect(() => {
        setSnapshot({ ...store.get() })
        return store.subscribe(next => setSnapshot({ ...next }))
      }, [])

      const noticeSeq = snapshot.notice?.seq
      React.useEffect(() => {
        if (noticeSeq === undefined) return undefined
        const timer = window.setTimeout(() => { store.notify(null) }, NOTICE_MS)
        return () => { window.clearTimeout(timer) }
      }, [noticeSeq])

      const t = strings(snapshot.locale)
      if (snapshot.dragging) {
        return React.createElement('div', { className: 'dsh-cf-veil', 'data-dsh-chat-files': 'drop' },
          React.createElement('div', { className: 'dsh-cf-card' },
            React.createElement('h2', null, t.dropTitle),
            React.createElement('p', null, t.dropDetail),
          ),
        )
      }
      if (snapshot.busy > 0) {
        return React.createElement('div', { className: 'dsh-cf-toast', 'data-kind': 'busy', role: 'status' },
          t.uploading(snapshot.busy))
      }
      if (snapshot.notice !== null) {
        return React.createElement('div', {
          className: 'dsh-cf-toast',
          'data-kind': snapshot.notice.kind,
          role: snapshot.notice.kind === 'error' ? 'alert' : 'status',
        }, snapshot.notice.text)
      }
      return null
    }

    const CSS = `
.dsh-cf-seat{display:inline-flex;align-items:center}
.dsh-cf-picker{display:none}
.dsh-cf-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s ease,color .12s ease}
.dsh-cf-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-cf-button:disabled{opacity:.4;cursor:default}
.dsh-cf-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-cf-veil{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;pointer-events:none;background:color-mix(in srgb,var(--dsw-alias-bg-base) 74%,transparent);backdrop-filter:blur(2px)}
.dsh-cf-card{max-width:420px;margin:24px;padding:26px 24px;border:2px dashed var(--dsw-alias-brand-primary);border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);text-align:center;box-shadow:0 12px 32px rgba(0,0,0,.18)}
.dsh-cf-card h2{margin:0 0 8px;font-size:15px;font-weight:600;line-height:1.3}
.dsh-cf-card p{margin:0;font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-cf-toast{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:900;max-width:min(90vw,460px);padding:10px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.16);pointer-events:none}
.dsh-cf-toast[data-kind="busy"]{color:var(--dsw-alias-label-secondary)}
.dsh-cf-toast[data-kind="error"]{border-color:var(--dsw-alias-state-error-primary)}
`

    /** Services this client half requires. */
    exports.inject = ['slots', 'locale']

    /**
     * Register the two seats and follow the locale preference.
     * @param ctx - client context carrying the slot registry and the locale service.
     */
    exports.apply = function apply(ctx) {
      rootCtx = ctx

      ctx.effect(() => {
        const element = document.createElement('style')
        element.dataset.plugin = 'dsh-chat-files'
        element.textContent = CSS
        document.head.append(element)
        return () => element.remove()
      }, 'chat-files: stylesheet')

      ctx.effect(() => {
        const sync = () => store.setLocale(ctx.locale.getLocale().active)
        sync()
        return ctx.locale.subscribe(sync)
      }, 'chat-files: locale preference')

      ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
        { name: 'conversation.input.left', id: 'chat-files-attach', order: 12 },
        AttachButton,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'chat-files-overlay', order: 102 },
        Overlay,
      ))
    }

    return module.exports
  },
})
