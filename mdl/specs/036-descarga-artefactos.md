# SPEC-036 — Descarga de los artefactos generados

Estado: Validada
Fase: 36
Commit base: `33edd00411`
Aprobación: usuario en sesión Web, 2026-11-13 — «approved»

## Objetivo

Guardar en el dispositivo el HTML y el Markdown que el agente generó en el servidor, desde el mismo visor que ya los muestra, con el nombre y el tipo con que el archivo vive en el workspace.

## Contexto

Los dos visores ya sirven los bytes del workspace: `/md-viewer/<sesión>/<ruta>` y `/html-viewer/<sesión>/<ruta>` ([visor de Markdown](../plugins/md-preview/README.md), [visor de HTML](../plugins/html-preview/README.md)). Ninguna de las dos rutas declara `Content-Disposition`, así que el navegador muestra el archivo y nunca lo guarda.

El visor de Markdown sí ofrece un botón `Descargar`, y hace la descarga en el cliente con un `Blob` del texto que el visor ya tiene. Eso falla en dos casos reales: en un iPhone con la GUI instalada como app el guardado de un `Blob` no termina en un archivo útil, y un documento de más de 2 MB nunca llega al visor, porque `md-preview` rechaza lo que excede su límite de lectura, de modo que tampoco se puede descargar. El visor de HTML no tiene ninguna descarga: solo `Abrir ↗`, que abre una pestaña, y en un teléfono cuya GUI es una app instalada no hay chrome del navegador desde donde guardar.

Las dos rutas ya están cercadas a la raíz del workspace con `fs.contains`, y la lectura está permitida en todos los modos del sandbox, así que descargar no amplía ningún permiso: expone los mismos bytes que el visor ya muestra.

## Alcance

- Un parámetro `download` en la ruta cruda de cada visor: la respuesta añade `Content-Disposition: attachment` con el nombre base del archivo y conserva el `content-type` que la ruta ya calcula.
- El nombre viaja en `filename` y también en `filename*` con codificación RFC 5987, para que un archivo con acentos o eñes llegue con su nombre y no con un sustituto ASCII.
- Un botón `Descargar` en el visor de HTML, en las dos disposiciones que ya existen —la barra ancha y los iconos del teléfono— junto a `Abrir ↗`.
- El visor de Markdown deja de construir el `Blob` y descarga por la misma ruta; su botón se mantiene en las dos disposiciones.
- La descarga sirve cualquier archivo del workspace que la ruta ya sepa servir, no solo `.md` y `.html`: un log, un JSON o un CSV del workspace se bajan igual, sin una segunda ruta.

## Fuera del alcance

- Las tarjetas de herramienta del chat (`md_preview` y `html_preview`): se quedan como están y no ganan descarga.
- Comprimir en `.zip`, descargar una carpeta o el workspace entero.
- Los adjuntos de la conversación (`chat-files`), que ya tienen su propio circuito.
- Cambiar el límite de lectura de los visores: la descarga lo esquiva porque va por la ruta cruda, y el visor sigue negándose a renderizar lo que no cabe en memoria.
- Una ruta nueva, una fila de composición nueva o un bundle nuevo: el cambio vive en los dos bundles existentes y en su validación.
- Reanudar descargas, rangos HTTP o descargas en segundo plano.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `DL-01` | Descargar un `.md` devuelve el archivo completo con `Content-Disposition: attachment`, el nombre base y el tipo de Markdown | `check.mjs` de `md-preview`: la ruta con `download` comparada con el archivo en disco |
| `DL-02` | Descargar un `.html` devuelve el archivo completo con su nombre y `text/html` | `check.mjs` de `html-preview`: la misma comprobación sobre su ruta |
| `DL-03` | Un nombre con acentos o eñes llega codificado en `filename*` y decodificable | Ambos `check.mjs`: cabecera `Content-Disposition` de un archivo con acentos |
| `DL-04` | Un `.md` mayor que el límite de lectura del visor se descarga entero | `check.mjs` de `md-preview`: un documento por encima del límite, que el visor rechaza y la descarga entrega |
| `DL-05` | Una ruta fuera de la raíz sigue rechazada cuando pide descarga | Ambos `check.mjs`: travesía y enlace simbólico que sale del workspace, con `download` presente |
| `DL-06` | Sin el parámetro, la ruta responde exactamente como hoy | Ambos `check.mjs`: la misma petición sin `download` no lleva `Content-Disposition` |
| `DL-07` | El botón existe en la barra ancha y en los iconos del teléfono, y su texto está en inglés y español | Ambos `check.mjs`: el render en las dos disposiciones y en las dos locales |
| `DL-08` | Ningún color literal nuevo y los tres temas siguen legibles | Revisión de `client.js` y validación visual ([`MDL-THEME-01`](../PRODUCT_SPEC.md), [`MDL-THEME-02`](../PRODUCT_SPEC.md)) |

## Restricciones

- [`MDL-UPSTREAM-01`](../PRODUCT_SPEC.md): el cambio es aditivo y vive en `mdl/plugins/`, sin tocar `packages/` ni la composición.
- [`MDL-LOCALE-01`](../PRODUCT_SPEC.md): inglés y español, sin variante en chino.
- [`MDL-THEME-01`](../PRODUCT_SPEC.md) y [`MDL-THEME-02`](../PRODUCT_SPEC.md): el botón usa los tokens que ya usan sus vecinos; ningún color literal nuevo.
- [`MDL-ENV-01`](../PRODUCT_SPEC.md): el desarrollo no sustituye la GUI de `127.0.0.1:3080`; la validación usa la imagen reconstruida y el proceso propio.
- [`MDL-VALID-01`](../PRODUCT_SPEC.md): lo no ejecutado se registra como pendiente.
- La descarga es una lectura: no relaja el sandbox ni necesita aprobación, y la ruta conserva el cercado de `fs.contains` que ya tenía.
- `Content-Disposition` se construye solo con el nombre base del archivo resuelto, nunca con la ruta recibida, para que un nombre no pueda inyectar cabeceras.

## Implementación prevista

`mdl/plugins/md-preview` y `mdl/plugins/html-preview`: la ruta cruda de cada mitad de host reconoce el parámetro de descarga y añade la cabecera con el nombre base ya resuelto y cercado; el visor de Markdown sustituye su `downloadText` por un `<a download>` a esa ruta y el de HTML gana el botón junto a `Abrir ↗`, en las dos disposiciones. Los `check.mjs` de los dos bundles crecen con los requisitos de la tabla, los README de ambos se actualizan y el cambio lleva su nota de agente.

## Validación ejecutada

Ejecutada el 2026-11-13 en `main`, sobre el checkout `/srv/projects/deepseek-harness`. Los `check.mjs` de los dos bundles se ejecutan contra la copia publicada, así que ambos se publicaron primero con su `install.sh` en un `DSH_HOME` temporal (`/tmp/dl-check`) y se ejecutaron con ese mismo `DSH_HOME`; ninguna instalación del despliegue se tocó. `pnpm` no está en el `PATH` de este entorno.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `DSH_HOME=/tmp/dl-check node check.mjs` (`md-preview`) | Pasa | 57 de 57 comprobaciones |
| `DSH_HOME=/tmp/dl-check node check.mjs` (`html-preview`) | Pasa | 68 de 68 comprobaciones |
| `DL-01` (descarga de Markdown) | Pasa | El cuerpo es exactamente el archivo y la cabecera es `attachment; filename="README.md"; filename*=UTF-8''README.md`, con `content-type: text/markdown` |
| `DL-02` (descarga de HTML) | Pasa | La página llega entera con `text/html` y la misma forma de cabecera |
| `DL-03` (nombres con acentos) | Pasa | `informe-técnico.md` y `informe-técnico.html` viajan en `filename*` y decodifican a su nombre; el respaldo ASCII no lleva bytes fuera de rango |
| `DL-04` (documento sobre el límite) | Pasa | Un `.md` de 2 097 224 bytes se descarga completo, y `__doc` sigue negándose a renderizarlo |
| `DL-05` (cercado con descarga) | Pasa | La travesía no responde `200` y el enlace simbólico que sale del workspace responde `403`, con el parámetro presente |
| `DL-06` (sin el parámetro) | Pasa | La misma petición sin `download` devuelve el mismo cuerpo y ninguna cabecera `content-disposition` |
| `DL-07` (control en las dos disposiciones) | Pasa | El enlace existe en la barra ancha y en los iconos del teléfono, apunta a la ruta con `?download=1`, lleva el nombre del archivo y su texto está en inglés y en español («Descargar») en los dos visores |
| Extra: una carpeta descarga su propio `index.html` | Pasa | `?download=1` sobre una carpeta nombra el `index.html` que la ruta ya servía |
| `DL-08` (tokens) | Pasa | El control reutiliza las clases y tokens de sus vecinos y no introduce ningún color literal; el usuario confirmó la legibilidad en los temas claro, oscuro y sistema sobre el despliegue |
| `node --experimental-strip-types scripts/verify-agent-note-format.ts` | Pasa | 553 notas de agente conformes, incluida la nueva |
| `node --experimental-strip-types scripts/verify-md-wrap.ts` | Pasa | 948 archivos sin prosa partida |
| Bundle publicado en el despliegue | Pasa | `/plugins/dsh-html-preview/client.js` y `/plugins/dsh-md-preview/client.js` se sirven con `200` desde el proceso en marcha, y los archivos publicados en el perfil son los de este cambio |
| Corrección posterior: guardar en una app instalada | Pasa | Validado por el usuario en el iPhone: la primera versión dejaba la app en el archivo, sin forma de volver, y obligaba a reabrirla. Ahora `Abrir ↗` no se ofrece en una ventana instalada y `Descargar` entrega el archivo a la hoja de compartir, que vuelve a la app; `check.mjs` de los dos bundles prueba esa forma con un navegador `standalone` simulado, incluido el caso de la hoja cancelada |

| Compuertas de `doc-sync` que usan `pnpm` | Pendiente | `pnpm` ausente en el entorno del agente |

## Resultado y pendientes

- Resultado: implementado y verificado en los dos bundles. La cabecera, el nombre acentuado, la descarga por encima del límite del visor, el cercado con el parámetro presente y la respuesta sin él están comprobados por `check.mjs`; los dos bundles publicados a un `DSH_HOME` temporal son los que se ejecutaron.
- Corrección posterior al alcance: en una ventana instalada —la GUI en el teléfono— navegar hacia el archivo reemplazaba la aplicación y no había forma de volver, que es el defecto que el usuario reportó tras la primera entrega. Se corrigió dentro de esta misma fase porque es su regresión, y no con una fase nueva: `Abrir ↗` no se ofrece cuando la ventana está instalada, y `Descargar` entrega el archivo a la hoja de compartir en lugar de navegar. La regla la decide el render con `navigator.standalone` o `(display-mode: standalone)`, así que una pestaña de escritorio conserva la descarga simple y el enlace a la pestaña.
- Pendientes o excepciones aceptadas: las compuertas de `doc-sync` que necesitan `pnpm` no se ejecutaron en el entorno del agente, que no tiene `pnpm`; quedan para CI o para una máquina que lo tenga. La descarga en el teléfono instalado y la legibilidad en los tres temas las confirmó el usuario sobre el despliegue.
- Decisión de salida: la Fase 36 se cierra como Validada.
