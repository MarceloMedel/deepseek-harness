# SPEC-026 — Herramientas externas reproducibles: búsqueda multi-proveedor y MCP de Neon

Estado: En implementación
Fase: 26
Commit base: `155a833200` (la rama se corta después de que aterricen SPEC-025 y la corrección de argumentos de herramientas, que hoy están sin confirmar en `main`)
Aprobación para iniciar: usuario, 2026-11-09 — aprobado el borrador completo: montaje dedicado `MDL_NEON_DIR`, `NEON_PROJECT_ID` por entorno y migración del volumen que retira la fila y el paquete escritos a mano

## Objetivo

Que una imagen reconstruida y un volumen vacío reproduzcan, sin ediciones manuales, el estado que hoy existe a mano en el volumen del VPS: `web_search` servido por el bundle multi-proveedor `dsh-web-search-multi` y las herramientas del MCP de Neon en modo de solo lectura, con la credencial de Neon fuera del repositorio, de la imagen y del volumen, y sin aparecer nunca en el entorno del proceso ni en los registros.

## Contexto

El 2026-11-09 se habilitaron en el contenedor en ejecución dos capacidades que no están en el repositorio. Ambas funcionan y están medidas, y ambas viven sólo en el volumen `mdl-dsh-home`:

- `dsh-web-search-multi` v0.1.0 (`github:cinob/dsh-web-search-multi`, commit `9821080e36dbd81dd75fd582fb687944244ec293`), copiado a `profiles/node_modules/` con sus dos entradas de parche añadidas a `profiles/web/cordis.patch.yml`. Reemplaza al proveedor `deepseek-official`, que en este despliegue no tiene credencial: `web_search` fallaba con `DeepSeek search has no API key for "DEEPSEEK_API_KEY"`. Los motores sin clave que responden desde este VPS son Bing y Baidu; 360 falla por redirección, DuckDuckGo por anti-bot y los proveedores con clave no están configurados.
- La fila `mcp-neon` en la misma capa de parche, con `transport: streamable-http` y `readonly=true` aplicado por el servidor de Neon (proyecto `crimson-cell-50024459`, base `pipay`, PostgreSQL 18). El catálogo pasó de 35 a **86 herramientas / 84 777 bytes**; el subconjunto `mcp:neon` mide **51 herramientas / 49 839 bytes** (`tools/list` del servidor coincide: 51).

Un volumen nuevo pierde las dos cosas y nada en el repositorio las reproduce, lo que incumple el criterio con que este despliegue trata la configuración persistente. La imagen ya tiene el mecanismo: los bundles de GUI (`SPEC-022`, `SPEC-023`, `SPEC-025`) se copian a `/opt/mdl/plugins/<nombre>` y el entrypoint ejecuta su `install.sh` idempotente en cada arranque, de modo que un contenedor recreado converge sin reconstruir la imagen ni editar el volumen.

Hechos verificados que deciden el diseño:

- El bundle es un *profile bundle* (`dsh.bundle.patch`), no una fila suelta. Su parche monta `web-search-multi` y reapunta la fila `web` a `searchProvider: multi-search`. Copiar el paquete a `profiles/node_modules/` y restablecer esas dos entradas en la capa de parche del perfil produce la misma composición sin `pnpm`, que no existe en la imagen de ejecución (`dsh plugin` responde `pnpm not found on PATH`).
- `!!js` sí se resuelve en las capas de parche y en los overlays `--patch` en esta versión: el loader interpola `config` al activar la entrada. Es lo que ya usa `/etc/mdl-harness/privileged-access.yml` con `process.env.DSH_ACCESS_AUD` (`SPEC-024`). Por eso la credencial de Neon puede leerse en el arranque sin escribirse nunca dentro del parche.
- `--dump-config` imprime la expresión `!!js` sin evaluar, así que la comprobación de composición verifica la fila, no el secreto.
- Dos instancias vivas de `mcp-client` con el mismo `serverName` fallan por diseño. Una fila `mcp-neon` añadida a mano en el volumen y otra en un overlay de la imagen componen dos filas con el mismo id, y la segunda no puede montarse: la migración tiene que retirar la fila manual, no convivir con ella.
- Los motores de búsqueda sin clave se midieron invocando los adaptadores del propio bundle con reserva desactivada, no por inspección del código.

## Alcance

- `EXT-01` El bundle de búsqueda vive en `mdl/plugins/web-search-multi/` con el contenido publicado del commit fijado: `package.json`, `lib/index.js`, `lib/index.mjs`, `lib/client.js`, `lib/index.d.mts`, `cordis.patch.yml`, `README.md`, `LICENSE` e `install.sh`. El build no descarga nada de la red ni construye el paquete.
- `EXT-02` `mdl/plugins/web-search-multi/install.sh` publica el paquete en `profiles/node_modules/dsh-web-search-multi` y añade a la capa de parche del perfil las dos entradas del parche del bundle, una sola vez, con el mismo patrón idempotente que los otros instaladores: nunca toca la lista de bundles del perfil, `settings.yaml` ni las sesiones.
- `EXT-03` La imagen copia el bundle a `/opt/mdl/plugins/web-search-multi` con permisos legibles, y el bucle del entrypoint lo incluye, de modo que un contenedor recreado publica el bundle en un volumen vacío.
- `EXT-04` La fila del MCP de Neon vive en `mdl/docker/neon-mcp.yml`, se copia a `/etc/mdl-harness/neon-mcp.yml` y el entrypoint la aplica con `--patch` sólo cuando `NEON_PROJECT_ID` tiene valor y el archivo de credencial es legible. Sin esas dos condiciones el despliegue arranca exactamente como hoy, sin herramientas de Neon.
- `EXT-05` El identificador de proyecto y el modo se resuelven en la fila por entorno (`NEON_PROJECT_ID`) y la URL conserva `readonly=true`; no se escribe ningún valor de despliegue en el archivo versionado.
- `EXT-06` La credencial de Neon vive fuera del repositorio, de la imagen y del volumen, se monta como archivo de sólo lectura y se lee al activar la entrada. No entra en el entorno del proceso, ni en la capa de parche, ni en los registros de validación.
- `EXT-07` El costo del catálogo queda medido y registrado: 35 → 86 herramientas y 84 777 bytes, con el desglose por proveedor, y la comprobación independiente contra `tools/list` del servidor de Neon.
- `EXT-08` La migración retira del volumen la fila `mcp-neon` y el paquete `profiles/node_modules/dsh-web-search-multi` escritos a mano, de modo que el instalador de la imagen y el overlay sean la única fuente.
- `EXT-09` El MCP fija cada herramienta SQL a un rol de Postgres de sólo lectura, con alcance al esquema de la aplicación y a las tablas futuras, de modo que una escritura la rechaza la base por privilegios y no la selección de herramientas del servidor. El rol se nombra por entorno (`NEON_ROLE_NAME`) y no se escribe en el overlay.

## Fuera del alcance

- `graphify`: su binario no existe en la imagen y su instalación (`uv tool install`) es un cambio de Dockerfile con especificación propia.
- `zstd` en la imagen y `pnpm` en la etapa de ejecución: siguen como pendientes de [VPS_HANDOFF](../../mdl/VPS_HANDOFF.md) y del análisis de brechas.
- El modo de escritura de Neon (`readonly=false`) y cualquier herramienta de migración, creación o borrado de ramas.
- Claves de proveedores de búsqueda con cuota (Tavily, Brave, Serper, Bocha) y SearXNG propio.
- Copias de seguridad y restauración: pertenecen a `SPEC-005`, ya validada.
- Sustituir el proveedor de búsqueda por defecto de upstream: el despliegue conserva la fila `web-search-deepseek` montada y sin usar.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `EXT-01` | La imagen contiene el bundle publicado y su incorporación no añade ningún paso de red | `docker run --rm mdl-harness:local ls /opt/mdl/plugins/web-search-multi/lib` y revisión del `Dockerfile`: el bundle entra por `COPY`, sin `RUN` que descargue nada. El build completo sí necesita red para `pnpm` y para el árbol de extracción de `chat-files` |
| `EXT-02` | Ejecutar el instalador dos veces no duplica entradas | Contar `web-search-multi` en la capa de parche antes y después de una segunda ejecución: 2 entradas, idénticas |
| `EXT-03` | Un volumen vacío recibe el bundle en el arranque | Log del entrypoint con `web-search-multi: bundle published` y `web_search` operativo en una sesión nueva |
| `EXT-04` | Sin `NEON_PROJECT_ID` no hay fila de Neon y el arranque no falla | `--dump-config` sin coincidencias de `mcp-neon`; la GUI y `web_search` siguen funcionando |
| `EXT-05` | Con `NEON_PROJECT_ID` y credencial, la composición y la llamada funcionan | `--dump-config` muestra `serverName: neon` con `readonly=true`; una consulta real devuelve el registro del proyecto |
| `EXT-06` | La credencial no está en Git, imagen, volumen ni entorno | `git grep napi_`, búsqueda en el sistema de archivos del contenedor y `env` dentro del contenedor: sin coincidencias |
| `EXT-07` | El catálogo medido coincide con lo registrado | Medición desde el log de sesión (86 / 84 777 B) y `tools/list` contra Neon (51 herramientas) |
| `EXT-08` | El volumen migrado no conserva la fila ni el paquete manuales | Inspección de `cordis.patch.yml` y de `profiles/node_modules/` tras la migración; una sola fila `mcp-neon` compuesta |
| `EXT-09` | El catálogo no expone herramientas administrativas y la escritura SQL la decide el rol de Postgres, no el cliente | `tools/list` sin herramientas de rama, migración, borrado ni snapshots; con `roleName` fijado, una escritura responde `SQLSTATE 25006` y una lectura sigue devolviendo filas |
| `EXT-10` | Una credencial ausente o ilegible degrada sin bloquear el arranque | Con `NEON_PROJECT_ID` pero sin archivo de credencial, el entrypoint no aplica el overlay y el proceso arranca |

## Restricciones

- Se conservan `MDL-SEC-01`, `MDL-SEC-02`, `MDL-GH-01`, `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-IDENT-02` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-SEC-02`: esta especificación es la que autoriza una conexión saliente a un servicio externo (Neon) y el acceso del agente, en sólo lectura, a una base de datos de producción. La validación de seguridad es `EXT-06` más `EXT-09`.
- Las filas y los nombres visibles conservan el contrato de upstream: `serverName`, prefijo `mcp__<serverName>__<herramienta>` y el único `web_search` ya publicado.
- Ningún valor de despliegue se escribe en archivos versionados: el identificador de proyecto llega por entorno y la credencial por montaje.
- El bundle es código de terceros con licencia MIT y publica red y `workspace-write` en sus propias declaraciones; se fija a un commit, no a una referencia móvil.
- La imagen no gana dependencias nuevas ni pasos de red: el bundle se copia con su `lib/` publicado y no declara dependencias de ejecución.

## Implementación prevista

- `mdl/plugins/web-search-multi/`: contenido publicado del bundle fijado más `install.sh` propio.
- `mdl/docker/neon-mcp.yml`: el overlay con la fila `mcp-neon`.
- `mdl/docker/Dockerfile`: copia del bundle y del overlay, y permisos de lectura para el usuario de ejecución.
- `mdl/docker/entrypoint.sh`: `web-search-multi` en el bucle de bundles y aplicación condicionada del overlay de Neon.
- `mdl/docker/compose.yml`: `NEON_PROJECT_ID` en el entorno y el montaje de sólo lectura del directorio de credencial.
- `mdl/ROADMAP.md`: fila de la fase al validar.

## Validación ejecutada

Ejecutada el 2026-11-10. La primera tanda se hizo sobre el árbol de fuentes; la segunda, después de que el operador reconstruyera la imagen y recreara el contenedor desde el host, sobre el despliegue real:

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `EXT-01` contenido fijado | Cumplido | `mdl/plugins/web-search-multi/` contiene `lib/` (4 archivos) copiado del clon en el commit `9821080e`, más `package.json`, `cordis.patch.yml`, `README.md` y `LICENSE`; sin `npm` ni red |
| `EXT-01` sin paso de red propio | Cumplido | El `Dockerfile` sólo hace `COPY` del bundle; ningún `RUN` lo construye ni lo descarga |
| `EXT-01` bundle en la imagen | Cumplido | `/opt/mdl/plugins/web-search-multi` contiene `LICENSE`, `README.md`, `cordis.patch.yml`, `install.sh`, `package.json` y `lib/` con sus cuatro archivos |
| `EXT-02` instalador idempotente | Cumplido | Dos ejecuciones sobre un home con sólo las tres filas de GUI: la primera publica el paquete y añade las filas, la segunda informa que ya están; el resultado son **1** fila `web-search-multi` y **1** `searchProvider: multi-search` |
| `EXT-03` volumen vacío | Cumplido | Dos evidencias: un home vacío más el instalador y el overlay componen las dos filas y DSH crea el perfil con `dsh-base` y `dsh-web-app`; y tras la recreación el entrypoint publicó el bundle en el volumen, donde la capa de parche ya tiene las filas sin intervención manual |
| `EXT-04` sin `NEON_PROJECT_ID` no hay fila | Cumplido | `--dump-config` sin el overlay no compone `mcp-neon`; el gate del entrypoint se probó en sus cuatro combinaciones (proyecto/token) y sólo aplica con ambos |
| `EXT-05` composición y expresiones | Cumplido | Con el overlay, la composición contiene **una** fila `mcp-neon` con `readonly=true`; `interpolate` resuelve la URL a `https://mcp.neon.tech/mcp?projectId=crimson-cell-50024459&readonly=true` y la cabecera a `Bearer napi…` leída del montaje |
| `EXT-06` credencial fuera de Git, imagen, volumen y entorno | Cumplido | `grep -rl napi_ /data/dsh /opt/mdl /app/apps/cli` no devuelve coincidencias, y el entorno del proceso DSH contiene `NEON_PROJECT_ID` pero ninguna clave (0 coincidencias de `napi_`) |
| `EXT-07` costo medido | Cumplido | 86 herramientas / 84 777 bytes en el despliegue vivo (35 → 86; `mcp:neon` 51 / 49 839); `tools/list` contra Neon devuelve 51 |
| `EXT-08` migración | Cumplido | El riesgo se confirmó antes (volumen con la fila manual más overlay = **2** filas); tras la migración la composición tiene **una** fila `mcp-neon`, la del overlay, y el paquete del bundle lo volvió a publicar el instalador desde la imagen |
| `EXT-09` barrera de escritura | Cumplido | Dos capas medidas por separado. Sin rol fijado (URL sólo con `readonly=true`): `DELETE FROM pipaysii.tipo_dte WHERE false` → `cannot execute DELETE in a read-only transaction` (`SQLSTATE 25006`), y `INSERT INTO <tabla inexistente>` → `SQLSTATE 42P01`, que es resolución de nombres y no una escritura permitida. Con el rol: `mdl_reader` existe con `LOGIN`, `rolsuper = false` y `member_of = none`, con `SELECT` sobre los esquemas `pipaysii` y `public`; lee `pipaysii.tipo_dte` y la vista `pipaysii.v_dcv_tipos`, la misma escritura se rechaza también por HTTP directo a la URL fijada, y `inspect_database` sigue devolviendo filas con ese rol |
| `EXT-10` degradación sin credencial | Cumplido | Gate del entrypoint: con proyecto y sin archivo de credencial el overlay no se aplica y el arranque continúa |

## Hallazgo durante la validación

`EXT-09` se redactó sobre una premisa incompleta y la primera conclusión fue equivocada. La referencia de Neon define `?readonly=true` como la retirada de las operaciones administrativas (ramas, migraciones, configuración de auth) y de `run_sql_transaction` y `get_connection_string`; una sonda `INSERT INTO <tabla inexistente>` respondió `SQLSTATE 42P01`, y de ahí se concluyó — mal — que `run_sql` seguía escribiendo como el propietario. La sonda era inválida: la resolución de nombres ocurre antes de la comprobación de transacción de sólo lectura, así que una tabla inexistente enmascara la barrera. Contra una tabla real, `DELETE FROM pipaysii.tipo_dte WHERE false` responde `cannot execute DELETE in a read-only transaction` (`SQLSTATE 25006`) **sin rol fijado**, que es la prueba de que `readonly=true` sí bloquea escrituras.

El rol fijado sigue aportando dos cosas que `readonly=true` no da: mínimo privilegio sobre lo que se lee (sólo los esquemas `pipaysii` y `public`) y una barrera que sobrevive a quitar `readonly`. La misma página documenta ese mecanismo y advierte que MCP es para desarrollo y "never connect MCP agents to production databases".

Consecuencia para este despliegue: la escritura queda bloqueada por dos capas independientes —la transacción de sólo lectura de `readonly=true` y los privilegios de `mdl_reader`—, y las lecturas del agente quedan acotadas a los esquemas de la aplicación.

## Resultado y pendientes

- Resultado: implementado y validado en el despliegue real. La imagen se reconstruyó, el contenedor se recreó con el overlay aplicado por el entrypoint (`--patch /etc/mdl-harness/neon-mcp.yml` en el argv) y el volumen migrado compone una sola fila `mcp-neon`.
- Pendientes:
  - Reconstruir la imagen y recrear el contenedor para que el overlay fijado (`&roleName=mdl_reader`) entre en vigor en el despliegue.
  - Marcar la fila de la fase en `mdl/ROADMAP.md` como validada al cerrar.
- Decisión de salida: pendiente.
