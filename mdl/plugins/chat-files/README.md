# dsh-chat-files

Attach a file to a conversation: a paperclip button in the composer and drag-and-drop over the whole page, for Markdown and text files as well as PDF, DOCX and XLSX, with images going to the shipped image rail.

The bundle follows `mdl/plugins/md-preview`: one package with a host half, a browser half and a composition row, published into `$DSH_HOME/profiles/node_modules` at boot. Upstream packages are untouched.

## How a file becomes context

1. The browser POSTs the bytes to `/chat-files/<session>/upload?name=<file>`.
2. The host half writes them to `<workspace>/.dsh-uploads/<name>`, adding a numeric suffix instead of overwriting, and keeps that directory out of `git status` through `.git/info/exclude`.
3. The browser writes one reference line into the draft:

   ```
   [attached file: .dsh-uploads/report.pdf (read_document)]
   ```

4. The user sends the message. The agent reads the path with its own tools: `read` for text, `read_document` for the extractors.

The reference is prompt text, so the model-visible input is already in the session log; the file itself stays an ordinary workspace file that survives compaction and can be read again in a later turn.

## Configuration

Row config in the profile's patch layer; every limit is a field, none is a constant in code.

| Key | Default | Meaning |
|---|---:|---|
| `uploadsDir` | `.dsh-uploads` | Workspace-relative directory that receives staged files. |
| `maxFileBytes` | `26214400` | Largest staged file (25 MiB). |
| `maxTextBytes` | `2097152` | Largest text file `read_document` inlines whole. |
| `maxExtractedChars` | `120000` | Largest extracted text returned by one call. |
| `maxSheetRows` | `2000` | Rows read per spreadsheet sheet. |
| `maxSheets` | `20` | Sheets read per workbook. |
| `textExtensions` | Markdown, text, data and source files | Accepted and read as UTF-8. |
| `documentExtensions` | `pdf`, `docx`, `xlsx` | Accepted and read through an extractor. |
| `excludeFromGit` | `true` | Keep `uploadsDir` out of the clone-local git exclude. |

## Images need a vision-capable model

The deployment declares its models in `$DSH_HOME/settings.yaml` with no modalities, and `llm-pi-ai` then resolves `[text]`. An image reaches the host and is refused before the provider call, so a rail full of images is not enough. `gemma4:cloud` and `glm-5.3-flash:cloud` report `vision` in Ollama's capabilities and accept an image through the OpenAI-compatible endpoint; declaring the modality is the whole fix:

```yaml
llm-pi-ai:
  providers:
    ollama:
      models:
        - id: gemma4:cloud
          name: Gemma 4
          input: [text, image]
          contextWindow: 262144
          maxTokens: 32768
```

The composer's model picker then decides which turns can carry images: a text-only model still refuses them, with the shipped "this model does not support images" message.

## Security and fencing

- Every staged path is resolved inside the session workspace, checked with `fs.contains`, and re-checked through `realpath` after the write: a symlinked uploads directory or a swapped file is discarded rather than followed.
- The route requires `content-type: application/octet-stream` and a same-host `Origin`, which a cross-site form post cannot produce.
- Binary writes bypass `ctx.fs`, whose write surface is text-only, so this bundle targets the local filesystem provider; `fs.processPath` names the OS path it writes.

## Known limitations

- **Text layer only** — a scanned PDF has no text to extract, and OCR is out of scope; the tool says so instead of returning an empty document.
- **No video or audio** — the LLM seam has no such modality; see `mdl/specs/025-archivos-adjuntos-conversacion.md`.
- **Local provider only** — a remote filesystem backend would need a byte-write on the fs service.
- **No preview card** — an attachment is a reference line in the message, not a thumbnail with a file viewer.
- **pdf.js prints one warning per process** — it looks for `@napi-rs/canvas`, which this bundle omits (36 MB of native binaries for a rendering path text extraction never takes). The polyfill warnings are harmless and appear once, on the first PDF read.

## Install and check

```sh
npm ci --omit=dev --omit=optional     # the extractors, once
./install.sh                          # publish into $DSH_HOME and add the row
node check.mjs                        # both halves, no browser and no dsh process
```

`check.mjs` publishes into a throwaway home of its own, so it never touches the live profile; it links `@deepseek-ai/*` from `$CHAT_FILES_MODULES` (default `$DSH_HOME/profiles/node_modules`). Pass `MDL_DSH_PROFILE` to install into a profile other than `web`.

Restart the process after `install.sh`: a running process keeps its composition. The Docker image installs the dependency tree during the build and runs `install.sh` from the entrypoint on every boot.
