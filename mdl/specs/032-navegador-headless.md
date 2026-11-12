# SPEC-032 — Navegador headless para el gate visual

Estado: En implementación
Fase: 32
Commit base: `75ae735ccc`
Aprobación para iniciar: usuario, 2026-11-12 — «continua con ambas tareas», sobre las dos de la Tanda 2: el navegador en la imagen y la medición bajo el sandbox, con el tamaño medido antes de aceptarlo.

## Objetivo

Que el gate visual de `archify` corra dentro del contenedor y bajo el sandbox del agente, sobre artefactos del workspace, sin depender de la máquina del operador.

## Contexto

La propuesta estimó «350-400 MB» para «navegador + `ffmpeg`». Medido antes de escribir código, la estimación estaba mal en tres cosas: la vía de `apt` cuesta más del doble, las bibliotecas que el navegador realmente necesita son muchas más de las que una lista curada sugiere, y archify no puede arrancar Chrome bajo este sandbox con sus flags fijos.

Hechos medidos el 2026-11-12:

- **`unshare(CLONE_NEWUSER)` devuelve `EPERM`** (`max_user_namespaces=41113`, `unprivileged_userns_clone=1`): el límite es del perfil del contenedor. Es el mismo que ya obliga a landlock en lugar de bwrap, y significa que el sandbox propio de Chromium no puede inicializar.
- **`archify` sólo pasa `--no-sandbox` como root o con `ARCHIFY_CHROME_NO_SANDBOX=1`** (`bin/visual-check.mjs:1519`-`:1549`); el contenedor corre como `node` (uid 1000).
- **`apt` no entra**: `chromium` + `ffmpeg` + `fonts-liberation` resuelven **+858 MB** (240 paquetes); sólo `chromium` **+658 MB**, con `libllvm15` 112 MB detrás.
- **`playwright install --with-deps` tampoco era barato**: 100 paquetes nuevos, **+308 MB** medidos en la imagen (mesa y `libllvm15` vienen igual). La estimación curada de +40 MB era optimista porque sólo contaba una lista propia de bibliotecas.
- **`playwright install chromium` instala dos navegadores**: con `--no-shell` queda sólo el completo, y se evitan 213 MB que `--headless=new` no usa.
- **La poda del árbol funciona**: `locales` salvo `en-US` (220 archivos → 1), el árbol `WidevineCdm` y el `ffmpeg` del grabador liberan 76 MB. El navegador completo queda en **310 MB**.
- **Dos cosas rompen Chrome bajo el sandbox, y ninguna es un flag que archify pueda pasar**:
  - `/dev/shm` queda fuera del conjunto escribible de Landlock: `touch /dev/shm/x` → `Permission denied`, y Chrome aborta con `Creating shared memory in /dev/shm/.org.chromium.Chromium.* failed: Permission denied (13)`.
  - `$HOME` no es escribible, así que la base de datos del crash reporter no se crea: `chrome_crashpad_handler: --database is required` y Chrome muere con `SIGTRAP` (`rc=-5`) antes de que exista el pipe de DevTools.
- **Con las dos cosas resueltas el gate pasa**: `HOME` escribible más `--disable-dev-shm-usage` hacen que Chrome renderice en 0,65 s, y `finalize` devuelve `ok: true` con `browser-check: pass`.

## Alcance

- `BRW-01` La imagen instala el navegador de `playwright@1.61.1` con `--no-shell` en `/opt/pw-browsers`, con las bibliotecas que su propio `install --with-deps` declara.
- `BRW-02` Se poda el árbol: locales salvo `en-US`, `WidevineCdm` y el `ffmpeg` del grabador.
- `BRW-03` La imagen declara `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` y `ARCHIFY_CHROME=/usr/local/bin/chrome-for-archify`; `compose.yml` deja de ser el dueño de esas variables (`ARC-05` de [SPEC-030](030-archify-diagramas.md) queda superado).
- `BRW-04` `ARCHIFY_CHROME` es un envoltorio, no un enlace al binario: exporta un `HOME` escribible y añade `--no-sandbox`, `--disable-dev-shm-usage` y `--crash-dumps-dir`, y pasa los argumentos de archify tal cual. Sin el envoltorio el gate falla con `browser-check-runtime`, medido.
- `BRW-05` El gate visual corre de punta a punta desde la herramienta `bash` del agente, es decir bajo el sandbox del harness: `finalize` con los cuatro gates en `pass`.
- `BRW-06` El delta de imagen queda medido (`docker image inspect` antes y después) y declarado. El techo de 500 MB se fijó sobre una estimación que resultó falsa; el número que decide es el comprimido real.
- `BRW-07` El navegador sirve artefactos y servidores locales del workspace; ninguna herramienta del modelo gana navegación a internet y el catálogo no cambia.
- `BRW-08` `compose.yml` mantiene `shm_size: 512mb`, que no sirve al camino del agente —Landlock lo bloquea y el envoltorio usa disco— pero sí a una invocación directa del operador por `docker exec`.

## Fuera del alcance

- **`ffmpeg` y `ffprobe`**, con su costo medido (+451 MB por `apt`, 135-157 MB como estático): la skill `record-browser-gif` sigue bloqueada por esas dependencias, declarada como pendiente.
- Playwright como dependencia del agente: la imagen lleva el navegador, no el paquete; el repositorio usa el suyo y ambos apuntan a la misma revisión.
- Chrome DevTools MCP y Playwright MCP: descartados por costo de catálogo (~13,7k tokens permanentes).
- Dietar las bibliotecas que instala `playwright install --with-deps` a una lista propia: la primera lista curada se equivocó por 7×, así que no se repite sin medir.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `BRW-01` | El navegador está y responde | `docker exec … chrome-for-archify --version` |
| `BRW-02` | La poda no rompe el arranque | `docker exec … ls /opt/pw-browsers/*/chrome-linux*/locales` → sólo `en-US.pak`, sin `WidevineCdm` ni `ffmpeg-*` |
| `BRW-03` | Las dos variables llegan al proceso | `docker exec … printenv PLAYWRIGHT_BROWSERS_PATH ARCHIFY_CHROME` |
| `BRW-04` | El envoltorio es el que archify ejecuta | `head -6 /usr/local/bin/chrome-for-archify` dentro del contenedor |
| `BRW-05` | El gate pasa desde el agente | `finalize … --quality showcase --json` con `gates.browser-check: pass` en una sesión |
| `BRW-06` | El delta está medido y declarado | `docker image inspect --format '{{.Size}}'` antes y después |
| `BRW-07` | El catálogo no gana herramientas de navegación | `--dump-config` sin filas de navegación; el conteo no cambia |
| `BRW-08` | El shm del contenedor es mayor | `docker exec … df -h /dev/shm` → 512 MB |

## Restricciones

- Se conservan `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-IDENT-02` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-SEC-02`: un navegador con `--no-sandbox` dentro del contenedor se admite con justificación escrita y validación. La justificación: los namespaces de usuario ya están bloqueados para todo el contenedor —incluido `bash`, que tiene la misma red—, el navegador se usa sobre artefactos y servidores locales, y ninguna herramienta del modelo lo expone como navegador de internet.
- `SPEC-017` manda sobre el tamaño: el payload medido del navegador más sus bibliotecas es ~618 MB sin comprimir, así que el techo de 500 MB necesita el número comprimido de la imagen para decidirse. No se da la fase por validada sin él.
- Reproducibilidad: el navegador se fija por la versión de Playwright; el binario se resuelve en la build y la ruta queda dentro del envoltorio.

## Implementación prevista

- `mdl/docker/Dockerfile`: bloque de Playwright con `--no-shell`, la poda, el envoltorio y las dos variables.
- `mdl/docker/compose.yml`: `shm_size: 512mb`; la variable `ARCHIFY_CHROME` sale de ahí.
- `mdl/docker/README.md`: sección del navegador con los números y el diagnóstico del sandbox.
- `mdl/specs/030-archify-diagramas.md`: `ARC-05` marcado como superado.
- `mdl/ROADMAP.md`: fila de la fase.

## Validación ejecutada

Entorno: contenedor `mdl-harness`, imagen con el navegador instalado, 2026-11-12.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Los namespaces de usuario no están disponibles | Comprobado | `unshare(CLONE_NEWUSER)` → `-1`, `errno 1` (EPERM) |
| `/dev/shm` no es escribible bajo el sandbox | Comprobado | `touch /dev/shm/probe` → `Permission denied`; Chrome: `Creating shared memory … failed: Permission denied (13)` |
| `$HOME` no escribible aborta Chrome | Comprobado | `chrome_crashpad_handler: --database is required` y `rc=-5` (SIGTRAP) con `HOME=/home/node` |
| El envoltorio hace que Chrome renderice | Comprobado | Con `HOME` escribible y `--disable-dev-shm-usage`: `--dump-dom` → `<p>ok</p>` en 0,65 s, `rc=0` |
| **El gate visual pasa desde el sandbox del agente** | **Cumplido** | `finalize architecture … --quality showcase` → `ok: true`, `gates: validate pass, deliver pass, check pass, browser-check pass`, `browserCheck.ran: true` |
| Delta de la vía `apt` | Comprobado | +858 MB (240 paquetes); `chromium` solo +658 MB |
| Delta real de la vía Playwright | Comprobado | Navegador instalado 527 MB → 310 MB tras podar; bibliotecas +308 MB (100 paquetes, 603 MB totales contra 295 de antes) |
| La poda y el envoltorio funcionan sobre el árbol real | Comprobado | 220 locales → `en-US.pak`; `WidevineCdm` ausente; el envoltorio generado responde `--version` y archify lo ejecuta |
| `BRW-01`–`BRW-04`, `BRW-06`–`BRW-08` sobre la imagen nueva | No ejecutada | Pendiente de la build con `--no-shell` y el envoltorio |

## Resultado y pendientes

- Resultado: el requisito central está cumplido — el gate visual corre bajo el sandbox del agente y pasa —, y el empaquetado quedó corregido con `--no-shell` y el envoltorio. Falta la build que lo lleva a la imagen y el delta comprimido que decide el techo.
- Pendientes o excepciones aceptadas: `ffmpeg`/`ffprobe` fuera, con la skill de GIFs bloqueada; el techo de tamaño se re-decide con el número comprimido.
- Decisión de salida: pendiente de la medición sobre la imagen.
