# SPEC-022 — Visor de Markdown en la propia GUI

Estado: En implementación
Fase: 22
Aprobación para iniciar: usuario, 2026-11-08 — alcance acordado en el diálogo de diseño (orígenes, colocación, persistencia, herramienta y extras)
Commit base: `HEAD de la rama personal al iniciar la fase`

## Objetivo

Leer un documento Markdown sin salir de la GUI: los `.md` del workspace de la sesión y el Markdown que el agente acaba de escribir, renderizados con el mismo motor que la conversación y en un panel flotante sobre la conversación.

## Contexto

La conversación ya renderiza Markdown con `MarkdownText` de `@deepseek-ai/dsh-client-ui-primitives`, que es un módulo de plataforma: cualquier bundle de cliente lo resuelve sin empaquetarlo. `dsh-html-preview`, instalado en este despliegue, demuestra el patrón que sobrevive a un reinicio: un paquete con mitad host y mitad cliente, montado por una fila de composición. Los plugins dinámicos de Cordis no sirven para esto porque viven solo en el proceso.

Una visita a un `.md` fuera de la aplicación obliga a cambiar de ventana, y el Markdown generado en la conversación no existe como archivo hasta que alguien lo guarda. Este documento posee el alcance de la fase; el contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md).

## Alcance

- `MD-01` Un panel flotante con los `.md` del workspace de la sesión agrupados por carpeta y con las carpetas plegadas, abierto desde un botón en la cabecera de la sesión.
- `MD-02` Render del documento con `MarkdownText`: GFM, tablas, bloques de código con resaltado y matemáticas en TeX, igual que la conversación.
- `MD-03` Índice de encabezados con salto a cada uno dentro del panel.
- `MD-04` Navegación entre documentos: un enlace relativo a otro `.md` se abre en el visor en vez de salir de la aplicación, tanto dentro del panel como en cualquier otra superficie, incluida una respuesta de la conversación y su ficha de archivo producido.
- `MD-05` Copiar el documento al portapapeles y descargarlo.
- `MD-06` Posición de lectura conservada por documento mientras el panel siga abierto.
- `MD-07` Una sola columna en el ancho de teléfono: primero la lista de archivos, después el documento con un botón de vuelta y el índice como hoja sobre el texto.
- `MD-08` Herramienta `md_preview` para que el agente abra un documento, con tarjeta en la conversación.
- `MD-09` Imágenes relativas del documento servidas desde la ruta del visor, para que un `.md` con imágenes se lea completo.
- `MD-10` El visor sobrevive al reinicio del proceso y a la recreación del contenedor, y su código fuente está versionado en el repositorio.
- `MD-11` El ancho decide la maqueta: por encima de 767 px conviven árbol, índice y documento; por debajo el panel ocupa la ventana y muestra un panel cada vez, con los primeros 58 px libres para el botón de menú que el shell mantiene por encima de la capa de superposición.

## Fuera del alcance

- Editar o guardar Markdown desde el visor.
- Alternar a código fuente sin renderizar.
- Vista a pantalla completa dedicada.
- Vista previa de HTML: la posee `dsh-html-preview`.
- Indexar o buscar dentro de todos los `.md` del workspace.
- Leer las respuestas del agente en el visor: la conversación ya las renderiza con el mismo motor y mostrarlas en el panel duplicaba la interfaz sin aportar lectura.
- Cambiar el renderizador de la conversación.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `MDV-01` | El botón de la cabecera abre el panel y la lista muestra los `.md` del workspace agrupados por carpeta | Validación manual en la GUI del contenedor |
| `MDV-02` | Un `.md` con tablas, código y fórmulas se ve igual que en la conversación | Validación manual con un documento de prueba en el workspace |
| `MDV-03` | El índice lista los encabezados del documento abierto y cada entrada desplaza el documento hasta él | Validación manual |
| `MDV-04` | Un enlace relativo a otro `.md` cambia el documento en el visor sin recargar la página | Validación manual sobre dos documentos enlazados |
| `MDV-16` | Un enlace a un `.md` desde una respuesta de la conversación, o su ficha de archivo producido, abre el visor; un enlace remoto, uno con `target="_blank"` y un control cuyo texto sólo termina en `.md` conservan su comportamiento | Arnéscer de `check.mjs` y validación manual en la GUI |
| `MDV-17` | Una ruta absoluta se resuelve contra la raíz del workspace y sólo abre el visor cuando está dentro; una ruta fuera conserva su comportamiento en vez de abrir un visor que sólo puede informar que no existe | Arnéscer de `check.mjs` |
| `MDV-05` | Copiar y descargar entregan el contenido íntegro del documento | Validación manual |
| `MDV-06` | Cerrar y volver a abrir un documento restaura la posición de lectura | Validación manual |
| `MDV-08` | `md_preview` devuelve la ruta y el tamaño, y su tarjeta muestra el documento | Prueba del agente en una sesión real |
| `MDV-09` | Una imagen relativa del documento se muestra; una ruta fuera del workspace no se sirve | Validación manual y `curl` a la ruta con `..` |
| `MDV-10` | Tras reiniciar el proceso, el visor sigue disponible sin reinstalar nada | Reinicio del contenedor y validación manual |
| `MDV-11` | Ninguna ruta servida sale del workspace de la sesión | `curl` a `/md-viewer/<sesión>/../../etc/passwd` y variantes codificadas |
| `MDV-12` | `dsh --profile web --dump-config` compone la fila nueva sin error | Comando sobre el perfil desplegado |
| `MDV-13` | Las carpetas aparecen plegadas y se abren al pulsarlas; abrir un documento revela las carpetas que lo contienen | Arnéscer de `check.mjs` y validación manual |
| `MDV-14` | El índice no ocupa una columna en el teléfono: se abre como hoja sobre el documento | Arnéscer de `check.mjs` y validación manual |
| `MDV-15` | En el teléfono, ningún control del visor queda debajo del botón de menú del shell | Arnéscer de `check.mjs` (punto de corte `767` y banda de 58 px) y validación manual en el teléfono |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-DATA-01` y `MDL-VALID-01`.
- `MDL-LOCALE-01`: los textos del panel se publican en inglés y español y siguen la preferencia de idioma de la interfaz.
- `MDL-SEC-01`: el paquete no incorpora credenciales.
- Toda ruta servida queda cercada al workspace de la sesión con `fs.contains`, que también rechaza enlaces simbólicos que salgan de él.
- La maqueta de teléfono no puede cubrir el botón de menú del shell: la capa de superposición del visor queda por debajo de ese botón, así que el panel reserva su banda en lugar de competir por el z-index. El punto de corte y la banda se toman de `packages/client/ui-layout/src/client/columns.ts`.
- El paquete no publica servicios: consume `webServer`, `fs`, `tools` y `sessions`, así que su fila vive en el plano host sin `isolate`.
- La ruta `/md-viewer` tiene un solo dueño; no puede reutilizar `/html-viewer`.

## Implementación prevista

- `mdl/plugins/md-preview/host.mjs`: ruta `/md-viewer` con los extremos de listado, documento, respuesta del agente y activos, más la herramienta `md_preview`.
- `mdl/plugins/md-preview/client.js`: bundle de cliente con el botón de cabecera, el panel en `shell.overlay`, el índice, la tarjeta de `tool.call.toolview` y la acción de `conversation.chat.assistant-actions`.
- `mdl/plugins/md-preview/package.json` y `cordis.patch.yml`: manifiesto de paquete y capa que inserta la fila.
- `mdl/plugins/md-preview/install.sh`: publica el paquete dentro de `profiles/node_modules` del volumen, que es donde resuelve un nombre de fila, y aplica la fila al perfil.
- `mdl/docker/Dockerfile` y `mdl/docker/entrypoint.sh`: entregan el paquete a la imagen y lo instalan en cada arranque.

## Validación ejecutada

Entorno: contenedor `mdl-harness` sobre `main`, 2026-11-08, con el paquete publicado en `/data/dsh/profiles/node_modules/dsh-md-preview` mediante `install.sh`. La implementación llegó a `main` por los PR #9, #10 y #11.

El usuario confirmó en la GUI, en escritorio y en teléfono, que el visor lee los documentos, agrupa por carpeta, cambia de documento, copia, descarga y abre los enlaces a un `.md` desde la conversación. Las correcciones del 9 de noviembre (punto de corte y banda del menú, enlaces desde la conversación, rutas absolutas) se validaron en esa misma sesión de uso.

La evidencia reproducible es `mdl/plugins/md-preview/check.mjs`, que monta la mitad host sobre el `FileSystem` real (`@deepseek-ai/dsh-fs-local`) y ejecuta la mitad cliente dentro de un DOM de jsdom con una tabla de módulos simulada; las 49 comprobaciones pasan. La composición se validó además arrancando una instancia real de `dsh --profile web` sobre un `DSH_HOME` aislado en el puerto 3099.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| La fila compone y el arranque real la monta | Validado | `--dump-config` incluye `- id: md-preview`; el arranque aislado sirve `{"id":"dsh-md-preview","url":"/plugins/dsh-md-preview/client.js?rev=…"}` en `window.__DSH_BOOT__` y el bundle responde `200 text/javascript` con los bytes del archivo publicado |
| El host registra la ruta y la herramienta | Validado | Arnéscer: `routes: prefix:/md-viewer`, `tools: md_preview`; `POST` responde `405` |
| Listado del workspace sin `node_modules` ni enlaces que salen | Validado | Arnéscer: sólo `README.md` y `docs/guide.md`; un enlace simbólico a `/tmp/mdp-harness/outside.md` no aparece |
| Cercado de rutas | Validado | `__doc?path=../../etc/passwd` y su forma codificada → `The path cannot leave the session workspace.`; enlace que sale → `That path is outside the session workspace.`; activo que sale → `403 outside the workspace`; sesión desconocida → `404`; NUL → `403 forbidden path` en la ruta viva |
| Documento servido con su directorio y su título | Validado | Arnéscer: `README.md` → `dir: ""`, `title: "Title"`; `docs/guide.md` → `dir: "docs"` |
| Panel: abrir, listar, renderizar, imágenes e índice | Validado (uso real y arnéscer) | 13 comprobaciones del arnéscer: el botón abre el panel, la lista muestra el árbol, el Markdown se renderiza, `![logo](docs/img/logo.png)` llega como `http://127.0.0.1:3080/md-viewer/s1/docs/img/logo.png`, el índice lista `1:Project, 2:Install, 2:Usage` y su botón lo oculta |
| Maqueta de teléfono: una sola columna | Validado (uso real en teléfono) | El panel abre en la lista, elegir `guide.md` cambia al documento con su nombre y el botón de vuelta, el índice se abre como hoja y vuelve a la lista con la carpeta abierta |
| Árbol de carpetas plegado | Validado (uso real y arnéscer) | Al abrir sólo se ven `README.md` y la carpeta `docs` con `aria-expanded="false"`; abrirla muestra `guide.md` y la carpeta `deep`, y abrir `deep` muestra `api.md` |
| Maqueta ancha: árbol, índice y documento | Validado (uso real y arnéscer) | Con viewport ancho el panel vuelve a las tres columnas y a la barra de cinco botones |
| Enlace relativo entre documentos | Validado (uso real y arnéscer) | Pulsar el enlace a `README.md` cambia el documento en el panel y el índice pasa a `Project, Install, Usage` |
| Enlace a un documento desde fuera del panel | Validado (uso real y arnéscer) | Un ancla `docs/guide.md` colocada fuera del panel abre el visor; el botón `title="docs/guide.md"` también; un enlace `https://` y uno con `target="_blank"` no se interceptan, y un botón con el texto `Save as .md` tampoco |
| Ruta absoluta | Parcial: la ruta de fuera del workspace se validó en uso; la absoluta que sí está dentro, solo en el arnéscer | `/workspace/demo/docs/guide.md` abre el visor sobre `docs/guide.md`; `/srv/projects/homepage/test.md`, como enlace y como ficha, no se intercepta |
| Copiar y descargar | Validado (arnéscer) | El portapapeles recibe el documento íntegro y la etiqueta pasa a `Copied ✓`; la descarga usa el nombre del archivo |
| `md_preview`: tarjeta con el documento | Parcial | El arnéscer cubre la tarjeta; `Tool.listTools` confirma que la herramienta está registrada para el agente. Ningún agente la ha llamado, así que la tarjeta en una conversación real sigue sin observarse |
| Posición de lectura conservada | Pendiente | Nadie la ha ejercitado: cerrar un documento desplazado y volver a abrirlo. jsdom no calcula la maquetación, así que el arnéscer no puede cubrirla |
| Aspecto visual del Markdown real | Validado | El usuario leyó documentos con tablas, código y fórmulas en escritorio y en teléfono |
| El visor sobrevive al reinicio del proceso | Pendiente | La fila compone y el `install.sh` corre en cada arranque, pero nadie ha recreado el contenedor después de esta fase para observarlo |

## Resultado y pendientes

- Resultado: el lector está en uso. El paquete vive en el volumen, la fila compone en el perfil, el usuario lo valida en escritorio y en teléfono, y las tres correcciones que salieron de ese uso están en `main`.
- Pendientes: el salto desde el índice y la posición de lectura (MDV-03, MDV-06), la tarjeta de `md_preview` en una conversación real (MDV-08) y la observación tras recrear el contenedor (MDV-10). Ninguna se reporta como exitosa.
- Decisión de salida: en implementación hasta que se registren esos cuatro puntos; el producto ya es usable y está desplegado.
