# SPEC-031 — Stack de desarrollo: `web_fetch` con guard, compuertas de seguridad y búsqueda estructural

Estado: Validada
Fase: 31
Commit base: `fb74ac3ff2`
Aprobación para iniciar: usuario, 2026-11-12 — «que otras herramientas pueden ser relevantes a tener en un stack de desarrollo dentro de dsh? busca en internet y vayamos revisando», con la Tanda 1 elegida (activar `web_fetch`, sumar `gitleaks` y `osv-scanner`, sumar `ast-grep` con skill) y la decisión explícita de habilitar `web_fetch` **sólo** a través de un proveedor con guard SSRF propio, con `gitleaks` en alcance de rama más baseline.

## Objetivo

Que una sesión pueda leer una página concreta, escanear su rama por secretos y dependencias vulnerables, y buscar o reescribir código por forma sintáctica — sin abrir un camino hacia los servicios internos que este despliegue alcanza.

## Contexto

El despliegue ya tenía búsqueda web propia (SPEC-029), índice de código (SPEC-027) y diagramas (SPEC-030). Faltaban tres cosas, medidas antes de escribir esto:

- **`web_fetch` estaba apagado y no era seguro encenderlo.** Ambos presets que envía la imagen declaran `tool-web: fetch: false`, y el único proveedor de fetch del repositorio, `@deepseek-ai/dsh-web-fetch-http`, declara en su propio README que sin protección SSRF «is an SSRF primitive and **must not be enabled** in a deployment that can reach sensitive internal network targets». Este despliegue los alcanza: `host.docker.internal:11434` resuelve a `172.17.0.1`, `searxng` a `172.19.0.2`, y `127.0.0.1:3080` es la GUI.
- **Un parche reemplaza el `config` completo de una fila, no lo fusiona.** Al añadir `- id: web config: {fetchProvider: guarded}` sobre un perfil que ya tenía `searchProvider: lite`, `--dump-config` mostró la fila `web` con un solo campo: el `searchProvider` había desaparecido. Cualquier fila que se agregue a `web` tiene que ser dueña de todas sus claves, o ninguna.
- **Los presets son copy-only.** `dsh-agent-presets` crea presets copiando un directorio entero y `remove()` se niega a borrar los que envía el despliegue, así que cambiar `fetch: false` dentro de un preset significa mantener un fork completo de su composición. La alternativa es la capa global del registro de herramientas, que todo agente fusiona por debajo de su preset.

## Alcance

- `STK-01` `web_fetch` se habilita únicamente a través de un proveedor propio, `mdl/plugins/web-fetch-guarded` (`id: guarded`); el proveedor de upstream no se monta.
- `STK-02` El guard valida **direcciones resueltas**, nunca nombres: rechaza loopback, privadas, link-local, CGNAT, unique-local, multicast, documentación y las formas IPv4-mapeadas de todas ellas.
- `STK-03` La conexión se abre a la dirección validada con el nombre en SNI y en `Host`, de modo que el nombre no puede resolverse a otro destino entre la validación y el connect.
- `STK-04` Cada salto de redirección se revalida y sólo se siguen saltos del mismo origen; una página pública no puede rebotar la petición hacia una interna.
- `STK-05` La fila de `web_fetch` vive en la capa global del registro de herramientas; ningún preset se copia ni se modifica.
- `STK-06` `gitleaks`, `osv-scanner` y `ast-grep` viajan en la imagen, fijados por versión **y** sha256, en `/usr/local/bin`.
- `STK-07` `gitleaks` se usa como compuerta en alcance de rama más baseline: nunca el historial completo por defecto.
- `STK-08` Las skills `ast-grep` y `security-scan` se publican desde la imagen en `$DSH_HOME/skills`, y el catálogo de herramientas del modelo crece exactamente en una herramienta (`web_fetch`).

## Fuera del alcance

- Navegador headless y `ffmpeg` (Tanda 2), y LSP como herramienta (Tanda 3). Ambas quedan como fases posteriores.
- Un allowlist de dominios: el guard valida destinos, no nombres, así que no hay lista que mantener.
- Cambiar el proveedor de upstream ni enviarle un parche río arriba.
- Fijar las variantes arm64 de los tres binarios; la build falla con un mensaje propio en otra arquitectura.
- Un `.gitleaks.toml` propio del repositorio: el baseline vive en `tmp/` (ignorado por git) y no se versiona.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `STK-01` | El proveedor montado es `guarded` y `web_fetch` responde | `--dump-config` muestra la fila del plugin y el `tool-web` global con `fetch: true`; una sesión llama `web_fetch` y recibe el cuerpo |
| `STK-02` | Los destinos internos se rechazan con la dirección resuelta en el mensaje | `check.mjs`: cuatro casos en vivo con `code=WEB_BLOCKED_TARGET` |
| `STK-03` | La conexión usa la dirección validada | Revisión del `http(s).request` (`host` = dirección, `servername`/`Host` = nombre) y caso positivo en vivo contra un host público |
| `STK-04` | Una redirección a otro origen falla | Código `WEB_REDIRECT_BLOCKED`; revisión del bucle de saltos, que revalida cada uno |
| `STK-05` | Ningún preset fue copiado ni editado | `git status` sin cambios bajo `apps/cli/config/agent-presets/`; el catálogo del modelo gana exactamente `web_fetch` |
| `STK-06` | Los tres binarios existen y responden su versión | `docker run --rm mdl-harness:local sh -c 'gitleaks version; osv-scanner --version; ast-grep --version'` |
| `STK-07` | El alcance de rama no arrastra el ruido del historial | `gitleaks git --log-opts=origin/main..HEAD` sobre esta rama; contraste medido con el historial completo |
| `STK-08` | Las skills aparecen en el catálogo | El catálogo de una sesión lista `ast-grep` y `security-scan` después de publicarlas |

## Restricciones

- Se conservan `MDL-SEC-01`, `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-IDENT-02` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-SEC-02` es la restricción que manda: habilitar `web_fetch` requería especificación propia y validación de seguridad, y este documento la aporta junto con los cuatro casos negativos en vivo y el diseño que los hace posibles.
- El agente ya tenía red por `bash` con `curl`; `web_fetch` no crea la capacidad, la pone a un paso de una página con contenido hostil. Por eso el guard es la condición de `STK-01` y no una capa opcional.
- `MDL-DOCKER-02`: nada de esto monta el socket de Docker ni abre puertos; el proveedor no escucha.
- Los binarios se fijan por versión y sha256 y son los de amd64; otra arquitectura falla en la build en vez de recibir un binario que no corre.
- El costo de imagen se declara: unos 136 MB de binarios (`gitleaks` 22 MB, `osv-scanner` 58 MB, `ast-grep` 56 MB) y un módulo de plugin sin dependencias.

## Implementación prevista

- `mdl/plugins/web-fetch-guarded/`: `host.mjs` (el proveedor y el guard), `check.mjs` (matriz fuera de línea más casos en vivo), `install.sh`, `cordis.patch.yml`, `package.json`, `README.md`.
- `mdl/docker/Dockerfile`: bloque de los tres binarios con versión, sha256 y verificación de arquitectura; `COPY` del plugin y de `mdl/skills`.
- `mdl/docker/entrypoint.sh`: el plugin entra al bucle de bundles; un bucle publica las skills de `/opt/mdl/archify` y `/opt/mdl/skills/*` en `$DSH_HOME/skills`.
- `mdl/skills/ast-grep/SKILL.md`, `mdl/skills/security-scan/SKILL.md`: las dos skills.
- `mdl/docker/README.md` y `mdl/ROADMAP.md`: secciones y fila de la fase.

## Validación ejecutada

Entorno: contenedor `mdl-harness` con la imagen anterior a esta fase, 2026-11-12.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| El guard rechaza los destinos internos con la dirección resuelta | Cumplido | `check.mjs`: `host.docker.internal` → `172.17.0.1`, `searxng` → `172.19.0.2`, `127.0.0.1`, `169.254.169.254`, todos con `code=WEB_BLOCKED_TARGET` |
| El guard clasifica direcciones y valida URLs | Cumplido | 25 casos de dirección (20 bloqueadas incluidas `::1`, `fc00::1`, `::ffff:127.0.0.1`, `2002:7f00:1::1`; 5 permitidas) y 6 de URL (`WEB_INVALID_URL`, `WEB_BLOCKED_URL`) → 37 comprobaciones, «all checks passed» |
| Una página pública se lee de verdad | Cumplido | `check.mjs` sobre `raw.githubusercontent.com`: `status=200 kind=text chars=2657 truncated=false` |
| El modelo usa `web_fetch` de punta a punta | Cumplido | Sesión headless con el overlay: respondió «HTTP 200» y el inicio del cuerpo de `llms.txt` |
| El modelo no puede alcanzar lo interno a través de la herramienta | Cumplido | La misma sesión recibió `refused: host.docker.internal resolves to 172.17.0.1, which is not a public address` y `refused: 127.0.0.1 is not a public address` |
| Un parche reemplaza el `config` de la fila | Comprobado | `--dump-config` con la fila `web config: {fetchProvider: guarded}` dejó la fila con un solo campo; corregido dejando que `fetch()` auto-seleccione |
| La composición no rompe la búsqueda existente | Cumplido | `--dump-config`: `web` conserva `searchProvider: lite` y el `tool-web` global queda con `fetch: true`, `search: false`, `disabled: false` |
| Los binarios responden | Cumplido con las copias locales | `gitleaks version` → 8.30.1; `osv-scanner --version` → 2.7.1; `ast-grep --version` → 0.51.2 |
| `gitleaks` en alcance de rama y baseline | Cumplido con medición | Historial completo: 509 hallazgos de entropía (ruido de fixtures e i18n). Árbol de trabajo: `mdl/docker/.env` (ignorado por git, contiene `SEARXNG_SECRET`) como positivo real; `packages/core` limpio, exit 0 |
| `osv-scanner` encuentra avisos reales | Cumplido | `scan source -r .` desde `pnpm-lock.yaml`: avisos en `vite`, `vitest` y `zod` con versión corregida |
| `ast-grep` busca por forma | Cumplido | `run -p 'assertNever($A)' --lang ts packages` → 11 coincidencias con `file`/`range`/`text` en JSON por línea |
| Las skills entran al catálogo de una sesión viva | Cumplido | Publicadas en `/data/dsh/skills`, el catálogo de la sesión en curso pasó a listar `ast-grep` y `security-scan` |
| El bucle de publicación del entrypoint funciona | Cumplido en un prefijo temporal | Bloque extraído del `entrypoint.sh` con `/opt/mdl` reapuntado: publica `archify ast-grep security-scan` en un `DSH_HOME` vacío |
| Build de la imagen con los binarios y el `COPY` de skills | Cumplido | `docker compose build` y `up -d` en el host el 2026-11-12; contenedor `healthy` |
| `STK-06` los tres binarios están en la imagen | Cumplido | `gitleaks version` → 8.30.1; `osv-scanner --version` → 2.7.1 (scalibr 0.5.3); `ast-grep --version` → 0.51.2, ejecutados dentro del contenedor |
| `STK-08` las skills se publican desde la imagen | Cumplido | Log del arranque: `skills published: archify ast-grep security-scan`; `ls $DSH_HOME/skills` lista las tres |
| `STK-01`/`STK-05` la fila compone sin romper la búsqueda | Cumplido | `--dump-config` dentro del contenedor: `tool-web` con `fetch: true`, `search: false`, `disabled: false`, y la fila `web-fetch-guarded` insertada; el arranque quedó `healthy` con el plugin publicado |
| `STK-02`/`STK-03`/`STK-04` el guard opera sobre el módulo instalado | Cumplido | `check.mjs` dentro del contenedor contra `dsh-web-fetch-guarded` publicado: 37 comprobaciones, «all checks passed», con los cuatro rechazos en vivo |
| `STK-08` el modelo ve `web_fetch` en el despliegue real | Cumplido | Una sesión nueva de la GUI pidió `web_fetch` sobre una página pública y recibió `200`; las sesiones creadas antes del reinicio conservan su composición, que es el comportamiento esperado |

## Resultado y pendientes

- Resultado: validada sobre la imagen reconstruida y el despliegue reiniciado. Los tres binarios responden dentro del contenedor, el `entrypoint` publica las skills, la fila de `web_fetch` compone sin perder la búsqueda, el guard se ejerció sobre el módulo instalado con sus 37 comprobaciones y el modelo usa la herramienta en una sesión nueva.
- Pendientes o excepciones aceptadas: el gate visual de archify sigue dependiendo de `ARCHIFY_CHROME` (SPEC-030), y el navegador headless con `ffmpeg` queda como Tanda 2 con LSP como Tanda 3.
- Decisión de salida: validada; las tandas 2 y 3 son fases posteriores.
