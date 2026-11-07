# SPEC-007 — Proyectos del host como workspace

Estado: Validada
Fase: 7
Commit base: `b03e05371d`
Aprobación: usuario en el VPS, `Todo /srv/projects, elegir en la UI`

## Objetivo

Permitir que el agente trabaje sobre los repositorios del host bajo `/srv/projects`, eligiendo el proyecto como workspace de cada sesión desde la UI, sin montar el socket Docker ni exponer `/srv/projects/secrets`.

## Contexto

Hasta `SPEC-006` el contenedor solo veía sus dos volúmenes. `/srv/projects` contiene repos git propiedad de `ubuntu` (UID 1000), el mismo UID del usuario `node` del contenedor. `secrets` es `root:root` modo 700 y queda fuera del alcance del usuario del contenedor aunque se monte el directorio padre.

El selector de directorios resuelve a `browse` dentro del contenedor (Linux sin `DISPLAY` ni zenity), y esa variante funciona sin escritorio.

## Alcance

- Montar el directorio de proyectos del host en el contenedor, en modo lectura-escritura y en la misma ruta absoluta.
- Parametrizar la ruta con `MDL_PROJECTS_DIR`, por defecto `/srv/projects`.
- Verificar lectura, escritura y confinamiento del sandbox sobre un repositorio real.
- Verificar que `secrets` sigue inaccesible.
- Documentar el procedimiento para elegir el workspace desde la UI por loopback.

## Fuera del alcance

- Credenciales git dentro del contenedor; el `push` se hace desde el host.
- Incluir los proyectos en el backup diario; los repos se respaldan por git.
- Montar `/srv/projects/secrets` ni el socket Docker.
- Cambiar el modo de permiso por defecto.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `WS-01` | El contenedor lista `/srv/projects` y lee un repositorio | `ls /srv/projects`, lectura de `pipay-sii` |
| `WS-02` | El usuario del contenedor puede escribir en un repositorio propio | Archivo temporal creado y eliminado en `pipay-sii` |
| `WS-03` | Con el workspace en un repo, el sandbox rechaza escrituras fuera de él | Escritura en otro proyecto denegada |
| `WS-04` | `secrets` sigue inaccesible para el usuario del contenedor | `ls /srv/projects/secrets` falla con permiso denegado |
| `WS-05` | La UI lista directorios y permite elegir el workspace | `host.listDirectories` responde desde el contenedor |
| `WS-06` | La instancia viva, sus sesiones y Cloudflare Access no cambian | Verificación posterior a la recreación |

## Validación prevista

1. Añadir el montaje y recrear el contenedor.
2. Listar `/srv/projects` y verificar lectura de `pipay-sii`.
3. Crear y borrar un archivo temporal en el repositorio con el usuario `node`.
4. Ejecutar una ronda del agente con `cwd` en el repositorio: escritura permitida dentro y denegada fuera.
5. Comprobar que `secrets` no es legible.
6. Consultar el listado de directorios por la API y confirmar que el picker es `browse`.
7. Verificar que la instancia, las sesiones y el acceso con Access siguen funcionando.

## Validación ejecutada

Fecha: `2026-11-06T20:35:00Z`
Entorno: VPS Linux amd64; imagen `mdl-harness:local`; `/srv/projects` de 452 MB, propiedad de `ubuntu` (UID 1000).

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `WS-01` Lectura | Aprobado | `ls /srv/projects` muestra los seis proyectos; `pipay-sii` se lee completo |
| `WS-02` Escritura | Aprobado | Archivo temporal creado y eliminado en `pipay-sii` como `node` |
| `WS-03` Sandbox dentro | Aprobado | Ronda del agente con `cwd=/srv/projects/pipay-sii`: `mdl-probe.txt` creado con `ok` y eliminado |
| `WS-03` Sandbox fuera | Aprobado | Escritura en `/srv/projects/config` denegada; `[sandbox: file access denied under workspace-write mode]`; archivo inexistente |
| `WS-04` Secretos | Aprobado | `ls /srv/projects/secrets` → `Permission denied` |
| `WS-05` Selector | Aprobado | `host.listDirectory` sobre `/srv/projects` responde `ok` con los proyectos |
| `WS-06` Instancia | Aprobada | Contenedor `healthy`, 4 sesiones intactas, `dsh.devmedel.com` sin sesión sigue en `302` |

### Revalidación de `WS-04` (2026-11-07)

El usuario del contenedor volvió a leer el almacén: `ubuntu` (mismo uid que `node` dentro del contenedor) tenía una ACL `r-x` sobre `/srv/projects/secrets` y `/srv/projects/secrets/pipay-sii`, y `pipay-sii/app.env` era legible desde el agente. `gateway` y `personal-suite` seguían cerrados.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `WS-04` revalidado | Aprobado | `setfacl -Rb` y `chmod 0700` sobre ambos niveles; desde el contenedor `ls /srv/projects/secrets` → `Permission denied` y ningún archivo de `pipay-sii` legible; `drwx------ root root` |
| Sin daño colateral | Aprobado | `lsof` y `grep` sobre `/etc/systemd/system` y `personal-suite/ops` no encontraron ningún consumidor; `git config --list` y `gh api user` siguen funcionando |

La causa del desvío: el almacén concedía acceso a `ubuntu` por ACL, y ese usuario comparte uid con el del contenedor, así que la separación por permisos desaparecía. La postura aplicable es `root` estricto: un servicio que necesite esos archivos debe consumirlos como root (por ejemplo con `--env-file` o un bind mount del archivo), nunca mediante una ACL para `ubuntu`.

## Resultado

**Validada.** El agente ve y edita los repositorios del host, el sandbox confina las escrituras al workspace elegido y `secrets` permanece inaccesible.

## Pendientes

- El montaje no forma parte del backup diario; los repositorios se respaldan por git.
- Una sesión con `danger-full-access` podría escribir en todo `/srv/projects` con los permisos del usuario `node`.
