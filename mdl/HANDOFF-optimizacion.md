# MDL-HARNESS — traspaso: tamaño de la imagen, payload e idiomas

Este documento es el punto de entrada para el agente que continúa el trabajo de optimización de tamaño y de idiomas. El código está en `main`; lo que falta son cuatro observaciones y dos piezas de trabajo ya especificadas.

## Dónde quedó

- PR **#7** mergeado en `main` con el commit `26304b0067`; la rama `feat/optimizacion-imagen-payload-idiomas` está eliminada en local y en el remoto.
- Especificaciones: [017](specs/017-optimizacion-imagen.md), [018](specs/018-payload-cliente.md) y [019](specs/019-idiomas-en-es.md) quedaron en estado **En implementación** a propósito: falta registrar comprobaciones obligatorias. [020](specs/020-diferir-chunk-vendor.md) está en **Borrador** y no autoriza implementación.
- Medido en el VPS con el contenedor real: imagen **4,2 GB → 1,08 GB** (comprimida 952 MB → 226 MB), `/app` **1720 MB → 348 MB**, un bundle de plugin transfiere **11,6 KB** con `gzip` (52 KB sin comprimir), y la interfaz se publica en **inglés y español**.

## Qué falta, en orden

### 1. Cerrar `LANG-05` e `IMG-08` (una orden, dos requisitos)

Se ejecutó `down` + `up -d` pero no se registró lo observado.

```sh
cd /srv/projects/deepseek-harness
sudo docker compose -f mdl/docker/compose.yml down
sudo docker compose -f mdl/docker/compose.yml up -d
```

Después, en el navegador: el idioma elegido en Ajustes › Idioma debe seguir seleccionado, y las sesiones anteriores deben seguir listadas. Eso cierra la persistencia de la preferencia (`LANG-05`) y la del volumen nombrado (`IMG-08`). Sin esta observación, esas dos filas quedan como están: ejecutadas, resultado no reportado.

### 2. Cerrar `IMG-09`

Montar el preset de agente que usa el backend `subagent-claude-code` sin `@anthropic-ai/claude-agent-sdk` instalado y confirmar que aparece un error que nombra el paquete (`subagent-claude-code: the optional peer @anthropic-ai/claude-agent-sdk is not installed…`) en lugar de un `ERR_MODULE_NOT_FOUND` durante la composición. El import diferido y su prueba unitaria existen; falta verlo montado.

### 3. Cerrar `WEB-01` y `WEB-02`

Abrir la GUI con el panel de red vacío y registrar: bytes de la primera carga y suma de los bundles de cliente de una sesión que use todas las superficies. Los objetivos son ≤400 KB y ≤700 KB. Hoy solo hay evidencia por `curl` (un bundle: 11 606 bytes).

### 4. Revisión a 390 px y GIF

La interfaz en español se revisó en escritorio. Falta el ancho de teléfono: el texto en español es 20–25% más largo y el compositor y las filas de ajustes son donde rompe. El repositorio exige además un GIF grabado del servidor real para todo cambio visible de la GUI; nada del PR #7 lo aporta.

### 5. `SPEC-020` (requiere aprobación antes de código)

Diferir el chunk `vendor` (727 KB con KaTeX, shiki y markdown) de la ruta crítica del primer render. Nació al separarse de `018` porque mide tiempo hasta el primer pintado, no bytes, y necesita navegador. Sigue el flujo de `PRODUCT_SPEC`: aprobar la especificación antes de implementar.

### 6. Decidir sobre CI

El PR #7 se mergeó sin comprobaciones: `gh pr checks 7` informó `no checks reported on the branch`. Confirmar si Actions está habilitado en el fork; `test:coverage` y las plataformas de Windows son las señales que una corrida local no da, y este cambio tocó 3000 archivos.

## Cerrar las especificaciones

Cuando 1, 2 y 3 estén registrados, un PR de un solo commit cambia `Estado: En implementación` por `Estado: Validada` en 017, 018 y 019, completa `Resultado y pendientes`, y actualiza las filas 17–19 de [ROADMAP.md](ROADMAP.md). Mientras falte cualquiera de las tres, dejarlas como están: `PRODUCT_SPEC` define Validada como todas las comprobaciones obligatorias registradas, y `MDL-VALID-01` prohíbe reportar como exitosa una que no se ejecutó.

## Trampas de este entorno, ya pagadas

Cada una costó una iteración. Están aquí para no repetirlas.

- **`pnpm` no está en el PATH del agente.** Usar `COREPACK_HOME=$PWD/.artifacts/corepack corepack pnpm …`, y ejecutar los binarios como `./node_modules/.bin/tsc` (no `node node_modules/.bin/…`: son scripts de shell).
- **Los hooks fallan con `exit status 127`** porque invocan `pnpm`. Correr a mano lo que envuelven (`tsc`, `oxlint --staged`, `gen-third-party-notices`) y usar `--no-verify` solo con esa evidencia.
- **`docker compose` necesita `-f mdl/docker/compose.yml`.** `restart` no recrea el contenedor; para probar persistencia hace falta `down` + `up -d`.
- **`docker run` necesita `--entrypoint`.** El `ENTRYPOINT` de la imagen es `tini → mdl-entrypoint`, así que `docker run … du -sh /app` arranca el producto e ignora el argumento.
- **El contexto de build arrastra estado en ejecución.** `.sessions` llegó a 1,4 GB en el checkout y apareció dentro de la imagen: Docker informa el contexto comprimido (9 MB), así que la fuga no se ve en el log. `.dockerignore` ahora excluye `.sessions` y `.pnpm-store`.
- **`bookworm-slim` no trae `ca-certificates`.** Reescribir las fuentes de apt a un espejo HTTPS deja apt sin poder verificar nada, incluido el paquete que aporta los certificados.
- **`nginx` con `gzip` reescribe el `ETag` como `W/"…"`.** Cualquier comparación de revalidación tiene que ser débil, o un navegador real nunca recibe `304`.
- **Reproducir una etapa de runtime dentro del checkout da falsos positivos.** Node resuelve hacia arriba y encuentra el `node_modules` de desarrollo; reproducir en `/tmp` (o donde no haya un checkout padre) es lo que revela el fallo.
- **`git checkout -- $(…tests)` borra trabajo en curso.** Al revertir pruebas de una migración se perdió una prueba que ya estaba escrita; preferir revertir archivo por archivo tras revisar el diff.

## Convenciones del repo que muerden

- **Issues están deshabilitados en el fork.** La plantilla de PR pide un Issue del mismo repositorio; no se puede cumplir, y el cuerpo del PR #7 lo declara.
- **Solo existen las etiquetas por defecto** de GitHub; la taxonomía `kind/*` / `area/*` es de upstream.
- **Agent Notes son obligatorias** para cambios no triviales. El archivo `archived/` está congelado y conserva sus lados `.zh.md` porque su sello de integridad prohíbe modificarlo; el resto de la documentación es solo en inglés.
- **La copia de producto sale de los catálogos** (`src/client/locales.ts`: `en` como fuente de verdad, `es` verificado por tipos), nunca de un literal en un componente.

## Puntos de entrada del código

- `scripts/link-workspace-peers.mjs` — enlaces de peers para un árbol sólo-producción; sin esto `pnpm install --prod` no arranca.
- `mdl/docker/Dockerfile` — tres etapas (`build`, `runtime-tree`, `runtime`); la lista de herramientas y sus motivos están en `mdl/docker/README.md`.
- `mdl/docker/nginx.conf` — `gzip` y tipos comprimibles.
- `packages/host/frontend-static/src/index.ts` — `cacheControlFor`: inmutable bajo `assets/`, `no-cache` para nombres estables.
- `packages/client/modules/src/index.ts` — `ETag` y la comparación débil de `If-None-Match`.
- `packages/client/locale/` — `LOCALE_IDS`, `FALLBACK_LOCALE`, diccionarios `common` y `settings.locale`.
- `apps/web/vite.config.ts` — fuentes `woff2` únicamente y división de chunks.

## Verificación rápida antes de tocar nada

```sh
./node_modules/.bin/tsc -b tsconfig.host.json && ./node_modules/.bin/tsc -b tsconfig.client.json
./node_modules/.bin/vitest run packages/client packages/host/frontend-static packages/client/modules
./node_modules/.bin/tsx scripts/verify-md-links.ts && ./node_modules/.bin/tsx scripts/verify-md-wrap.ts
```

Esperado en `main`: tipos limpios, suites del cliente y de `frontend-static` en verde, y todas las compuertas de documentación en verde. La suite completa deja 28 fallos ambientales en `fs-sandbox`, `terminal`, `tool-bash-persistent` y `subprocess-local` (`EACCES` del sandbox de archivos y `forkpty(3)` sin PTY); no son de este cambio y no bloquean nada.

## Enlaces

- Decide el árbol de runtime y la reparación de peers: [production-runtime-tree-and-peer-repair.md](../.agents/notes/implemented/architecture/2026-11-07-production-runtime-tree-and-peer-repair.md)
- Decide compresión y caché del payload: [browser-payload-budgets.md](../.agents/notes/implemented/architecture/2026-11-07-browser-payload-budgets.md)
- Decide los idiomas publicados: [english-and-spanish-only.md](../.agents/notes/implemented/process/2026-11-07-english-and-spanish-only.md)
- Despliegue y operación del contenedor: [VPS_HANDOFF.md](VPS_HANDOFF.md) y [docker/README.md](docker/README.md)
