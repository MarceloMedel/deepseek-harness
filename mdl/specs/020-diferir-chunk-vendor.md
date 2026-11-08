# SPEC-020 — Diferir el chunk `vendor` del primer render

Estado: En implementación
Fase: 20
Aprobación para iniciar: usuario, 2026-11-08 — aprobada después de medir la primera carga con navegador real, e iniciada a continuación
Commit base: `ac1643ba89`

## Objetivo

Sacar KaTeX, shiki y el pipeline de markdown de la ruta crítica del primer render, de modo que el shell pinte sin esperar los 727 KB del chunk `vendor`, sin cambiar lo que el usuario ve.

## Contexto

`SPEC-018` redujo el payload con compresión, caché y formatos de fuente, y midió en el contenedor: un bundle de plugin transfiere 11 606 bytes con `gzip` y los assets con hash son inmutables. Quedó fuera de su alcance la pieza más grande de la primera carga: el chunk `vendor` (727 KB sin comprimir) contiene KaTeX, shiki y el pipeline de markdown, y `index` lo importa de forma estática, así que bloquea el primer render aunque el usuario no vea una fórmula ni un bloque resaltado hasta el primer mensaje.

La medición de esa ruta necesita un navegador: la ganancia es de tiempo hasta el primer pintado, no de bytes descargados, y el riesgo es de render — matemática y resaltado son el resultado de un pipeline incremental que hoy se inicializa con el shell.

## Alcance

- `V1` Convertir las dependencias de render (KaTeX, shiki y el pipeline de markdown) en cargas diferidas que el primer mensaje dispara, dejando el arranque del shell sin ellas.
- `V2` Mantener el contrato de render incremental: un mensaje que llega mientras las dependencias cargan debe completarse, no perderse ni duplicarse.
- `V3` Conservar el conjunto de gramáticas de arranque (TypeScript, shell, JSON) como parte de la carga inicial, porque el primer bloque de código las necesita.
- `V4` Medir el tiempo hasta el primer pintado y el momento en que matemática y resaltado quedan disponibles, antes y después, en el contenedor.

## Fuera del alcance

- Reducir el conjunto de gramáticas de shiki (trabajo posterior con su propia medición).
- Cambiar el texto o el diseño de la conversación.
- Cachear en un service worker.
- Cualquier cambio de comportamiento del agente o del host.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `WEB-08` | La matemática y el resaltado se ven correctos con las dependencias diferidas | Mensaje con fórmula y bloque de código, claro y oscuro, en escritorio y 390 px |
| `V-01` | El primer render no espera los 727 KB | Panel de red: el chunk de render no aparece antes del primer pintado |
| `V-02` | Un mensaje en streaming se completa mientras las dependencias cargan | Conversación real desde el contenedor, sin contenido perdido ni duplicado |
| `V-03` | Los snapshots de la interfaz siguen pasando | `pnpm run test:snapshot` y `pnpm run test:web` |
| `V-04` | La ganancia queda registrada con su medición | Tiempo hasta el primer pintado antes y después, en el contenedor |

## Restricciones

- Se conservan `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-SEC-01`, `MDL-SEC-02` y `MDL-VALID-01`.
- El cambio es visible: exige el GIF de demostración grabado del servidor real, como pide la política del repositorio.
- La verificación necesita un navegador; `SPEC-018` registró por qué no se intentó sin uno.

## Implementación prevista

- `apps/web/vite.config.ts`: el chunk `vendor` deja de ser un import estático de `index`.
- `packages/client/ui-primitives/src/markdown/` y `src/highlight.ts`: cargas diferidas con su estado de carga.
- `apps/web/index.html`: sin cambios de precarga para el chunk diferido.
- `mdl/ROADMAP.md`: fila de la fase al validar, según `SPEC-000`.

## Validación ejecutada

Se completa después del desarrollo. Puntos de entrada confirmados al iniciar, para que la medición de `V-04` compare lo que hoy entra en la ruta crítica:

- `packages/client/ui-primitives/src/markdown/highlight.ts` importa `shiki/core`, `shiki/engine/javascript` y las tres gramáticas de arranque (`@shikijs/langs/typescript`, `/shellscript`, `/json`) de forma estática, así que el chunk `vendor` lo arrastra `index`.
- Los módulos de markdown de `packages/client/ui-primitives/src/markdown/` importan `micromark-core-commonmark`, `micromark-factory-space` y `micromark-util-*` de forma estática por el mismo motivo.
- `apps/web/vite.config.ts` asigna esos paquetes a `vendor` en `manualChunks` y `BOOT_GRAMMAR_FILES` conserva TypeScript, shell y JSON en ese chunk, que es lo que `V3` pide mantener.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Línea base de la primera carga | 1 183 377 B (1155,6 KB), de los cuales `vendor` son 180,7 KB | Panel de red con navegador real, registrado en [SPEC-018](018-payload-cliente.md#validación-ejecutada) |
| `V1` diferir KaTeX | **Aprobada** | El motor sale del grafo de chunks: `apps/web/vite.config.ts` lo minifica con esbuild y lo emite como `assets/engine/katex-<hash>.js`, y sustituye su URL en el shell; `ui-primitives/markdown/math-engine.ts` la importa en tiempo de ejecución y avisa su llegada. Un import dinámico no bastaba: (a) sin asignación manual el módulo cae igual dentro de `vendor`; (b) con chunk propio, `index` lo importa estáticamente; (c) sin `manualChunks` sí queda dinámico pero se pierde la partición `index`/`vendor`; (d) una segunda entrada resuelta dentro de `node_modules` hace que Rollup fusione `vendor` entero en ella |
| `V-01` el primer render no espera al motor | **Aprobada** | Panel de red con el contenedor: al arrancar se piden los chunks del shell y `vendor`, y **ninguna** petición a `/assets/engine/`; la primera fórmula dispara exactamente una |
| `WEB-08` matemática y resaltado correctos | **Aprobada** | Tras el mensaje con `$$E = mc^2$$`, el DOM tiene un nodo `.katex`, ningún `.katex-pending` y la cara aplicada es `KaTeX_Main`, es decir la hoja de estilos sigue llegando |
| `V-02` mensaje en streaming mientras carga | **Aprobada en la corrida manual** | El mensaje se completa y la fórmula se re-renderiza al llegar el motor; el cache del renderizador incremental incluye la versión del motor para que ese re-render ocurra |
| `V-04` ganancia registrada | **Aprobada, sin tiempo de pintado** | Medición de bytes: primera carga **987,1 → 910,1 KB**; `vendor` **180,73 → 103,13 kB** comprimidos; motor 267,66 kB / **75,3 kB** comprimidos. El tiempo hasta el primer pintado no se instrumentó en esta corrida |
| `V1` diferir el pipeline de markdown | No ejecutada | Sus consumidores son la ruta síncrona del renderizador incremental, así que necesita su propio diseño, no una copia del de KaTeX |
| `V-03` snapshots de la interfaz | No ejecutada | La compuerta de navegador del repositorio sigue sin poder correr (localizadores en chino, ver [SPEC-021](021-bundles-de-plugin.md)) |

## Resultado y pendientes

- Resultado: KaTeX sale de la ruta crítica sin perder la partición `index`/`vendor`. La primera carga baja de **987,1 a 910,1 KB** (−77,8 kB comprimidos) y `vendor` de **180,73 a 103,13 kB**. La hoja de estilos de KaTeX sigue siendo inmediata (4,1 kB comprimidos) porque su ruta de fuentes es relativa a su ubicación.
- El pipeline de markdown (21% de los mismos bytes de fuente) queda pendiente con su propio diseño: sus consumidores son la ruta síncrona del renderizador incremental.
- Pendientes o excepciones aceptadas: `V-04` no incluye tiempo de pintado, y `V-03` no se pudo correr por la compuerta de navegador rota.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Nace de `SPEC-018`, que dejó `P6`/`WEB-08` fuera al validarse sin navegador disponible. Separarlo mantiene la regla de un alcance por especificación y permite validar el resto del payload.

## Estado de la validación

Pendiente: el diferimiento del pipeline de markdown (`V1` parcial), el tiempo hasta el primer pintado en `V-04` y los snapshots de `V-03`.
