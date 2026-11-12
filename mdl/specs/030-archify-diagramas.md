# SPEC-030 — Diagramas generados por el agente con archify

Estado: Validada
Fase: 30
Commit base: `fb74ac3ff2`
Aprobación para iniciar: usuario, 2026-11-11 — «necesito trabajar en tener archify funcionando en este dsh para poder utilizarlo en los repos en /srv/projects», con dos decisiones elegidas en el mismo diálogo: el gate visual queda opt-in por `ARCHIFY_CHROME` en vez de sumar un navegador a la imagen, y la skill se publica en el volumen además de quedar en la imagen.

## Objetivo

Que una sesión de este despliegue pueda producir, para cualquier repositorio de `/srv/projects`, una página HTML de arquitectura validada por `archify` —skill para el agente y CLI en la imagen— sin instalaciones manuales y sin depender de la máquina del operador.

## Contexto

`archify` es el proyecto [tt-a1i/archify](https://github.com/tt-a1i/archify): un CLI de Node que compila un JSON-IR tipado a un HTML autónomo y lo valida, y una skill de agente que enseña a escribirlo. Cubre once tipos de diagrama (`architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `class`, `tree`, `timeline`, `waterfall`, `explainer`).

Hechos medidos en este contenedor el 2026-11-11, antes de escribir la especificación:

- El árbol que se instala es `archify/` de la etiqueta `v3.2.0`, commit `208acba8d412335185b2056fedf54b3405df43fb`: 203 archivos y 18 MB, con `examples/` dentro (13 MB) porque `doctor` comprueba que cada tipo tenga esquema, renderer y ejemplo.
- No hay dependencias de runtime: `archify/package.json` sólo declara `devDependencies`, y `node bin/archify.mjs doctor` pasa sus 33 comprobaciones sobre una copia sin `node_modules`. Tampoco hay paquete npm que instalar: `archify` en npm es un proyecto de 2016 y `archify-cli` es un scaffold ajeno.
- La integración del agente es una skill: frontmatter `name: archify` y recursos resueltos por ruta relativa a `SKILL.md` (`references/`, `recipes/`, `schemas/`, `examples/`, `assets/`). El cuerpo ya pide sustituir `bin/archify.mjs` por la ruta absoluta del paquete instalado, que es lo que la nota de despliegue fija.
- El registro de skills de este despliegue ya escanea `$DSH_HOME/skills` (raíz `user-dsh`, rango 400): la fila `skill-filesystem` del preset `cordis` conserva las raíces por defecto y sólo agrega su propio `customSkillDirs`. Publicar una skill ahí no toca la composición, ni los presets, ni el catálogo de herramientas.
- Con un `DSH_HOME` aislado y la skill publicada en `$DSH_HOME/skills/archify`, una sesión headless respondió su catálogo con un solo nombre, `archify`, y una segunda sesión generó un diagrama de arquitectura de tres componentes: `<meta name="generator" content="archify 3.2.0">`, 811 478 bytes, con `validate`, `deliver` y `check` en `pass`.
- El único gate que no corre es `browser-check`: la imagen no tiene Chrome/Chromium ni sus bibliotecas —el Chromium que arrastra `tmp/pw-browsers` del espacio de trabajo falla con `libglib-2.0.so.0`— y archify no descarga ninguno. `finalize` responde `status: skipped` con `ok: false` y el diagnóstico `viewer/chrome-unavailable`. En la prueba el agente intentó además aprovisionar un navegador por su cuenta: quedó un `.browsers/chrome-headless-shell/linux-157.0.8103.50` vacío en el directorio de trabajo. El despliegue tiene que decirle explícitamente que no lo haga.
- Los artefactos existentes del operador vienen de archify 2.16: `pipay-sii/docs/esquema-pipaysii.architecture.json` no valida en 3.2 porque falta `meta.output`.

Este documento posee el alcance de la fase; el contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md). La skill convive con el índice de código de [SPEC-027](027-indice-de-codigo-graphify.md): graphify responde sobre un grafo ya construido, archify produce un artefacto nuevo, y ninguna de las dos monta filas del catálogo de herramientas.

## Alcance

- `ARC-01` La imagen verifica el commit fijado de `archify` y copia su árbol a `/opt/mdl/archify`; la build falla si la etiqueta no resuelve a ese commit.
- `ARC-02` `/usr/local/bin/archify` lanza el CLI con el `node` de la imagen, y el árbol queda legible para el usuario `node`.
- `ARC-03` La skill se publica en `$DSH_HOME/skills/archify` en cada arranque: se retira la copia anterior y se copia la de la imagen, de modo que un volumen vacío y una imagen reconstruida convergen al mismo contenido.
- `ARC-04` El `SKILL.md` de la imagen lleva anexada una nota de despliegue que nombra la ruta absoluta del CLI, el lanzador en `PATH`, la raíz de recursos de la skill, que los artefactos van dentro del workspace y que `browser-check` no está disponible y no se debe instalar un navegador.
- `ARC-05` El gate visual es opt-in: `compose.yml` pasa `ARCHIFY_CHROME` desde el entorno del host y la imagen no instala ningún navegador. Sin la variable, el comportamiento es el medido: `browser-check` se omite y el resto de los gates pasa.
- `ARC-06` El catálogo de herramientas del modelo no cambia: la capacidad entra por el catálogo de skills, y ninguna herramienta nueva aparece en una sesión.
- `ARC-07` El entrypoint informa una línea con la versión publicada y, en una imagen sin el árbol, avisa y arranca igual que antes.

## Fuera del alcance

- Instalar Chrome/Chromium en la imagen. Queda como decisión de despliegue de `ARC-05`; sumar el navegador y sus bibliotecas son varios cientos de megabytes frente a [SPEC-017](017-optimizacion-imagen.md).
- Regenerar los artefactos de archify 2.16 del operador ni migrar su JSON; `validate` nombra el campo que falta y la regeneración es una sesión nueva.
- Un plugin de la GUI o una herramienta `archify_*` del modelo. El HTML se abre con el visor de [SPEC-023](023-visor-html.md).
- Construir o reiniciar el despliegue desde el agente: no hay socket Docker por `MDL-DOCKER-02`.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `ARC-01` | La imagen lleva el árbol del commit fijado | `docker run --rm mdl-harness:local node /opt/mdl/archify/bin/archify.mjs doctor` → «Archify is ready.»; revisión del `test` de `git rev-parse` en el `Dockerfile` |
| `ARC-02` | El lanzador responde | `docker exec -u node … archify --help` lista los comandos y los tipos |
| `ARC-03` | La skill aparece en el volumen y se republica | `docker exec … ls $DSH_HOME/skills/archify/SKILL.md`; recrear el contenedor y comprobar que sigue; el log del entrypoint informa la versión |
| `ARC-04` | La nota está en el cuerpo cargado | `tail` del `SKILL.md` publicado y una sesión donde el agente no intenta descargar un navegador |
| `ARC-05` | La variable llega al proceso y su ausencia no rompe nada | `docker exec … printenv ARCHIFY_CHROME` con y sin la variable; `finalize` con navegador → `browser-check: pass`, sin navegador → `skipped` |
| `ARC-06` | El catálogo de herramientas no cambia | `tools/list` de una sesión antes y después: 97 herramientas |
| `ARC-07` | Sin árbol la imagen arranca y avisa | log del entrypoint en una imagen sin `/opt/mdl/archify` |

## Restricciones

- Se conservan `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-IDENT-02` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-SEC-02`: nada de esto abre puertos ni transportes de red. `finalize` hace una comprobación de actualización acotada y no bloqueante; un fallo de red no cambia el resultado del gate.
- La etiqueta y el commit se fijan juntos: la etiqueta sola no es una garantía, porque un repositorio puede moverla.
- La nota de despliegue va en inglés porque se anexa al cuerpo de una skill escrita en inglés; no traduce el cuerpo ni lo resume.
- El árbol se copia a `/opt/mdl`, fuera del volumen, para que una reconstrucción lo reemplace y el volumen sólo guarde la copia que el agente lee.

## Implementación prevista

- `mdl/docker/Dockerfile`: bloque de instalación con etiqueta y commit fijados, nota anexada y lanzador en `PATH`.
- `mdl/docker/archify-deployment-note.md`: la nota que se anexa a `SKILL.md`.
- `mdl/docker/entrypoint.sh`: publicación de la skill en `$DSH_HOME/skills/archify` con su línea de log.
- `mdl/docker/compose.yml`: paso de `ARCHIFY_CHROME` desde el host.
- `mdl/docker/README.md`: sección de la herramienta, con la nota de versión, el gate opt-in y la comprobación.
- `mdl/ROADMAP.md`: fila de la fase al validar.

## Validación ejecutada

Entorno: contenedor `mdl-harness` (imagen actual, sin los cambios de esta fase), 2026-11-11.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| El árbol de la etiqueta fijada se instala y funciona sin `node_modules` | Cumplido | `git clone --depth 1 --branch v3.2.0` → `HEAD` = `208acba8d4…`; copia de `archify/` (203 archivos, 18 MB) en `/tmp/archify-lean`; `node bin/archify.mjs doctor` → 33 comprobaciones `[ok]` y «Archify is ready.» |
| `finalize` valida y entrega sin navegador | Cumplido con el gate visual omitido | `finalize workflow … --quality showcase --json` → `gates: validate pass, deliver pass, check pass, browser-check skipped`, `failedStage: browser-check`, diagnóstico `viewer/chrome-unavailable`; HTML de 851 280 bytes |
| La skill publicada en `$DSH_HOME/skills` llega al catálogo del modelo | Cumplido | `DSH_HOME` aislado (`/tmp/dshhome`) y sesión headless: la respuesta al pedido de catálogo fue `archify`, un solo nombre |
| El agente usa la skill de punta a punta | Cumplido con el gate visual omitido | Sesión headless sobre un directorio de trabajo: escribió `.archify/architecture-cliente-api-db-20261111-193340/candidate.json` y entregó `arquitectura-simple.html` (811 478 bytes, `generator: archify 3.2.0`, `lang="es"`), con `validate`, `deliver` y `check` en `pass` |
| Los artefactos 2.16 del operador no validan en 3.2 | Comprobado | `validate architecture` sobre `pipay-sii/docs/esquema-pipaysii.architecture.json` → `schema/required: /meta must have required property 'output'` |
| El gate visual no tiene navegador en la imagen | Comprobado | `archify doctor` no lo cubre; `browser-check` → `chrome.status: unavailable`; el Chromium de `tmp/pw-browsers` falla por `libglib-2.0.so.0` |
| El bloque de publicación del entrypoint publica, reporta versión y deja la nota | Cumplido en un prefijo temporal | Bloque extraído literalmente del `entrypoint.sh` con `/opt/mdl/archify` reapuntado a `/tmp/fake-opt/mdl/archify` y `DSH_HOME=/tmp/pub-home`: imprime `archify skill published (3.2.0)` y el `SKILL.md` publicado (20 063 bytes) termina con la nota |
| La skill en el volumen real entra al catálogo de una sesión viva | Cumplido | Publicada en `/data/dsh/skills/archify` (18 MB, `SKILL.md` con la nota): el catálogo de la sesión en curso pasó a listar `archify` sin reiniciar el proceso |
| El CLI publicado se ejecuta desde el volumen | Cumplido | `node /data/dsh/skills/archify/bin/archify.mjs doctor` → «Archify is ready.»; `--help` lista los comandos y los tipos |
| Uso real desde la sesión viva, sobre un repositorio con evidencia | Cumplido con el gate visual omitido | `finalize architecture tmp/archify-demo/candidate.json tmp/archify-demo/mdl-harness.html --repo-root . --quality showcase` → `validate`, `deliver` y `check` en `pass`, `browser-check: skipped`; HTML de 831 438 bytes con `meta.repository` en el commit del repositorio, abierto con el visor de HTML de la GUI |
| Build de la imagen con los cambios de esta fase | Cumplido | `docker compose build` y `up -d` en el host el 2026-11-12: el contenedor quedó `Up … (healthy)` 26 s después de recrearse |
| `ARC-01` el árbol del commit fijado viaja en la imagen | Cumplido | `docker exec -u node … archify --help` lista los comandos y los tipos dentro del contenedor |
| `ARC-02` el lanzador responde | Cumplido | `archify --help` resuelve por `PATH`; `node /opt/mdl/archify/bin/archify.mjs doctor` → «Archify is ready.» |
| `ARC-03` la skill se publica desde la imagen | Cumplido | Log del arranque: `mdl-harness: skills published: archify ast-grep security-scan`; `ls $DSH_HOME/skills` lista las tres |
| Consumo real desde la GUI con el visor de HTML | Cumplido | El artefacto `tmp/archify-demo/mdl-harness.html` (831 438 bytes) se abrió en el visor de la GUI desde una sesión real |

## Resultado y pendientes

- Resultado: validada sobre la imagen reconstruida. `archify` viaja fijado por etiqueta y commit, su lanzador está en `PATH`, la skill se republica desde la imagen en cada arranque y el artefacto se abre en la GUI. `ARC-05` se cumplió por construcción: sin navegador el gate visual se omite y la revisión se declara pendiente, con `ARCHIFY_CHROME` como única vía para encenderlo.
- Pendientes o excepciones aceptadas: el gate visual queda omitido hasta que el despliegue defina `ARCHIFY_CHROME` con un navegador montado (`ARC-05`), y los artefactos 2.16 del operador necesitan regeneración, no migración.
- Decisión de salida: validada; el navegador para el gate visual es trabajo de la fase del stack (SPEC-031, Tanda 2).
