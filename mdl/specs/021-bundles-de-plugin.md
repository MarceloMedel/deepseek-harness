# SPEC-021 — Bundles de plugin: lo que el navegador descarga antes de usarlo

Estado: Borrador — el alcance necesita re-aprobación: el mecanismo de `B2` no existe en el contrato actual de bundles
Fase: 21
Commit base: `07bbe0d6e1`

## Objetivo

Que una primera visita al teléfono descargue el código de las superficies que muestra, no el de las 33 que la composición monta, y que la primera carga baje de 1155,6 KB a 700 KB o menos sin cambiar nada de lo que el usuario ve.

## Contexto

[SPEC-018](018-payload-cliente.md) midió la primera carga con navegador real y cerró el diagnóstico del transporte: `gzip`, caché inmutable por nombre con hash, `ETag` con `304` y fuentes `woff2` funcionan, y una recarga cuesta 86,7 KB. Lo que no cerró son sus dos objetivos de transferencia, porque el peso no está en el shell sino en los bundles de plugin que el shell pide al arrancar.

Mediciones contra el contenedor, Chromium `131.0.6778.33`, caché vacía:

- Primera carga: **1 183 377 B (1155,6 KB)** en 70 peticiones. Shell y CSS **344,2 KB**, bundles de plugin **745,1 KB en 37 peticiones**, `/api` 45,3 KB en 25 llamadas, icono 17,5 KB, documento 2,9 KB.
- Roster de `window.__DSH_BOOT__`: **38 entradas**; por `curl`, **733,0 KB**. Sólo **9** están marcadas `immediately` y suman 249,4 KB, así que el resto se descarga igual: `packages/client/web/src/boot.tsx` crea una entrada del Loader por cada fila del manifiesto y materializarla importa su bundle para obtener la fábrica. La marca `immediately` adelanta la carga; no la limita.
- Inventario en la imagen: **2 511 KB sin comprimir en 33 bundles** de `packages/client/*/lib/client.js`. Cuatro concentran el 60%: `ui-conversation` 439 KB, `runtime` 381 KB, `ui-trajectory` 350 KB, `connection` 342 KB. Siguen `ui-settings-models` 127 KB y `ui-workspace` 109 KB.
- La duplicación entre bundles es menor de lo que sugiere el número de paquetes: React, KaTeX y shiki no están embebidos en ningún bundle de feature (0 apariciones de `Symbol.for("react.element")` y de `katex`; shiki sólo en `connection`). Lo que sí se repite son ayudantes pequeños: `clsx` aparece en 12 de 33 bundles.
- El servidor no puede comprimir mejor de lo que comprime: `nginx -V` de la imagen confirma `--with-http_gzip_static_module` y **ningún módulo brotli**, y Debian no empaqueta uno para `nginx-light`. `gzip_static` cambia CPU por bytes, no el algoritmo.

El objetivo de `WEB-01` (≤400 KB) no es alcanzable sólo con esta fase ni con [SPEC-020](020-diferir-chunk-vendor.md): con el chunk `vendor` fuera de la ruta crítica quedarían ≈975 KB, y llegar a 400 KB exige además que el arranque no pida el código de ninguna superficie que el usuario no abrió. Esta fase fija ese mecanismo y su medición; la cifra final se registra al validarla.

## Alcance

- `B1` Atribuir los bytes: tabla por paquete y por módulo de los cuatro bundles mayores, generada desde el metafichero del build, registrada en la validación.
- `B2` Partir cada bundle grande donde su propio código ya distingue superficies: un import dinámico dentro del paquete cliente para el código que sólo alcanza una vista concreta (detalle de trayectoria, ajustes de modelos, selector de carpetas), de modo que se emita un chunk propio con hash y se pida al abrir esa vista.
- `B3` Revisar el roster de arranque con la tabla de `B1` y retirar del arranque el código que ninguna superficie inicial usa, empezando por los paquetes cuyo bundle completo se activa al abrir un panel de ajustes.
- `B4` Servir una sola copia de los ayudantes compartidos que hoy entran en varios bundles (`clsx` en 12 de 33), sólo si `B1` demuestra que el ahorro supera el costo de un chunk compartido; si no, registrarlo como no rentable y no hacerlo.
- `B5` Mantener la semántica de caché de [SPEC-018](018-payload-cliente.md): todo chunk nuevo lleva hash en el nombre y responde inmutable; ningún chunk depende de la sesión.
- `B6` Medir antes y después en el navegador, con caché vacía, la primera carga y la carga del arranque de una sesión.

## Fuera del alcance

- Diferir el chunk `vendor` del primer render: [SPEC-020](020-diferir-chunk-vendor.md) lo posee.
- Comprimir con brotli o cambiar de servidor: no hay módulo brotli en `nginx-light` de Debian, y esa decisión pertenece a [SPEC-018](018-payload-cliente.md) si alguna vez se reabre.
- Volver perezoso el montaje de las filas del Loader (no crear una entrada hasta que su superficie se abra). Es la palanca que más se acerca a 400 KB y también la que cambia el modelo de composición: merece su propia especificación con el análisis de servicios y slots que exige.
- Reducir el conjunto de gramáticas de shiki ni retirar features de la interfaz.
- Cachear en un service worker.
- Cambiar el texto, el diseño o el comportamiento de las superficies: esta fase mueve bytes, no producto.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `PLG-01` | La atribución de bytes por paquete y módulo queda registrada | Metafichero del build de los bundles de cliente, tabulado en la validación |
| `PLG-02` | La primera carga transfiere ≤700 KB con caché vacía | Panel de red con navegador real contra el contenedor reconstruido |
| `PLG-03` | Los bundles pedidos al arrancar suman ≤400 KB | Panel de red con una sesión recién abierta, sin abrir paneles |
| `PLG-04` | Abrir una vista concreta no descarga los bundles de las demás | Panel de red: abrir sólo la conversación y comprobar que no aparecen los bundles de ajustes |
| `PLG-05` | La interfaz se comporta igual: mismas superficies, mismo contenido | `test:gui`, `DSH_SNAPSHOT=replay pnpm run test:web` y `test:snapshot` |
| `PLG-06` | La recarga con caché tibia no empeora | Panel de red: ≤86,7 KB, la cifra registrada en [SPEC-018](018-payload-cliente.md) |
| `PLG-07` | Cada chunk nuevo es inmutable y con hash | `curl -I` sobre el chunk: `cache-control: public, max-age=31536000, immutable` |
| `PLG-08` | La transferencia queda registrada antes y después | Tabla con las dos mediciones y el commit de cada una |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DATA-01`, `MDL-UPSTREAM-01` y `MDL-VALID-01`.
- Rigen las reglas de [packages/client/AGENTS.md](../../packages/client/AGENTS.md): el código partido sigue siendo del mismo paquete y no introduce imports entre paquetes cliente; las superficies siguen componiéndose por slots.
- Un import dinámico dentro de un bundle de cliente no puede cambiar el orden de registro de slots ni hacer que una superficie dependa de que otra se haya abierto antes.
- El cambio es visible para el usuario en cuanto a tiempo de carga: exige el GIF de demostración grabado del servidor real, como pide la política del repositorio.
- Toda cifra se mide con navegador real y contra el contenedor; las mediciones por `curl` no ven el roster completo y por eso `SPEC-018` no lo detectó antes.

## Implementación prevista

- `packages/client/*/tsdown.config.ts`: configuración de partición de los bundles que `B1` señale.
- `packages/client/ui-conversation`, `ui-trajectory`, `ui-settings-models`, `ui-workspace` y `ui-directory-picker-browse`: imports dinámicos en el punto donde su propia vista se monta.
- `packages/client/web/src/boot.tsx`: sólo si `B3` demuestra que una fila puede dejar de importarse al arrancar.
- `apps/web/vite.config.ts`: ajustes de partición que impidan que un chunk compartido vuelva a entrar en la ruta crítica.
- `mdl/ROADMAP.md`: fila de la fase al validar, según `SPEC-000`.

## Hallazgo que bloquea el alcance aprobado

`B2` suponía que un bundle de cliente podía partirse en varios archivos. No puede, en el contrato actual:

- `packages/client/tsdown.client.ts` emite cada bundle como **un solo archivo CommonJS** llamado `client.js`, envuelto en `window.__ModuleLoader__.load({ id, factory })`, con los módulos de plataforma resueltos por el `require` que inyecta la tabla de módulos. Un import dinámico propio no tiene dónde emitirse.
- `packages/client/modules/src/index.ts` sirve exactamente dos rutas por plugin, `/plugins/<id>/client.js` y `/plugins/<id>/client.js.map`; cualquier otro archivo bajo `/plugins/` responde `404`.

Partir un bundle exige, entonces, extender ese contrato en tres piezas a la vez: salida ESM con chunks con hash en `tsdown.client.ts`, rutas adicionales en el servidor de bundles del host, y una forma de que la fábrica pida sus chunks sin perder la resolución de externos por tabla. No es una configuración de build.

Al verificar la otra mitad del diagnóstico, la duplicación tampoco sostiene un atajo: los wire layers que el build permite inline (sesión, herramientas, `host-apiproxy`, marca) casi no aparecen en los bundles (`SESSION_FORMAT_VERSION` en 0 de 33, `dsh/tools` en 0 de 33, `brand` en 10 con sólo constantes), así que los 350–440 KB de los cuatro grandes son código propio de sus vistas, no copias de dependencias.

Con eso, la única palanca que queda es no descargar el bundle de una fila que el usuario no abrió, es decir el **montaje perezoso de filas del Loader** que este documento había dejado fuera de alcance por costo. La alternativa intermedia —partir un paquete grande en dos paquetes de plugin, núcleo y detalle— tampoco sirve mientras todas las filas se monten al arrancar: el segundo bundle se descargaría igual.

## Validación ejecutada

Línea base medida antes de empezar (`2026-11-08`, contenedor `mdl-harness:local`, Chromium `131.0.6778.33`, caché vacía). El resto se completa después del desarrollo.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Línea base de la primera carga | 1 183 377 B (1155,6 KB) en 70 peticiones | Registrada en [SPEC-018](018-payload-cliente.md#validación-ejecutada): shell 344,2 KB, plugins 745,1 KB en 37 peticiones, `/api` 45,3 KB, icono 17,5 KB |
| Línea base del roster | 733,0 KB en 38 entradas; 9 marcadas `immediately` (249,4 KB) | `curl` con `Accept-Encoding: gzip` contra el contenedor, entrada por entrada de `window.__DSH_BOOT__` |
| Línea base del inventario | 2 511 KB sin comprimir en 33 bundles; los cuatro mayores son el 60% | `stat` sobre `packages/client/*/lib/client.js` dentro de la imagen |
| Línea base de la recarga | 88 785 B (86,7 KB) | Segunda carga en el mismo contexto de navegador |
| `PLG-01` a `PLG-08` | No ejecutadas | Pendiente: requieren desarrollo |
| Pendiente | No ejecutada | Pendiente |

## Resultado y pendientes

- Resultado: pendiente.
- Estimación: 745,1 KB de plugins en el arranque y 1155,6 KB de primera carga, contra 400 KB y 700 KB de `SPEC-018`; el techo alcanzable sin volver perezoso el montaje de filas se mide en esta fase.
- Pendientes o excepciones aceptadas: ninguno por defecto.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Nace de `SPEC-018`, que registró los dos objetivos incumplidos, y va antes de [SPEC-020](020-diferir-chunk-vendor.md): el chunk `vendor` son 180,7 KB de la primera carga y los bundles de plugin son 745,1 KB.
- La compresión con brotli queda descartada por la imagen, no por preferencia: `nginx-light` de Debian no trae el módulo.
