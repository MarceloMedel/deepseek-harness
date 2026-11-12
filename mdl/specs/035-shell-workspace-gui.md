# SPEC-035 — Shell del workspace en la GUI

Estado: Validada
Fase: 35
Commit base: `33edd00411`
Aprobación: usuario en sesión Web, 2026-11-13 — «approved», alcance tal como está

## Objetivo

Que desde la propia GUI se puedan ejecutar comandos en las carpetas permitidas de la sesión —listar, inspeccionar, compilar, revisar el estado de un repositorio— sin abrir otra aplicación ni un cliente SSH en el teléfono o el portátil, y sin salir del límite que ya impone el sandbox del agente.

## Contexto

La GUI no ofrece hoy ninguna superficie de shell. [`packages/terminal`](../../packages/terminal/README.md) es una capacidad del agente —sesiones PTY persistentes para sus propias herramientas— y no una cara para el humano; su propietario es el `Agent` exacto, no la página.

El host ya tiene lo que un shell necesita: `ctx.shell` es el ejecutor bash del producto, confinado por [`dsh-bash-sandbox`](../../packages/shell/bash-sandbox/src/index.ts), y `ctx.sandboxPolicy` resuelve por sesión el modo y la carpeta permitida ([`sandbox-policy`](../../packages/sandbox/sandbox-policy/src/index.ts)). El asiento `shell.overlay` es la capa de marco pensada para una superficie aditiva y click-through.

Un plugin Cordis dinámico validó la forma del resultado y, con ella, dos hechos que esta especificación hereda: `cd / && ls` funciona porque **leer está permitido en todos los modos**, y una escritura fuera de la raíz falla con `Permission denied` mientras una escritura dentro se completa. La frontera es de escritura, no de lectura.

Los bundles hermanos de la GUI ([`mdl/plugins/html-preview`](../plugins/html-preview/README.md), [`chat-files`](../plugins/chat-files/README.md)) fijan la forma del paquete: `host.mjs` + `client.js` + `cordis.patch.yml` + `install.sh` + `check.mjs`, con el texto de producto en inglés y español dentro de `client.js`.

## Alcance

- Un bundle nuevo `mdl/plugins/shell-panel/` publicado como `dsh-shell-panel`, con una fila en la capa de parche del perfil.
- Una única superficie nueva en la GUI: un botón flotante `>_` registrado en `shell.overlay` que abre y cierra un cajón. No se ocupa ninguna otra celda.
- Cada comando es **una ejecución en primer plano independiente** a través de `ctx.shell`, con `workdir` y `sandboxPolicy` resueltos por sesión.
- Salida incremental mientras el proceso corre, y el código de salida al terminar; `Stop` mata el grupo de procesos.
- Un **directorio recordado por sesión**, en memoria del host: un `cd` al inicio del comando mueve el directorio desde el que arranca el siguiente; `cd`, `cd ~` y `cd` sin argumento vuelven a la raíz del workspace; `cd -` no lo cambia.
- La cabecera del cajón muestra el directorio recordado y el modo de sandbox resueltos para la sesión actual.
- El directorio recordado nunca sale de la raíz: toda ruta propuesta se resuelve y se comprueba con `ctx.fs` antes de adoptarla, y una ruta inexistente, un archivo o una ruta fuera de la raíz simplemente no lo mueven.
- Historial de comandos de la sesión de la página, navegable con `↑`/`↓`, y scrollback por bloque acotado.
- El cajón funciona también sin sesión abierta: en ese caso resuelve la política de respaldo del despliegue, que es la que ya usa una llamada sin sesión.
- El texto de la interfaz en inglés y español ([`MDL-LOCALE-01`](../PRODUCT_SPEC.md)).

## Fuera del alcance

- **Sesiones PTY persistentes**, estado de shell entre comandos (`export`, alias, funciones, historial del propio bash) y programas interactivos (`python3`, `psql`, `top`, `less`). La decisión está tomada: la Fase 35 no los ofrece, y `packages/terminal` queda como el seam para una fase posterior si se pide.
- Emulación de terminal (xterm u otra), color y secuencias ANSI: la salida se muestra como texto plano en un bloque.
- Gating por `ctx.approval` para los comandos escritos por el humano: el iniciador es la persona que escribe en su propia GUI, y el límite es el sandbox, que no se relaja. Una ejecución en segundo plano, jobs, o cualquier forma de comando que el agente pudiera disparar sí quedaría fuera de este permiso y no se incluye aquí.
- Persistencia durable del scrollback o del historial entre reinicios del proceso o recargas de la página.
- Cambiar el asiento del botón al header de la sesión, o cualquier otra ubicación: descartado por el usuario en esta fase.
- Modificar la herramienta `bash` del agente, el seam `ctx.shell`, `packages/terminal` o `packages/sandbox`.
- Ejecutar en una raíz distinta de la que resuelve `ctx.sandboxPolicy` para la sesión.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `SHL-01` | El botón `>_` abre el cajón y `Close` lo cierra; el cajón muestra el directorio recordado y el modo resueltos para la sesión | `check.mjs`: montaje en jsdom, clic en el botón y lectura del texto de la cabecera |
| `SHL-02` | Un comando se ejecuta con `workdir` igual al directorio recordado y devuelve su salida y su código de salida | `check.mjs`: host montado sobre shell real, `echo` y `pwd`, y comparación del `workdir` |
| `SHL-03` | Un `cd` al inicio del comando mueve el directorio del siguiente comando; `cd ..`, una ruta relativa y `cd ~` resuelven como en bash | `check.mjs`: secuencia de comandos con `pwd` entre ellos |
| `SHL-04` | Una ruta inexistente, un archivo o una ruta fuera de la raíz no mueven el directorio recordado | `check.mjs`: casos negativos sobre el resolvedor |
| `SHL-05` | Una escritura fuera de la raíz falla con código de salida distinto de cero y el bloque se marca como denegado por el sandbox; una escritura dentro se completa | `check.mjs`: prueba negativa y positiva obligatoria ([`MDL-SEC-02`](../PRODUCT_SPEC.md)) |
| `SHL-06` | `Stop` mata el grupo de procesos y el bloque deja de estar en ejecución | `check.mjs`: comando de larga duración, `Stop`, y estado final del proceso |
| `SHL-07` | El cajón se abre y ejecuta sin sesión abierta, usando la política de respaldo | `check.mjs`: montaje sin sesión actual |
| `SHL-08` | El texto visible está en inglés y en español, y ningún literal queda fuera de la tabla de cadenas | Revisión de `client.js` y regla del `check.mjs` sobre las claves de ambas tablas |
| `SHL-09` | La fila se compone desde `cordis.patch.yml` en el arranque siguiente del proceso, y el proceso en marcha conserva su configuración | `install.sh` idempotente, reinicio del perfil de preview y comprobación de la superficie |
| `SHL-10` | Los colores salen de tokens semánticos y los tres temas siguen legibles | Revisión de `client.js` y validación visual ([`MDL-THEME-01`](../PRODUCT_SPEC.md), [`MDL-THEME-02`](../PRODUCT_SPEC.md)) |
| `SHL-11` | Una petición de otro origen, con marcador `cross-site` o con un tipo de contenido que un formulario pueda enviar, se rechaza sin ejecutar nada | `check.mjs`: casos negativos sobre la ruta, con y sin `Origin` |

## Restricciones

- [`MDL-SEC-02`](../PRODUCT_SPEC.md): la superficie **no relaja** el sandbox. Ejecuta con la misma política que la herramienta `bash` del agente y no ofrece ningún camino para ampliarla; la escalada sigue siendo una decisión explícita e independiente de otra especificación.
- La ruta propia no hereda el plano autenticado de `PRIVILEGED_METHODS` (`SPEC-024`), así que el bundle trae su propio fence, con la misma forma que la ruta de adjuntos: solo `POST` con `application/json` —un formulario no puede declararlo—, `Origin` presente debe nombrar este mismo host y `sec-fetch-site: cross-site` se rechaza.
- [`MDL-SEC-01`](../PRODUCT_SPEC.md): ninguna prueba, registro ni captura incorpora credenciales.
- [`MDL-ENV-01`](../PRODUCT_SPEC.md): el trabajo no sustituye la GUI de `127.0.0.1:3080`; la validación usa el perfil de preview y el reinicio del proceso propio.
- [`MDL-LOCALE-01`](../PRODUCT_SPEC.md): inglés y español, sin variante en chino.
- [`MDL-UPSTREAM-01`](../PRODUCT_SPEC.md): el cambio es aditivo y vive en `mdl/plugins/`, sin tocar `packages/`.
- Las reglas de [packages/client/AGENTS.md](../../packages/client/AGENTS.md) aplican a la mitad de navegador: composición solo por slots, CSS propio con tokens, sin librería de componentes.
- El breakpoint móvil es el del shell (767 px) y el cajón debe respetar el área segura inferior y la banda del botón de menú, igual que el visor de HTML.

## Implementación prevista

Un bundle nuevo en `mdl/plugins/shell-panel/`. La mitad de host consume `shell`, `sandboxPolicy`, `fs` y `sessions` —sin publicar servicio, así que la fila no necesita realm— y expone las operaciones del cajón a la de navegador por el mismo mecanismo que usan los bundles hermanos; retiene los procesos vivos por sesión y los mata al descargarse el plugin. La mitad de navegador registra una única entrada en `shell.overlay` con el botón y el cajón, guarda el scrollback y el historial de la página, y consulta la mitad de host en cada comando y mientras el proceso corre. `install.sh` sigue el patrón de los hermanos: publica el bundle en `profiles/node_modules` y añade la fila a la capa de parche del perfil. `check.mjs` cubre los requisitos de la tabla sin navegador ni proceso en marcha. El README del bundle y la nota de agente se escriben en el mismo cambio.

## Validación ejecutada

Ejecutada el 2026-11-13 en `main`, sobre el checkout `/srv/projects/deepseek-harness`. El entorno no expone `pnpm` en el `PATH`; las compuertas que lo necesitan se ejecutaron con el que aporta `corepack`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `node check.mjs` (`mdl/plugins/shell-panel`) | Pasa | 54 de 54 comprobaciones, sin pendientes |
| `SHL-01` (cajón y cabecera) | Pasa | El botón abre el cajón, `Close` lo cierra, y la cabecera imprime `/ws/sub` y `workspace-write`, que es lo que el host resolvió |
| `SHL-02` (ejecución y código de salida) | Pasa | `pwd` corre con `workdir` igual al directorio recordado y devuelve `exit 0` |
| `SHL-03` (`cd` mueve el directorio) | Pasa | `cd sub && pwd` deja el siguiente `pwd` en `sub`; `cd ..`, `cd ~` y `cd` a secas resuelven como bash |
| `SHL-04` (rutas no adoptadas) | Pasa | `/etc`, una ruta inexistente y un archivo dejan el directorio recordado donde estaba; un `cd` que no es la primera palabra tampoco lo mueve |
| `SHL-05` (fence de escritura) | Pasa | Sobre el runner real: una escritura dentro de la raíz se completa con `exit 0`; una fuera se rechaza con `exit` distinto de cero y `denied: true` |
| `SHL-06` (`Stop`) | Pasa | `sleep` se mata, el bloque deja de estar en ejecución y un comando nuevo arranca después |
| `SHL-07` (sin sesión) | Pasa | La clave `none` resuelve la política de respaldo y el cliente la usa cuando no hay sesión en escena. En el despliegue, `GET /shell-panel/none/info` responde `200` con `workspace-write` y raíz `/workspace` |
| `SHL-08` (inglés y español) | Pasa | Las dos tablas declaran las mismas claves y el cajón cambia a español al cambiar la locale, con inglés como respaldo |
| `SHL-09` (instalación) | Pasa | `install.sh` publica el bundle y añade la fila una sola vez; en el despliegue reconstruido la fila se compuso: `/plugins/dsh-shell-panel/client.js` se sirve con `200`, `/shell-panel/none/info` responde `200` y `POST /shell-panel/none/start` con `pwd && echo dsh-shell-panel-live` devuelve `exit 0` con la salida correcta |
| `SHL-10` (tokens) | Pasa | La hoja de estilos no declara ningún color literal y usa tokens semánticos; el usuario confirmó la legibilidad en los temas claro, oscuro y sistema sobre el despliegue |
| `SHL-11` (fence de petición) | Pasa | Se rechazan el tipo de contenido que un formulario puede enviar, un `Origin` ajeno, `sec-fetch-site: cross-site` y cualquier método que no sea `GET`/`POST`; la ruta de lectura lleva el mismo fence |
| `node --experimental-strip-types scripts/verify-agent-note-format.ts` | Pasa | 552 notas de agente conformes, incluida la nueva |
| `node --experimental-strip-types scripts/verify-md-wrap.ts` | Pasa | 947 archivos sin prosa partida |
| Reconstrucción de la imagen y arranque del contenedor | Pendiente | Requiere `pnpm`/Docker en un entorno que este agente no tiene |
| Validación en teléfono y escritorio sobre el despliegue reconstruido | Pendiente | Requiere la imagen reconstruida y el proceso reiniciado |
| `pnpm run doc-sync` | Pasa | 26 compuertas, 0 fallos, incluida la de presupuestos de documentación y la de notas de agente |

## Resultado y pendientes

- Resultado: implementado, y compuesto en el despliegue reconstruido: el bundle instalado es el que sirve la ruta y responde por HTTP con la política de la sesión. También verificado en las dos mitades sin navegador ni proceso en marcha. Los tres requisitos negativos (`SHL-04`, `SHL-05`, `SHL-11`) se ejercen sobre el ejecutor y el runner reales, no sobre un doble.
- Comportamiento observado al desplegar: una página ya cargada no adopta un plugin añadido al manifiesto con posterioridad, porque el manifiesto se inyecta en el HTML de arranque y el HMR solo refresca los módulos que la página ya tiene. La superficie aparece al recargar la página o al reabrir la app instalada; no es un defecto del bundle y no requiere otro despliegue.
- Pendientes o excepciones aceptadas: ninguna. Las compuertas de `doc-sync` sí se ejecutaron, con el `pnpm` que aporta `corepack`: 26 compuertas, 0 fallos. La legibilidad en los tres temas y el cajón en el teléfono los confirmó el usuario sobre el despliegue reconstruido.
- Decisión de salida: la Fase 35 se cierra como Validada; el despliegue ya la sirve y no requiere otra reconstrucción.
