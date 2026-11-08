# SPEC-021 — Bundles de plugin: lo que el navegador descarga antes de usarlo

Estado: En implementación
Fase: 21
Aprobación para iniciar: usuario, 2026-11-08 — aprobada la variante de montaje perezoso de filas tras descartar el troceado dentro de un bundle
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
- `B2` Montar las filas del cliente cuando su superficie se necesita, no cuando arranca el shell: una fila marcada como diferible no se materializa hasta que algo pide su servicio o su slot, y su bundle se descarga en ese momento.
- `B3` Elegir qué filas son diferibles con la tabla de `B1` y el grafo de servicios y slots: una fila que otra necesita en el arranque no puede diferirse, y el criterio queda registrado fila por fila.
- `B4` Servir una sola copia de los ayudantes compartidos que hoy entran en varios bundles (`clsx` en 12 de 33), sólo si `B1` demuestra que el ahorro supera el costo de un chunk compartido; si no, registrarlo como no rentable y no hacerlo.
- `B5` Mantener la semántica de caché de [SPEC-018](018-payload-cliente.md): todo chunk nuevo lleva hash en el nombre y responde inmutable; ningún chunk depende de la sesión.
- `B6` Medir antes y después en el navegador, con caché vacía, la primera carga y la carga del arranque de una sesión.

## Fuera del alcance

- Diferir el chunk `vendor` del primer render: [SPEC-020](020-diferir-chunk-vendor.md) lo posee.
- Comprimir con brotli o cambiar de servidor: no hay módulo brotli en `nginx-light` de Debian, y esa decisión pertenece a [SPEC-018](018-payload-cliente.md) si alguna vez se reabre.
- Extender el contrato de bundles a varios archivos por plugin (salida ESM con chunks, rutas nuevas en el host y resolución de chunks en la fábrica): queda como alternativa si el montaje perezoso no alcanza, y se especifica por su cuenta.
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
| `PLG-09` | Una fila diferida se materializa cuando algo pide su servicio o su slot, y una que el arranque necesita nunca se difiere | Pruebas del cliente y `test:web` en replay: cada superficie de una fila diferida sigue apareciendo al abrirse |
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

## Hallazgo que reencuadró el alcance

`B2` suponía que un bundle de cliente podía partirse en varios archivos. No puede, en el contrato actual:

- `packages/client/tsdown.client.ts` emite cada bundle como **un solo archivo CommonJS** llamado `client.js`, envuelto en `window.__ModuleLoader__.load({ id, factory })`, con los módulos de plataforma resueltos por el `require` que inyecta la tabla de módulos. Un import dinámico propio no tiene dónde emitirse.
- `packages/client/modules/src/index.ts` sirve exactamente dos rutas por plugin, `/plugins/<id>/client.js` y `/plugins/<id>/client.js.map`; cualquier otro archivo bajo `/plugins/` responde `404`.

Partir un bundle exige, entonces, extender ese contrato en tres piezas a la vez: salida ESM con chunks con hash en `tsdown.client.ts`, rutas adicionales en el servidor de bundles del host, y una forma de que la fábrica pida sus chunks sin perder la resolución de externos por tabla. No es una configuración de build.

Al verificar la otra mitad del diagnóstico, la duplicación tampoco sostiene un atajo: los wire layers que el build permite inline (sesión, herramientas, `host-apiproxy`, marca) casi no aparecen en los bundles (`SESSION_FORMAT_VERSION` en 0 de 33, `dsh/tools` en 0 de 33, `brand` en 10 con sólo constantes), así que los 350–440 KB de los cuatro grandes son código propio de sus vistas, no copias de dependencias.

Con eso, la única palanca que queda es no descargar el bundle de una fila que el usuario no abrió, es decir el **montaje perezoso de filas del Loader**. La alternativa intermedia —partir un paquete grande en dos paquetes de plugin, núcleo y detalle— tampoco sirve mientras todas las filas se monten al arrancar: el segundo bundle se descargaría igual. La decisión del usuario fue implementar ese montaje perezoso en esta fase y dejar la extensión del contrato de bundles como alternativa posterior.

## Validación ejecutada

Línea base medida antes de empezar (`2026-11-08`, contenedor `mdl-harness:local`, Chromium `131.0.6778.33`, caché vacía). El resto se completa después del desarrollo.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Línea base de la primera carga | 1 183 377 B (1155,6 KB) en 70 peticiones | Registrada en [SPEC-018](018-payload-cliente.md#validación-ejecutada): shell 344,2 KB, plugins 745,1 KB en 37 peticiones, `/api` 45,3 KB, icono 17,5 KB |
| Línea base del roster | 733,0 KB en 38 entradas; 9 marcadas `immediately` (249,4 KB) | `curl` con `Accept-Encoding: gzip` contra el contenedor, entrada por entrada de `window.__DSH_BOOT__` |
| Línea base del inventario | 2 511 KB sin comprimir en 33 bundles; los cuatro mayores son el 60% | `stat` sobre `packages/client/*/lib/client.js` dentro de la imagen |
| Línea base de la recarga | 88 785 B (86,7 KB) | Segunda carga en el mismo contexto de navegador |
| `B2` mecanismo de montaje por fila | **Implementado** | `dsh.client.surface` viaja hasta la fila del grafo; el kernel no crea esas entradas y monta las de la superficie cuando un consumidor llama a `ctx.clientSurfaces.open(nombre)` (`packages/client/web/src/surfaces.ts`). Declarar `surface` e `immediately` juntas falla el escaneo |
| `B3` filas diferibles | 6 filas en dos superficies | Superficie `settings`: `ui-settings-models`, `ui-settings-plugins`, `ui-settings-plugin-inventory`, `ui-agent-preset` y `ui-permission-presets`. Superficie `trajectory`: `ui-trajectory` (74,8 KB, la mayor palanca individual). `ui-model-selection` y `ui-directory-picker-browse` quedan en el arranque porque llenan el compositor y el sidebar |
| Pestaña de una superficie diferida | **Aprobada** | El anillo de vistas de la conversación proyecta una pestaña para la trayectoria mientras la superficie existe y ninguna entrada reclama el id (`surfaceViewOf`), con la etiqueta del catálogo `common`; al seleccionarla, el cuerpo monta la fila y muestra la espera, y la entrada real toma la pestaña. Verificado en navegador: la pestaña aparece con el bundle sin descargar, al seleccionarla se pide **sólo** `ui-trajectory` (75,7 KB) y la vista muestra su contenido, con **una sola** pestaña y sin errores de consola |
| `PLG-04` una vista no arrastra a las demás | **Aprobada** | Con caché vacía: al arrancar se piden **33** bundles y **0** de la superficie; al abrir Ajustes se piden exactamente los **5** y el panel muestra sus secciones (Modelos, Plugins, Presets de agente, Permisos); la segunda apertura no pide ninguno (**10,5 KB** de revalidación) |
| `PLG-02` primera carga ≤700 KB | **No se cumple** | **987,1 KB** (1 010 840 B) en 58 peticiones contra **1155,6 KB** de la línea base. Con sólo la superficie `settings`: 1055,2 KB |
| `PLG-03` plugins en el arranque ≤400 KB | **No se cumple** | **596,9 KB** en 31 peticiones (745,1 KB y 37 peticiones en la línea base). Cumple el techo de `WEB-02` (≤700 KB), no el objetivo de esta fase |
| `PLG-05` comportamiento igual | Aprobada en lo ejecutado | `vitest run packages/client packages/host/frontend-static`: **249 archivos y 3393 pruebas en verde**. En navegador: el panel de ajustes abre, cambia de sección, cierra con Escape y con el botón; la pestaña de trayectoria monta su vista; ninguna consola emite errores |
| `PLG-09` contrato de activación por fila | Aprobada | `packages/client/web/tests/surfaces.client.spec.ts` (secuencia, intento compartido, superficie desconocida, filas fallidas, reintento) y `settings-root.client.spec.tsx` (el panel espera el montaje; un fallo abre el panel y queda ruidoso en consola) |
| `PLG-06` recarga con caché tibia | Parcial | La segunda apertura de Ajustes no pide bundles (10,5 KB); la recarga completa no se remedió en esta corrida |
| `PLG-07` chunks inmutables | No ejecutada | Los bundles de superficie usan la misma ruta `/plugins/<id>/client.js` con `no-cache` y `ETag` de `SPEC-018`; no hay archivos nuevos que declarar inmutables |
| `PLG-08` medición antes y después | Aprobada | Antes: 1155,6 KB / 745,1 KB (37 bundles, commit `07bbe0d6e1`). Después: 1055,2 KB / 671,4 KB (32 bundles, servidor del checkout con el árbol de trabajo de esta fase) |
| `PLG-01` atribución por módulo | Parcial | Inventario por paquete completo (33 bundles, 2511 KB, los cuatro mayores son el 60%). La atribución por módulo se hizo sobre el chunk `vendor` del shell con su sourcemap (KaTeX 36,7%, pila de shiki 27%, pipeline de markdown 21%), que es lo que consume [SPEC-020](020-diferir-chunk-vendor.md); los bundles de plugin no emiten metafichero |
| Compuerta de navegador del repositorio | **No utilizable como compuerta** | 46 de los 70 archivos de `apps/web/tests/*.e2e.ts` siguen buscando la copia china que retiró [SPEC-019](019-idiomas-en-es.md); las pruebas de ajustes fallan por eso, no por esta fase |

## Resultado y pendientes

- Resultado: mecanismo implementado y dos superficies diferidas (6 filas). La primera carga baja de **1155,6 a 987,1 KB** (−14,6%) y los plugins del arranque de **745,1 a 596,9 KB** (−20%), que deja `WEB-02` bajo su techo; `PLG-02` y `PLG-03` no se cumplen.
- Lo que falta para el objetivo no es más mecanismo sino más superficies: los tres bundles mayores (conversación, runtime y conexión) siguen en el arranque porque llenan la primera pantalla.
- La pestaña de una fila diferida no se pierde: la conversación la proyecta mientras la superficie existe y el id está libre, y la entrada real la reemplaza al montar. El patrón se repite para cualquier vista futura que se difiera.
- Pendientes o excepciones aceptadas: la compuerta de navegador del repositorio no se puede usar hasta migrar sus localizadores al español; la atribución por módulo necesita un metafichero que el build de bundles no emite.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Nace de `SPEC-018`, que registró los dos objetivos incumplidos, y va antes de [SPEC-020](020-diferir-chunk-vendor.md): el chunk `vendor` son 180,7 KB de la primera carga y los bundles de plugin son 745,1 KB.
- La compresión con brotli queda descartada por la imagen, no por preferencia: `nginx-light` de Debian no trae el módulo.
