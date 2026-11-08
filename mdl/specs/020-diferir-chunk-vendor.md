# SPEC-020 — Diferir el chunk `vendor` del primer render

Estado: Aprobada
Fase: 20
Aprobación para iniciar: usuario, 2026-11-08 — aprobada después de medir la primera carga con navegador real
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

Se completa después del desarrollo.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Pendiente | No ejecutada | Pendiente |

## Resultado y pendientes

- Resultado: pendiente.
- Estimación: 727 KB fuera de la ruta crítica del primer render.
- Pendientes o excepciones aceptadas: ninguno por defecto.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Nace de `SPEC-018`, que dejó `P6`/`WEB-08` fuera al validarse sin navegador disponible. Separarlo mantiene la regla de un alcance por especificación y permite validar el resto del payload.
