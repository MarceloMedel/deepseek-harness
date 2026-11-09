# SPEC-023 — Visor de HTML generado dentro de la GUI

Estado: En implementación
Fase: 23
Aprobación para iniciar: usuario, 2026-11-09 — bundle versionado con fila en el perfil `web` para todas las sesiones, retirando el preset `html-preview`
Commit base: `HEAD de la rama personal al iniciar la fase`

## Objetivo

Ver renderizada una página HTML del workspace sin salir de la GUI: un panel flotante con las páginas de la sesión, la página elegida enmarcada sobre la conversación, una herramienta `html_preview` con su tarjeta, y las tres superficies sobreviviendo al reinicio del proceso y a la recreación del contenedor.

## Contexto

`SPEC-022` estableció el mecanismo que sobrevive a un reinicio: un paquete con mitad host y mitad cliente, publicado en `$DSH_HOME/profiles/node_modules`, montado por una fila de composición y reinstalado en cada arranque del contenedor. El visor de Markdown de esta misma línea lo usa para `/md-viewer`.

El visor de HTML anterior (`dsh-html-preview`) nunca tuvo fuentes en el repositorio: existía sólo como copia dentro del volumen y se montaba desde un preset, así que una recreación que lo perdiera no tenía de dónde recuperarlo, y su cliente escribía textos en español sin seguir la preferencia de idioma. Esta fase reemplaza esa copia por un paquete versionado en `mdl/plugins/html-preview/`, con fila en el perfil `web`, y retira el preset para que no haya dos dueños de la misma ruta.

El contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md).

## Alcance

- `HV-01` Un botón `HTML` en la cabecera de la sesión abre y cierra el visor.
- `HV-02` El visor flotante lista las páginas HTML del workspace de la sesión ordenadas por ruta, con las páginas `index.html` primero, y muestra la elegida en un marco.
- `HV-03` La página se sirve al marco con `srcdoc`, sus referencias relativas (`src`, `href`, `poster` y `url()` en CSS) reescritas a la ruta del visor y un `<base>` que nombra su directorio en esa ruta, para que una página que usa una hoja de estilos, un script, una imagen o un JSON vecino se vea completa, incluido lo que el propio script construye en tiempo de ejecución.
- `HV-04` `Abrir ↗` abre la página en su propia pestaña bajo una barra con «Volver a la GUI» y «Recargar»; el archivo se sirve por la ruta cruda, que refleja el árbol del workspace con sus tipos MIME, incluido el `index.html` de una carpeta, y una página abierta así nunca queda sin salida.
- `HV-05` Herramienta `html_preview` para que el agente abra una página, con tarjeta en la conversación que muestra la página renderizada.
- `HV-06` La maqueta sigue el ancho: por encima de 767 px conviven lista y página; por debajo el panel ocupa la ventana, muestra la lista primero y la página después con un botón de vuelta, y deja libres los primeros 58 px que el shell reserva para su botón de menú.
- `HV-07` Los textos del panel se publican en inglés y español y siguen la preferencia de idioma de la interfaz.
- `HV-08` El visor sobrevive al reinicio del proceso y a la recreación del contenedor, y su código fuente está versionado en el repositorio.
- `HV-09` Ninguna ruta servida sale del workspace de la sesión.

## Fuera del alcance

- Editar o guardar HTML desde el visor.
- Vista a pantalla completa dedicada o modo presentación.
- Recarga automática al cambiar el archivo en disco: el panel ofrece `Actualizar` (lista) y `Recargar` (marco).
- Ejecutar una página suelta fuera del workspace, o servir rutas que no existan.
- Vista previa de Markdown: la posee `dsh-md-preview` en `/md-viewer`.
- Inspeccionar el HTML como texto o abrirlo en un editor.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `HVV-01` | El botón abre el visor y la lista muestra las páginas del workspace con las `index.html` primero | Arnéscer de `check.mjs` y validación manual |
| `HVV-02` | Una página con hoja de estilos, script, imagen y JSON vecinos se ve completa dentro del marco | Validación manual con una página de varias piezas |
| `HVV-03` | `Abrir ↗` sirve la página original con su tipo MIME y sus activos; una carpeta sirve su `index.html` | `curl` a la ruta y validación manual |
| `HVV-04` | `html_preview` devuelve ruta y tamaño, y su tarjeta muestra la página | Arnéscer de `check.mjs` y validación manual |
| `HVV-10` | `Abrir ↗` muestra la página con una barra que vuelve a la GUI, y un destino de vuelta de otro host se descarta | Arnéscer de `check.mjs` y validación manual |
| `HVV-05` | En el teléfono el panel ocupa la ventana, abre en la lista, cambia a la página con un botón de vuelta y no tapa el botón de menú del shell | Arnéscer de `check.mjs` (punto de corte `767` y banda de 58 px) y validación manual en el teléfono |
| `HVV-06` | Los textos siguen la preferencia de idioma: inglés y español, sin chino | Arnéscer de `check.mjs` sobre la tabla de textos y validación manual |
| `HVV-07` | Tras reiniciar el proceso el visor sigue disponible sin reinstalar nada | Reinicio del contenedor y validación manual |
| `HVV-08` | Ninguna ruta servida sale del workspace de la sesión | Arnéscer de `check.mjs` con recorrido, forma codificada y enlace simbólico; `curl` a la ruta viva |
| `HVV-09` | `dsh --profile web --dump-config` compone la fila nueva sin error, y el preset `html-preview` ya no existe | Comando sobre el perfil desplegado |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-DATA-01` y `MDL-VALID-01`.
- `MDL-LOCALE-01`: los textos del panel se publican en inglés y español y siguen la preferencia activa de la interfaz.
- `MDL-SEC-01`: el paquete no incorpora credenciales.
- `MDL-DATA-01`: el paquete se publica en el volumen y el arranque del contenedor lo reinstala, así que configuración, proyectos y estado sobreviven al reinicio y a la recreación.
- Toda ruta servida queda cercada al workspace de la sesión con `fs.contains`, que también rechaza enlaces simbólicos que salgan de él.
- El paquete no publica servicios: consume `webServer`, `fs`, `tools` y `sessions`, así que su fila vive en el plano host sin `isolate`.
- Una sola ruta `/html-viewer` con un solo dueño: la fila del perfil es la única que monta el paquete, y el preset que también lo montaba se retira en esta fase.
- La maqueta de teléfono no puede cubrir el botón de menú del shell: la capa de superposición del visor queda por debajo de ese botón, así que el panel reserva su banda en lugar de competir por el z-index. El punto de corte y la banda se toman de `packages/client/ui-layout/src/client/columns.ts`.
- El marco no lleva `sandbox`: la página se ejecuta en el origen de la GUI, igual que abierta en una pestaña, para que sus scripts y sus peticiones funcionen. El contenido es un archivo del workspace de la sesión, escrito por el agente o por el usuario.

## Implementación prevista

- `mdl/plugins/html-preview/host.mjs`: ruta `/html-viewer` con listado, documento reescrito para `srcdoc` y bytes crudos del árbol del workspace, más la herramienta `html_preview`.
- `mdl/plugins/html-preview/client.js`: bundle de cliente con el botón de cabecera, el visor en `shell.overlay` y la tarjeta de `tool.call.toolview`.
- `mdl/plugins/html-preview/package.json` y `cordis.patch.yml`: manifiesto de paquete y capa que inserta la fila.
- `mdl/plugins/html-preview/install.sh`: publica el paquete dentro de `profiles/node_modules` del volumen y aplica la fila al perfil.
- `mdl/plugins/html-preview/check.mjs`: arnéscer de las dos mitades sin navegador.
- `mdl/docker/Dockerfile` y `mdl/docker/entrypoint.sh`: entregan el paquete a la imagen y lo instalan en cada arranque.

## Validación ejecutada

Entorno: contenedor `mdl-harness` sobre `main`, 2026-11-09, con el paquete publicado en `/data/dsh/profiles/node_modules/dsh-html-preview` mediante `install.sh` y la fila añadida a `/data/dsh/profiles/web/cordis.patch.yml`. El preset `html-preview` se movió a `/data/dsh/retired/agent-preset-html-preview`, fuera del directorio que el roster escanea.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `HVV-01` listado con `index.html` primero | Validado (arnéscer) | `check.mjs`: la lista devuelve `index.html,site/index.html,docs/other.html`; `node_modules` y un `.md` quedan fuera |
| `HVV-02` página con hoja de estilos, script, imagen y `url()` vecinos | Validado (arnéscer); pendiente la pintura en el navegador | `check.mjs`: `href="style.css"`, `src="app.js"`, `src="img/a.png"` y `url(img/a.png)` llegan como `/html-viewer/s1/…`; una referencia remota, `data:` y `#top` quedan intactas; una página anidada rebasa `../img/a.png` a la raíz; el `<base>` inyectado apunta a `/html-viewer/s1/` o `/html-viewer/s1/docs/`, y el `<base>` que declara una página se rebasa sin duplicarse |
| `HVV-03` ruta cruda con su tipo MIME y `index.html` de carpeta | Validado (arnéscer) | `check.mjs`: `text/css; charset=utf-8` para la hoja, la fuente de `index.html` llega sin reescribir y `/html-viewer/s1/site` devuelve la página de entrada |
| `HVV-10` barra del documento abierto | Validado (arnéscer); pendiente el teléfono real | `check.mjs`: `__page` responde `text/html`, enmarca la ruta cruda, enlaza el destino de vuelta recibido y escribe «Volver a la GUI»; un destino de otro host cae a `/`; una ruta inválida se informa en la barra en lugar de enmarcarse |
| `HVV-04` `html_preview` y su tarjeta | Validado (arnéscer); pendiente una llamada real del agente | `check.mjs`: la herramienta se registra como `html_preview`, la tarjeta lee la ruta de la llamada y enmarca la página |
| `HVV-05` maqueta de teléfono | Validado (uso real en teléfono y arnéscer) | `check.mjs`: punto de corte `(max-width: 767px)`, `padding:calc(58px + env(safe-area-inset-top, 0px))`, la lista abre primero, elegir una página cambia al panel del documento y el botón de vuelta regresa |
| `HVV-06` inglés y español | Validado (arnéscer) | `check.mjs`: la tabla de textos, el cambio a `es` en la tarjeta y la caída a inglés para un idioma sin copia |
| `HVV-07` reinicio del proceso | Validado | El usuario reinició el contenedor `cfe0d292883d` y el visor quedó disponible sin reinstalar nada: la fila del perfil, el paquete del volumen y su bundle de cliente llegaron al proceso nuevo |
| `HVV-08` cercado al workspace | Validado (arnéscer) | `check.mjs`: recorrido, forma codificada, enlace simbólico que sale, NUL → `403`, sesión desconocida → `404`, método de escritura → `405` |
| `HVV-09` composición y retiro del preset | Validado | `--dump-config` sobre el perfil desplegado incluye `- id: html-preview` y `- id: md-preview`; `/data/dsh/.agent-presets` queda vacío y el preset vive en `/data/dsh/retired/` |

`check.mjs` reporta 57/57 comprobaciones correctas sobre la copia publicada. Un arranque real aislado (`DSH_HOME=/tmp/hp-verify`, puerto 3099, `install.sh` sobre ese home) montó la fila sin avisos: `window.__DSH_BOOT__` publica `dsh-html-preview` con su `rev`, `/plugins/dsh-html-preview/client.js` responde `200 text/javascript` y `/html-viewer/nope/__list` responde `404 text/plain` en lugar de la SPA, que es la prueba de que la ruta tiene dueño.

## Resultado y pendientes

- Resultado: el visor está versionado, publicado en el volumen, montado por la composición y en uso tras reiniciar el contenedor. El uso en el teléfono mostró que la página abierta con `Abrir ↗` quedaba sin salida; se corrigió con un documento propio que la enmarca bajo una barra con «Volver a la GUI».
- Pendientes: la pintura de una página de varias piezas en el navegador (`HVV-02`, validada sólo por el arnéscer) y una llamada real del agente a `html_preview` (`HVV-04`). El uso real cubrió el reinicio, la maqueta de teléfono y el listado.
- Decisión de salida: en implementación hasta que el usuario confirme en el navegador la página de varias piezas y la barra del documento abierto.
