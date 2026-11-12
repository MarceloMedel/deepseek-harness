# SPEC-032 — Navegador headless para el gate visual

Estado: En implementación
Fase: 32
Commit base: `75ae735ccc`
Aprobación para iniciar: usuario, 2026-11-12 — «continua con ambas tareas», sobre las dos de la Tanda 2: el navegador en la imagen y la medición bajo el sandbox, con el tamaño medido antes de aceptarlo y techo de 500 MB.

## Objetivo

Que el gate visual de `archify` corra dentro del contenedor sobre artefactos del workspace, sin depender de la máquina del operador y sin salirse del techo de tamaño que el despliegue se impuso.

## Contexto

La Tanda 2 propuso «navegador headless y `ffmpeg`» con una estimación de 350-400 MB. Medido antes de escribir código, la estimación estaba mal en las dos direcciones: la vía de `apt` cuesta más del doble, y la de Playwright cuesta menos.

Hechos medidos el 2026-11-12 en este contenedor:

- **Namespaces de usuario bloqueados**: `unshare(CLONE_NEWUSER)` devuelve `EPERM` con `max_user_namespaces=41113` y `unprivileged_userns_clone=1`; el límite es del perfil del contenedor, no del kernel. Es el mismo que ya obliga a landlock en lugar de bwrap (`SPEC-004`). Consecuencia: el sandbox propio de Chromium no puede inicializar.
- **`archify` sólo pasa `--no-sandbox` como root o con `ARCHIFY_CHROME_NO_SANDBOX=1`** (`bin/visual-check.mjs:1519`-`1549`). El contenedor corre como `node` (uid 1000), así que sin la variable el navegador arranca con su sandbox y falla.
- **`archify` busca el binario** en `PATH` (`chrome`, `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`) o en `ARCHIFY_CHROME` (`:1326`, `:1345`). No descarga nada.
- **`/dev/shm` son 64 MB** y los argumentos de `archify` son fijos: no pasa `--disable-dev-shm-usage`, así que la palanca es el shm del contenedor.
- **`apt` no entra en el techo**: `chromium` + `ffmpeg` + `fonts-liberation` con `--no-install-recommends` resuelven **+858 MB** (240 paquetes) sobre lo ya instalado; sólo `chromium` son **+658 MB**, con `libllvm15` (112 MB), `chromium-common` (66 MB), `libicu72` (35 MB), `libgl1-mesa-dri` (25 MB) y `adwaita-icon-theme` (20 MB) detrás.
- **El navegador de Playwright entra**: 379 MB en disco (de los cuales `chrome` 266 MB, `locales` 50 MB y `WidevineCdm` 21 MB) más **+40 MB** de 50 paquetes de bibliotecas que Playwright declara.
- **Una sola versión de navegador sirve para todo**: el lockfile del repositorio fija `playwright@1.61.1`, cuyo navegador es justamente el `chromium-1228` que el workspace ya tiene descargado. Fijar esa versión en la imagen fija la revisión del navegador, que es la reproducibilidad que `apt` no da.
- **`ffmpeg` no entra junto al navegador**: el paquete de Debian cuesta **+451 MB** (arrastra `libsdl2` → mesa → `libllvm15`) y los builds estáticos de BtbN pesan 135-157 MB comprimidos. Con el navegador dentro, cualquiera de las dos vías rompe el techo.

## Alcance

- `BRW-01` La imagen instala el navegador de `playwright@1.61.1` en `/opt/pw-browsers`, con las bibliotecas que su propio `install --with-deps` declara.
- `BRW-02` Se poda el árbol instalado: locales salvo `en-US` y el árbol `WidevineCdm`, que no sirven a ningún artefacto local (71 MB juntos).
- `BRW-03` La imagen declara `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, `ARCHIFY_CHROME=/usr/local/bin/chrome-for-archify` (enlace al binario instalado) y `ARCHIFY_CHROME_NO_SANDBOX=1`; `compose.yml` deja de ser el dueño de esas variables (`ARC-05` de [SPEC-030](030-archify-diagramas.md) queda superado).
- `BRW-04` `compose.yml` fija `shm_size: 512mb`.
- `BRW-05` El gate visual corre de punta a punta: `finalize` sobre un artefacto real responde `browser-check: pass`, ejecutado desde la herramienta `bash` del agente, es decir bajo el sandbox del harness.
- `BRW-06` El delta de imagen queda medido sobre la imagen construida y es menor que 500 MB.
- `BRW-07` El navegador sirve artefactos y servidores locales del workspace; ninguna herramienta del modelo gana navegación a internet y el catálogo no cambia.

## Fuera del alcance

- **`ffmpeg` y `ffprobe`**, con su costo medido arriba: la skill `record-browser-gif` sigue bloqueada por esas dependencias y queda declarada como pendiente, no como resuelta. Incluirlo exige una decisión de tamaño propia.
- Playwright como dependencia del agente: la imagen lleva el navegador, no el paquete. El repositorio sigue usando el suyo (`devDependency`), y ahora ambos apuntan a la misma revisión.
- Chrome DevTools MCP y Playwright MCP: descartados por costo de catálogo (~13,7k tokens permanentes) frente a un CLI que no cuesta nada.
- Fijar la versión de Debian de las bibliotecas que instala `playwright install --with-deps`: se declaran como paquetes del sistema, no se fijan por sha256 como los binarios de SPEC-031.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `BRW-01` | El navegador está y responde | `docker exec … /usr/local/bin/chrome-for-archify --version` |
| `BRW-02` | La poda no rompe el arranque | `docker exec … ls /opt/pw-browsers/*/chrome-linux*/locales` → sólo `en-US.pak`; el gate de `BRW-05` sigue en `pass` |
| `BRW-03` | Las tres variables llegan al proceso | `docker exec … printenv PLAYWRIGHT_BROWSERS_PATH ARCHIFY_CHROME ARCHIFY_CHROME_NO_SANDBOX` |
| `BRW-04` | El shm del contenedor es mayor | `docker exec … df -h /dev/shm` → 512 MB |
| `BRW-05` | El gate visual pasa desde el agente | `finalize … --quality showcase --json` con `gates.browser-check: pass` sobre un artefacto real, ejecutado en una sesión |
| `BRW-06` | El delta está dentro del techo | `docker image inspect --format '{{.Size}}'` antes y después |
| `BRW-07` | El catálogo no gana herramientas de navegación | `--dump-config` sin filas de navegación; el conteo de herramientas no cambia |

## Restricciones

- Se conservan `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-IDENT-02` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-SEC-02`: un navegador con `--no-sandbox` dentro del contenedor se admite con justificación escrita y validación. La justificación: los namespaces de usuario ya están bloqueados para todo el contenedor —incluido `bash`, que tiene la misma red—, el navegador se usa sobre artefactos y servidores locales, y ninguna herramienta del modelo lo expone como navegador de internet.
- `SPEC-017` manda sobre el tamaño: el delta estimado es ~350 MB y su techo es 500 MB, medido sobre la imagen construida. Si la medición real lo pasa, la fase se replantea.
- Reproducibilidad: el navegador se fija por la versión de Playwright, y `chrome` se verifica por la ruta resuelta en la build.

## Implementación prevista

- `mdl/docker/Dockerfile`: bloque de Playwright con `install --with-deps chromium`, la poda y las tres variables.
- `mdl/docker/compose.yml`: `shm_size: 512mb`; la variable `ARCHIFY_CHROME` sale de ahí.
- `mdl/docker/README.md`: sección del navegador, con los números medidos, la razón del `--no-sandbox` y el pendiente de `ffmpeg`.
- `mdl/specs/030-archify-diagramas.md`: `ARC-05` marcado como superado.
- `mdl/ROADMAP.md`: fila de la fase.

## Validación ejecutada

Entorno: contenedor `mdl-harness` con la imagen de `75ae735ccc`, 2026-11-12.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Los namespaces de usuario no están disponibles | Comprobado | `unshare(CLONE_NEWUSER)` → `-1`, `errno 1` (EPERM) |
| `archify` exige la variable para arrancar sin su sandbox | Comprobado | Sólo antepone `--no-sandbox` con uid 0 o `ARCHIFY_CHROME_NO_SANDBOX=1`; el proceso corre como uid 1000 |
| El shm actual es el modo de falla conocido | Comprobado | `df -h /dev/shm` → `64M`; los flags de `archify` no incluyen `--disable-dev-shm-usage` |
| Delta de la vía `apt` | Comprobado | +858 MB (240 paquetes) sobre lo instalado; `chromium` solo +658 MB con `libllvm15` 112 MB |
| Delta de la vía Playwright | Comprobado | Navegador 379 MB en disco (medido sobre `chromium-1228` del workspace) + 40 MB de 50 paquetes de bibliotecas |
| La poda propuesta recupera espacio real | Comprobado | `locales` 50 MB (220 archivos) y `WidevineCdm` 21 MB sobre `chromium-1228` |
| `ffmpeg` no entra junto al navegador | Comprobado | Debian +451 MB; builds estáticos de BtbN 135-157 MB comprimidos |
| El Chromium del workspace no arranca hoy | Comprobado | `chrome --version` → `libglib-2.0.so.0: cannot open shared object file` |
| La poda y la resolución del binario funcionan sobre el árbol real | Comprobado | Sobre una copia de `chromium-1228`: 220 locales → `en-US.pak`, `WidevineCdm` eliminado, árbol resultante 310 MB, y el patrón `*chrome-linux*/chrome` resuelve el binario |
| `BRW-01`–`BRW-07` | No ejecutada | Pendiente de la build y del reinicio |

## Resultado y pendientes

- Resultado: pendiente. La decisión de qué navegador entra se tomó con números medidos, no con la estimación de la propuesta; la implementación está escrita y la comprobación depende de la imagen reconstruida.
- Pendientes o excepciones aceptadas: `ffmpeg`/`ffprobe` quedan fuera y la skill de GIFs sigue bloqueada por ellos; si el delta real supera 500 MB, la fase se replantea.
- Decisión de salida: pendiente de la medición sobre la imagen.
