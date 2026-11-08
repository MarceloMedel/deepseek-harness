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
| `V1` diferir KaTeX | **Bloqueado por el build** | Se implementó la carga diferida del motor (import dinámico, aviso de llegada y re-render) y el build la anuló. Medido en cuatro configuraciones: (a) la actual, `index` 429,00 kB + `vendor` 744,87 kB (gzip 144,51 + 180,73) con KaTeX dentro de `vendor`; (b) KaTeX con chunk propio por `manualChunks`, 261,38 kB (gzip 77,62) **importado estáticamente** por `index`, así que no difiere; (c) sin la partición manual, `index` 912,85 kB (gzip 248,11) + `katex` 261,37 kB (gzip 77,61) **como import dinámico**, es decir el diferimiento funciona a cambio de perder la partición `index`/`vendor`; (d) los grupos de rolldown (`codeSplitting`/`advancedChunks`) no llegan al bundler — la función `test` del grupo no se invoca nunca |
| `V1` diferir el pipeline de markdown | No ejecutada | Comparte la restricción de KaTeX: el paquete tendría que salir de `vendor`, y la partición manual lo devuelve a la ruta crítica |
| `WEB-08`, `V-01`, `V-02`, `V-03`, `V-04` | No ejecutadas | Pendiente: dependen de `V1` |

## Resultado y pendientes

- Resultado: bloqueado en el build, no en el código. El motor de KaTeX puede cargarse bajo demanda —el import dinámico, el aviso de llegada y el re-render funcionan y sus pruebas pasan— pero la partición de chunks del shell lo devuelve a la ruta crítica: `manualChunks` convierte el chunk del motor en un chunk más que `index` importa de forma estática.
- Ganancia medida si se resuelve: **77,6 kB comprimidos** (KaTeX, 36,7% de los bytes de fuente del chunk `vendor`) y 4,1 kB de CSS.
- Pendientes o excepciones aceptadas: elegir entre perder la partición `index`/`vendor` ([decisión de layout](../.agents/notes/implemented/architecture/2026-08-06-web-shell-dist-chunk-layout.md)) —con la que el motor sí queda diferido— o extender el build para que un chunk dinámico quede fuera de los chunks manuales. Las dos tocan decisiones ya tomadas y necesitan aprobación.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Nace de `SPEC-018`, que dejó `P6`/`WEB-08` fuera al validarse sin navegador disponible. Separarlo mantiene la regla de un alcance por especificación y permite validar el resto del payload.

## Estado de la validación

Pendiente: `V1`, bloqueado por la partición de chunks del build (ver la tabla), y en consecuencia `WEB-08` y `V-01` a `V-04`.
