# SPEC-025 — Archivos adjuntos en la conversación

Estado: Aprobada
Fase: 25
Aprobación para iniciar: usuario, 2026-11-09 — alcance acordado en el diálogo de diseño (transporte, plano de implementación, formatos de la fase y visión)
Commit base: `155a833200`

## Objetivo

Adjuntar un archivo a la conversación desde el teléfono o el escritorio, con un botón y arrastrándolo sobre la página, y que el agente lo use como contexto de esa petición sin salir de la GUI.

## Contexto

La conversación ya acepta imágenes por arrastre y por pegado, pero no tiene botón y rechaza cualquier archivo que no sea una imagen: soltar un `.md` produce hoy el aviso de tipo de imagen no admitido. `packages/attachment` declara la limitación como trabajo pendiente propio ("Generic files, audio, video, and persistent unsent drafts require separate lifecycle and provider contracts") y `packages/client/ui-attachment` la repite para la interfaz. El icono de clip existe en `ui-primitives` y ningún componente lo usa.

El agente ya lee archivos del workspace con sus propias herramientas (`read`, `grep`, `read_image`) y el lector de Markdown de `SPEC-022` ya lista los documentos del workspace. Por eso el contexto no necesita un bloque de contenido nuevo en la sesión: el archivo entra al workspace y la petición lleva su ruta.

El despliegue declara los modelos de `llm-pi-ai` sin modalidades, y el adaptador resuelve `entry.input → catálogo → defaultInput`, cuyo valor por defecto es `['text']`: una imagen llega al host y se rechaza como `UNSUPPORTED_CONTENT` antes de la llamada. `gemma4:cloud` y `glm-5.3-flash:cloud` informan `vision` en `capabilities` y el endpoint compatible de Ollama aceptó una imagen real en la validación de esta fase, así que la modalidad es una declaración de configuración, no un cambio de código.

Este documento posee el alcance de la fase; el contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md).

## Alcance

- `CF-01` Un botón de clip en la fila de herramientas del compositor, en el asiento `conversation.input.left`, visible y accesible en escritorio y en teléfono.
- `CF-02` Arrastrar y soltar sobre toda la página para archivos que no son imágenes, con invitación propia de pantalla completa y sin competir con el overlay de imágenes del shell.
- `CF-03` Los bytes viajan al host y se escriben en el workspace de la sesión, en `<workspace>/.dsh-uploads/<nombre>`; el nombre se sanea y una colisión recibe un sufijo.
- `CF-04` El archivo adjuntado aparece en el borrador como una referencia de texto con su ruta relativa, y esa referencia es lo que el agente recibe al enviar.
- `CF-05` La carpeta de adjuntos queda excluida del git local con una línea en `.git/info/exclude`; no se toca el `.gitignore` versionado ni el historial.
- `CF-06` Formatos de texto leídos tal cual: `.md`, `.markdown`, `.txt`, `.csv`, `.tsv`, `.json`, `.yaml`, `.yml`, `.log` y código fuente habitual.
- `CF-07` Formatos con extractor, mediante la herramienta `read_document` del agente: `.pdf` con capa de texto, `.docx` y `.xlsx`.
- `CF-08` Las imágenes usan el carril existente: el mismo botón y el mismo arrastre las entregan a `createDraftImages` y `addImages`, sin modificar los paquetes del shell.
- `CF-09` Todo texto de la interfaz se publica en inglés y español y sigue la preferencia de idioma.
- `CF-10` Los límites son campos de configuración de la fila de composición: tamaño por archivo, extensiones admitidas, carpeta de destino, tope de caracteres extraídos y topes de hojas y filas de `.xlsx`.
- `CF-11` Toda escritura y toda lectura quedan cercadas al workspace de la sesión, con `fs.contains`.
- `CF-12` Un archivo que excede un límite, una extensión no admitida, una sesión desconocida o una extracción fallida producen un aviso visible y no alteran el borrador.
- `CF-13` El plugin sobrevive al reinicio del proceso y a la recreación del contenedor: el código está versionado en el repositorio y el paquete se publica en el volumen al arrancar.

## Fuera del alcance

- Vídeo y audio: la capa LLM sólo admite las modalidades `text` e `image`, así que requieren `ffmpeg`, un modelo con visión y una capacidad de transcripción que el producto no tiene.
- OCR de PDF escaneado y de imágenes sin capa de texto.
- Formatos heredados `.doc` y `.xls`, que necesitarían LibreOffice en la imagen.
- Un tipo de contenido nuevo en la sesión para adjuntos durables: la referencia es texto de la petición.
- Tarjeta con vista previa del adjunto en el historial.
- Declarar la modalidad de visión en el despliegue: es una acción de configuración del usuario, documentada aquí, no un cambio de esta fase.
- Modificar paquetes de upstream.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CFV-01` | El botón de clip está en la fila del compositor en escritorio y en teléfono y abre el selector de archivos | Arnéscer de `check.mjs` y validación manual en la GUI |
| `CFV-02` | Elegir un `.md` escribe el archivo en `.dsh-uploads/` y su ruta en el borrador | Arnéscer de `check.mjs` y `curl` a la ruta de carga |
| `CFV-03` | Soltar un archivo no imagen sobre la página lo adjunta; soltar una imagen conserva el comportamiento del shell | Arnéscer de `check.mjs` (reclamo en fase de captura) y validación manual |
| `CFV-04` | Un nombre con `..`, `/`, NUL o más de 120 caracteres no puede escribir fuera de `.dsh-uploads/` | Arnéscer de `check.mjs` |
| `CFV-05` | Un archivo que excede el límite configurado, una extensión no admitida y una sesión desconocida se rechazan con aviso y sin escribir | Arnéscer de `check.mjs` |
| `CFV-06` | `.pdf`, `.docx` y `.xlsx` se extraen a texto con sus topes y la truncación se anuncia | Arnéscer de `check.mjs` con archivos reales generados |
| `CFV-07` | `read_document` lee un archivo del workspace y rechaza una ruta fuera de él | Arnéscer de `check.mjs` y `Tool.listTools` |
| `CFV-08` | Una imagen elegida con el botón llega al carril y se envía como bloque de imagen | Arnéscer de `check.mjs` |
| `CFV-09` | La interfaz no publica texto en otros idiomas y sigue el idioma activo | Revisión del diccionario y arnéscer de `check.mjs` |
| `CFV-10` | `.dsh-uploads/` no aparece en `git status` del workspace | Comando sobre el repositorio tras una carga |
| `CFV-11` | `dsh --profile web --dump-config` compone la fila nueva y el arranque real sirve el bundle de cliente | Arranque aislado sobre un `DSH_HOME` temporal |
| `CFV-12` | Tras reiniciar el proceso el plugin sigue disponible sin reinstalar nada | Reinicio del proceso y validación manual |
| `CFV-13` | Un `.pdf` adjuntado y enviado hace que el agente lo lea y responda sobre su contenido | Validación manual en una sesión real |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-DATA-01`, `MDL-UPSTREAM-01` y `MDL-VALID-01`.
- `MDL-LOCALE-01`: los textos del plugin se publican en inglés y español.
- `MDL-SEC-01`: el paquete no incorpora credenciales; las cargas son datos del usuario y no entran en el repositorio gracias a `CF-05`.
- El modelo ve la ruta y el resultado de la herramienta, y ambas cosas quedan registradas: la referencia es texto de la petición y la lectura es un resultado de herramienta. No se introduce ninguna entrada visible para el modelo que no sea reconstruible desde el registro.
- El reclamo del arrastre se hace en fase de captura sobre `document` y detiene la propagación sólo cuando el arrastre trae archivos que este plugin va a gestionar, de modo que el overlay y el carril de imágenes del shell conservan su comportamiento para las imágenes.
- El plugin no publica servicios: su fila vive en el plano host sin `isolate` y consume `webServer`, `fs`, `tools` y `sessions`.
- Las dependencias de extracción viajan dentro del paquete del plugin, que se instala en el árbol de la imagen; no se añaden al workspace de upstream.
- La extracción no se ejecuta al adjuntar, sino cuando el agente llama a `read_document`, para no gastar trabajo ni duplicar artefactos de un archivo que quizá nunca se envíe.

## Implementación prevista

- `mdl/plugins/chat-files/host.mjs`: ruta `/chat-files` con la carga de un archivo, el cercado al workspace, el saneado del nombre, la exclusión local de git y los extractores de `pdf`, `docx` y `xlsx`; más la herramienta `read_document`. La ruta se adquiere con `ctx.inject(['webServer'])`, así que un perfil sin servidor web compone la fila y conserva la herramienta.
- `mdl/plugins/chat-files/xlsx.mjs`: lectura de un libro de cálculo sobre `fflate` (hojas, tabla de cadenas, formatos numéricos y fechas, CSV con topes) en lugar de una dependencia de decenas de megabytes.
- `mdl/plugins/chat-files/package.json` y `package-lock.json`: las dependencias de extracción viajan en el paquete; la imagen las instala en su propia carpeta y descarta de pdf.js lo que sólo sirve al navegador.
- `mdl/plugins/chat-files/fixtures/`: un PDF, un DOCX y un XLSX reales y pequeños para el arnéscer.
- `mdl/plugins/chat-files/client.js`: botón de clip en `conversation.input.left`, reclamo del arrastre en fase de captura, invitación propia, escritura del marcador con `inputActions.setDraft` y entrega de imágenes al carril del shell.
- `mdl/plugins/chat-files/package.json`, `cordis.patch.yml` e `install.sh`: manifiesto, capa que inserta la fila y publicación del paquete en el volumen.
- `mdl/plugins/chat-files/check.mjs`: arnéscer ejecutable de ambas mitades.
- `mdl/docker/Dockerfile` y `mdl/docker/entrypoint.sh`: entrega del paquete y de sus dependencias a la imagen y publicación en cada arranque.

## Validación ejecutada

Entorno: 2026-11-09, contenedor `mdl-harness`, commit base `155a833200`. El despliegue vivo no se tocó: el paquete se publicó con `install.sh` en un `DSH_HOME` temporal (`/tmp/cf-boot/home`), y esa instancia aislada se arrancó en el puerto 3099 con el CLI de la imagen. La evidencia reproducible es `mdl/plugins/chat-files/check.mjs`, que publica el paquete en ese mismo tipo de hogar desechable y ejecuta ambas mitades: monta la mitad host sobre el `FileSystem` real (`@deepseek-ai/dsh-fs-local`) con peticiones reales y ejecuta la mitad cliente en un DOM de jsdom con una tabla de módulos simulada. Las 58 comprobaciones pasan.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Modalidad de visión del despliegue | Validado | `gemma4:cloud` informa `capabilities: [completion, thinking, tools, vision]` y el endpoint OpenAI-compatible respondió «Red» a un PNG de 16×16 rojo |
| `CFV-02` Carga de un `.md` y referencia en el borrador | Validado (arnéscer y proceso vivo) | Arnéscer: `POST` responde `{ok:true,path:'.dsh-uploads/notes.md'}` y el borrador recibe `[attached file: .dsh-uploads/report.pdf (read_document)]`; el proceso vivo en 3099 respondió `{ok:true,path:'.dsh-uploads/spec.md',bytes:4395}` y el archivo existe en el workspace |
| `CFV-04` Nombres que intentan salir de la carpeta | Validado | Arnéscer: `../../../etc/passwd.md` se deposita como `.dsh-uploads/passwd.md` y nada aparece fuera; NUL → `BAD_REQUEST`; una carpeta `.dsh-uploads` enlazada fuera del workspace → `STAGING_FAILED` sin escribir nada en el destino |
| `CFV-05` Límites, extensiones y sesión | Validado (arnéscer y proceso vivo) | Arnéscer: `.exe` → `UNSUPPORTED_TYPE` con su extensión, 70 KB sobre un tope de 64 KB → `TOO_LARGE`, cuerpo vacío → `EMPTY_FILE`, sesión desconocida → `UNKNOWN_SESSION`, `content-type` distinto de octet-stream → `BAD_REQUEST`; proceso vivo: `403 BAD_REQUEST` desde otro origen y `415 UNSUPPORTED_TYPE` para `.exe`; un archivo rechazado nunca queda escrito |
| `CFV-06` Extracción de `.pdf`, `.docx` y `.xlsx` | Validado | Arnéscer con archivos reales en `fixtures/`: PDF → «Hello PDF 42», DOCX → «Quarterly report» y «42 percent», XLSX → `## Sheet: Q3` con `North,1200`; la celda `Comma, "quoted"` sale entrecomillada; el tope de hojas y de filas se anuncia en el texto |
| `CFV-07` `read_document` | Validado (arnéscer y agente real) | Arnéscer: lee un `.md`, informa caracteres, trunca al tope con aviso, rechaza una ruta fuera del workspace, un archivo inexistente y una extensión sin lector; una ejecución headless real del agente sobre la instancia aislada llamó la herramienta sobre un PDF depositado y respondió «Hello PDF 42» |
| `CFV-08` Imagen al carril existente | Parcial | Arnéscer: una imagen elegida con el botón llama `createDraftImages` y `addImages`, y no toca el borrador ni la ruta de carga. El carril real no se ejercitó porque la ruta de modelos del despliegue declara `[text]` |
| `CFV-10` `.dsh-uploads/` fuera de `git status` | Validado | Proceso vivo sobre un workspace con `.git`: `git status --short` vacío y `.dsh-uploads/` presente en `.git/info/exclude` |
| `CFV-11` Composición y bundle servido | Validado | `--dump-config` del perfil `web` incluye `- id: chat-files`; el arranque aislado sirve `{"id":"dsh-chat-files","url":"/plugins/dsh-chat-files/client.js?rev=…"}` en `window.__DSH_BOOT__` y el bundle responde `200 text/javascript` con 21 KB |
| `CFV-12` Supervivencia al reinicio del proceso | Validado (proceso) | La instancia aislada se arrancó dos veces sobre el mismo hogar: la segunda sirvió el paquete actualizado sin reinstalar nada. La recreación del contenedor no se ejecutó |
| `CFV-01`, `CFV-03` Botón y arrastre en la GUI real | Parcial | Arnéscer: el botón se registra en `conversation.input.left` con su etiqueta traducida y abre el selector; un arrastre de documento se reclama en fase de captura, muestra la invitación y adjunta al soltar; uno de sólo imágenes no se reclama. La GUI real no se ejercitó |
| `CFV-09` Idiomas | Parcial | Arnéscer: la etiqueta cambia a «Adjuntar un archivo» al cambiar el idioma activo; el diccionario sólo publica inglés y español. Falta la revisión visual |
| `CFV-13` Un `.pdf` adjuntado y leído por el agente | Validado (sin GUI) | La ejecución headless del agente leyó el PDF depositado por la herramienta y respondió con su texto. El camino completo con el botón en la GUI queda pendiente |

Dos defectos aparecieron durante esta validación y se corrigieron antes de cerrarla: la fila declaraba `webServer` como dependencia dura, lo que dejaba la entrada pendiente y hacía fallar el arranque de un perfil sin servidor web (el perfil `headless` no arrancaba); y `fs.resolve` responde para una ruta que todavía no existe, así que la comprobación de existencia de `read_document` hubo de apoyarse en `fs.stat`.

## Resultado y pendientes

- Resultado: el paquete está implementado y validado dentro de un proceso real, incluido un agente que lee un PDF adjunto. Botón, arrastre, depósito en el workspace, referencia en el borrador, extractores y exclusión de git funcionan; 58 comprobaciones automáticas y un arranque aislado lo respaldan.
- Pendientes: la GUI real (botón, arrastre y aviso en escritorio y teléfono), el carril de imágenes con un modelo que declare visión, la recreación del contenedor y el despliegue. Ninguna se reporta como exitosa.
- Decisión de salida: en implementación. Falta reconstruir la imagen y recrear el contenedor, que es cuando el `entrypoint` publica el paquete en el volumen; la instancia viva sigue sin la fila.
