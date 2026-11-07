# SPEC-017 — Optimización de la imagen Docker

Estado: En implementación
Fase: 17
Aprobación para iniciar: usuario, 2026-11-07 — tres especificaciones independientes en orden 017 → 018 → 019
Commit base: `ac1643ba89`

## Objetivo

Reducir la imagen desplegada en el VPS de 4,2 GB a 1,6 GB o menos, sin cambiar el comportamiento del producto ni retirar capacidades que el agente use, y con la auditoría de herramientas del contenedor incluida en esta misma fase.

## Contexto

`SPEC-004` excluyó explícitamente la optimización de tamaño ("optimización agresiva de tamaño de imagen, fuera del alcance") y `SPEC-006` registró 4,17 GB en amd64; `VPS_HANDOFF` informa 4,2 GB. El análisis se hizo sobre `ac1643ba89` sin daemon Docker disponible, así que las cifras siguientes son mediciones del árbol que el build copia, no una lectura de capas. La primera comprobación de esta especificación es medir la imagen real en el host, porque la etapa de runtime no es sólo `/app`: también pesan la base y las herramientas instaladas por `apt` y `uv`.

Mediciones del árbol:

- `/app` copiado desde la etapa de build: **≈1,72 GB** (repositorio de 2,1 GB menos `.git` de 375 MB, que `.dockerignore` ya excluye).
- `node_modules` dentro de esa copia: **1,53 GB**. La clausura de producción es **197 MB en 207 paquetes**, de modo que **≈1,33 GB (85%)** no se usa en runtime.
- El peso mayor no es del producto: `@openai/codex` (300 MB) y `@anthropic-ai/claude-agent-sdk-linux-x64` (262 MB) sólo los importa `examples/`; siguen `mermaid` + `@mermaid-js/mermaid-mindmap` (109 MB, devDependency raíz para `verify-mermaid`) y la cadena de build y QA (rolldown, oxlint, esbuild, tsdown, lightningcss, playwright-core, jsdom).
- Residuos de build dentro de la copia: `coverage/` 31 MB, `docs/` 4,1 MB, `examples/` 4,9 MB, `.agents/notes/` (parte de los 16 MB de `.agents/`), `website/` 128 KB, `mdl/` 1,3 MB, `scripts/` 2,1 MB, sourcemaps de `lib/` 10,3 MB, `.d.ts` 4,6 MB, `*.tsbuildinfo` 1,3 MB.
- La etapa de runtime instala `bash bubblewrap ca-certificates curl git jq less nginx-light openssh-client python3 python3-pip python3-venv tini`, luego `gh`, `docker-ce-cli`, `uv` y `uv tool install graphifyy==0.9.91`. Cada uno aporta capa propia y su tamaño se mide en `SIZE-01`.

Contexto relacionado: el payload del cliente móvil es [SPEC-018](018-payload-cliente.md) y los idiomas son [SPEC-019](019-idiomas-en-es.md). Las tres son independientes y pueden validarse por separado.

## Alcance

**A. Copia sólo-producción.**

- `A1` Etapa de runtime con árbol sólo-producción en lugar de `COPY --from=build /app`: elimina ≈1,33 GB de dependencias de desarrollo, QA y backends ACP que el runtime no carga. Debe resolver los peers que hicieron fracasar `pnpm deploy --prod` en `SPEC-004`; si no los resuelve, el arranque falla y `SIZE-03` no pasa.
- `A2` Poda de residuos posterior a la copia: `coverage/`, `docs/`, `.agents/notes/`, `examples/`, `website/`, `mdl/`, `scripts/` de desarrollo y pruebas, sourcemaps de `lib/`, `.d.ts` y `*.tsbuildinfo`. Se conserva `.agents/skills/`, que el plugin de skills lee en runtime.
- `A3` Imagen base `node:22-bookworm-slim` en runtime (≈−180 MB), manteniendo `node:22-bookworm` en build.

**B. Herramientas (auditoría `D1`, en esta fase).**

- `B1` Medir el costo real de cada herramienta instalada en runtime con `docker history` y `du` por directorio, y registrar la tabla en la sección de validación.
- `B2` Retirar de la imagen las herramientas sin consumidor en runtime: `docker-ce-cli` (el despliegue no monta el socket por `MDL-DOCKER-02` ni define `DOCKER_HOST`, así que el binario no puede operar ningún daemon), `openssh-client` (el despliegue no monta fragmento SSH y todo el Git va por HTTPS con token desde `SPEC-011`), `python3-pip` y `python3-venv` (`uv` cubre ambos) y `graphifyy` con su venv (herramienta de grafos de documentación, sin consumidor en la ruta del agente).
- `B3` Conservar `bash`, `git`, `curl`, `jq`, `less`, `bubblewrap`, `tini`, `nginx-light`, `ca-certificates`, `python3`, `uv` y `gh`: cada uno tiene consumidor real en runtime (herramienta bash, repositorios, healthcheck, cadena de sandbox, entrypoint, proxy de `SPEC-004`, trabajo sobre proyectos Python y flujo de PR de `SPEC-010`).
- `B4` Documentar cada herramienta retirada en `mdl/docker/README.md` con su motivo y cómo reponerla, y actualizar `compose.yml` si la lista cambia algún montaje; sin tocar `MDL-DOCKER-01` ni `MDL-DOCKER-02`.
- `B5` Esta especificación reemplaza el inventario de herramientas de `DOCKER-03` de `SPEC-004`; `SPEC-004` conserva validez en todo lo demás.

**C. Backends ACP opcionales.**

- `C1` Hacer que `@openai/codex` y `@anthropic-ai/claude-agent-sdk` dejen de instalarse por defecto, mediante peers opcionales en `packages/subagent/subagent-codex` y `packages/subagent/subagent-claude-code`, para que ni la etapa de build ni una instalación de `npx @deepseek-ai/dsh` paguen 562 MB por backends que sólo usa `examples/`.
- `C2` El plugin de cada backend informa una falta explícita del peer cuando se lo monta sin el paquete, en lugar de fallar por import.

## Fuera del alcance

- El payload del navegador y el móvil: [SPEC-018](018-payload-cliente.md).
- Los idiomas y la retirada del chino: [SPEC-019](019-idiomas-en-es.md).
- Cambiar la arquitectura de plugins o reducir la cantidad de paquetes publicables del workspace.
- Reescribir la historia de Git (`.git` de 375 MB).
- Cambiar comportamiento de sandbox, seguridad, red o credenciales.
- Optimizar el tiempo de build: esta especificación mide tamaño.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `IMG-01` | La imagen mide ≤1,6 GB después de `A1`–`A3` y `B1`–`B4` | `docker image ls` en el host, antes y después |
| `IMG-02` | `/app` dentro del contenedor mide ≤350 MB | `docker run --rm IMAGEN du -sh /app` |
| `IMG-03` | La tabla de costo por herramienta queda registrada con su medición | `docker history --no-trunc` y `du -sh` de cada directorio de herramienta |
| `IMG-04` | No hay residuos: sin `coverage/`, `docs/`, `tests/`, `*.map`, `*.d.ts` | `docker run --rm IMAGEN find /app -name '*.map' -o -name coverage -o -name '*.d.ts'` |
| `IMG-05` | El producto sigue operativo: GUI, WebSocket, sesión con agente real, bash con sandbox y catálogo de skills resuelto | Validación manual por proxy, equivalente a `DOCKER-04` |
| `IMG-06` | El flujo de PR con `gh` sigue funcionando con el token montado | Abrir un PR de prueba desde el contenedor |
| `IMG-07` | Las herramientas retiradas están documentadas con su motivo y ninguna tiene consumidor en runtime | Revisión de `mdl/docker/README.md` y ejecución de la sesión de `IMG-05` |
| `IMG-08` | La base de sesiones y la configuración del volumen sobreviven a la reconstrucción | Reinicio sobre el mismo volumen (`MDL-DATA-01`) |
| `IMG-09` | Montar un backend ACP sin su peer instalado produce un error explícito, no un import roto | Composición de prueba con el plugin montado |
| `IMG-10` | `pnpm run build`, `pnpm run typecheck` y `pnpm run test` pasan con los peers opcionales | Gates del repositorio |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-UPSTREAM-01` y `MDL-VALID-01`.
- `MDL-DOCKER-01` (usuario no root) y `MDL-DOCKER-02` (sin socket del host) no se relajan: `B2` retira el binario `docker-ce-cli`, no habilita el daemon.
- Toda cifra de imagen se mide en el host con daemon Docker; este entorno de análisis no lo tiene y `MDL-VALID-01` obliga a reportar como pendiente lo no ejecutado.
- La clausura sólo-producción debe conservar todo peer que el runtime resuelva hoy; `IMG-05` es la puerta.

## Implementación prevista

- `mdl/docker/Dockerfile`: etapa de build igual salvo `C1`; etapa de runtime con base `slim`, árbol sólo-producción, poda y lista de herramientas reducida.
- `mdl/docker/README.md` y `mdl/docker/compose.yml`: lista efectiva de herramientas.
- `packages/subagent/subagent-codex/package.json` y `packages/subagent/subagent-claude-code/package.json`: peers opcionales y su diagnóstico.
- `examples/package.json`: mantiene las dependencias que sí necesita.
- `mdl/ROADMAP.md`: fila de la fase al validar, según `SPEC-000`.

## Validación ejecutada

Fecha: `2026-11-07`. Entorno de análisis: checkout del repositorio, Node `22.23.4`, pnpm `11.7.0` vía `corepack`, **sin daemon Docker**. El árbol de runtime se reprodujo localmente ejecutando los mismos pasos que la etapa `runtime-tree` del `Dockerfile`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Mecanismo `A1`: árbol sólo-producción | Aprobado | `pnpm install --prod --frozen-lockfile` + `node scripts/link-workspace-peers.mjs` (1293 enlaces en 227 miembros) sobre un stage del repositorio |
| `A1` arranca el producto | Aprobado | `node apps/cli/lib/bin.js --profile web --port 3998`: shell `200` (13 709 B con `window.__DSH_BOOT__`), bundle de plugin `200` (52 153 B), manifest y `icon-192.png` servidos |
| `A1` sin errores de import | Aprobado | Sin `ERR_MODULE_NOT_FOUND`; el primer intento sin reparación de peers falló exactamente así, y es lo que `SPEC-004` había encontrado con `pnpm deploy --prod` |
| `IMG-02` `/app` ≤350 MB | Aprobado | **349 MB** totales, `node_modules` 310 MB (antes: 1720 MB / 1533 MB) |
| `C1` SDK de Claude opcional | Aprobado | `@anthropic-ai/claude-agent-sdk` sale de `dependencies` y queda como peer opcional + dev; el árbol de runtime informa `skipped non-workspace peers: @anthropic-ai/claude-agent-sdk` y ya no instala los 263 MB |
| `C2` aviso explícito | Aprobado | `lib/index.js` compilado contiene sólo `import("@anthropic-ai/claude-agent-sdk")` diferido; `loadOfficialQuery` traduce `ERR_MODULE_NOT_FOUND` a `CLAUDE_SDK_MISSING` |
| Pruebas del paquete modificado | Aprobadas | 27 pruebas de `subagent-claude-code` (incluye la real-product con CLI real) |
| Tipos | Aprobado | `tsc -b tsconfig.host.json` sin errores |
| Build del workspace | Aprobado | `tsdown --env.DSH_BUILD_FACE host` completo |
| `IMG-01` imagen ≤1,6 GB | **No ejecutada** | Requiere daemon Docker en el host: `docker image ls` antes y después |
| `IMG-03` tabla de costo por herramienta | **No ejecutada** | Requiere `docker history` sobre la imagen construida |
| `IMG-04` ausencia de residuos | Parcial | Los comandos de barrido se ejecutaron sobre `/app` local; su verificación dentro de la imagen queda pendiente |
| `IMG-05` producto operativo por proxy | **No ejecutada** | El arranque y el shell se validaron locales; nginx, Landlock y el proxy pertenecen al contenedor |
| `IMG-06` flujo de PR con `gh` | **No ejecutada** | Requiere el contenedor con el token montado |
| `IMG-08` persistencia tras reconstrucción | **No ejecutada** | Requiere Docker y el volumen |
| `IMG-09` preset ACP sin peer | Parcial | La carga del bundle diferido está verificada; falta montar el preset dentro de un contenedor |
| `IMG-10` gates del repositorio | Parcial | Tipos y build ejecutados; `test` y `typecheck` completos quedan pendientes de la corrida en CI |

## Resultado y pendientes

- Resultado: implementado y verificado en todo lo que no requiere daemon Docker. `/app` bajó de **1720 MB a 349 MB** (−80%) en la reproducción local del árbol de runtime, y ese árbol arranca el producto y sirve el shell y los bundles de plugins.
- Sin medir: la imagen final. La etapa de runtime perdió `graphifyy`, `docker-ce-cli`, `openssh-client`, `python3-pip` y `python3-venv`, y pasó a `bookworm-slim`, así que la reducción debería superar la de `/app`; `IMG-01` necesita el host.
- Pendientes o excepciones aceptadas: ninguno por defecto.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Idiomas: la interfaz se publica en inglés y español, sin chino; el alcance lingüístico pertenece a [SPEC-019](019-idiomas-en-es.md).
- La auditoría de herramientas entra en esta fase (`B`), con la sustitución de `DOCKER-03` registrada en `B5`.
- El payload del navegador y los backends ACP quedan en especificaciones separadas para poder validar y revertir cada superficie por su cuenta.

## Estado de la validación

Pendiente: comprobaciones que requieren daemon Docker (`IMG-01`, `IMG-03`, `IMG-05`, `IMG-06`, `IMG-08`) y la corrida completa de gates en CI (`IMG-10`).
