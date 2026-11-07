# SPEC-011 — Identidad git genérica por token HTTPS

Estado: Aprobada
Fase: 11
Commit base: `d6eec40fc3`
Aprobación: usuario en sesión Web, `Solo HTTPS con token para todos los repositorios` + `Retirar la deploy key`

## Objetivo

Que el contenedor pueda clonar, empujar y abrir PR en **cualquier repositorio** que este DSH toque, sin configuración por repositorio y sin que `git` ni `gh` dependan de variables de entorno: una sola credencial por HTTPS, un mecanismo de configuración que sirve igual para cualquier otra aplicación desplegada con Docker, y ninguna clave SSH dentro del contenedor.

## Contexto

El contenedor arrancaba con dos mecanismos solapados: una deploy key SSH con reescritura de URL para `pipay-sii` (`SPEC-008`), expresada con `GIT_SSH_COMMAND` y el trío `GIT_CONFIG_*`, y un token de GitHub limitado a un repositorio para `gh` (`SPEC-010`). Ese diseño solo cubría dos repositorios concretos y metía datos de un proyecto en la configuración de la plataforma: añadir un repositorio exigía editar el `compose.yml`.

Además el trío `GIT_CONFIG_*` estaba roto en la práctica: al proceso del agente llegaban `GIT_CONFIG_COUNT` y `GIT_CONFIG_VALUE_0` pero no `GIT_CONFIG_KEY_0`, y `git` trata el trío incompleto como error fatal (`missing config key`, `exit 128`). `gh` fallaba con él porque delega en `git`.

La decisión es no perseguir qué componente descarta esa variable y eliminar la dependencia: la configuración vive en archivos que git lee por sí mismo, y la credencial es una sola, por HTTPS, con alcance a todos los repositorios. El coste aceptado es explícito: el contenedor pasa a tener escritura en todo lo que la cuenta pueda escribir.

## Alcance

- Token fine-grained con acceso a todos los repositorios, usado por `gh` y por el helper de credenciales de git por HTTPS.
- `/etc/gitconfig` de la imagen con el helper y un `[include]` opcional hacia `/etc/mdl-harness/git/gitconfig`, como punto de extensión por despliegue.
- Retirar del `compose.yml` el trío `GIT_CONFIG_*`, `GIT_SSH_COMMAND` y el montaje de la deploy key.
- Preflight en el entrypoint: avisar si la configuración de git no se puede leer.
- Retirar la reescritura SSH de `pipay-sii`: ese repositorio pasa a usar el token como cualquier otro.

## Fuera del alcance

- Claves SSH dentro del contenedor, tanto deploy keys como claves de cuenta.
- Confirmar qué componente descarta `GIT_CONFIG_KEY_0`: se registra como pregunta abierta y la corrección la vuelve irrelevante.
- Permisos de administración, `workflows`, secretos de Actions o alcance sobre organizaciones que no hayan aprobado la instalación.
- Protección de rama o revisión obligatoria en GitHub.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CFG-01` | Sin variables `GIT_CONFIG_*`, `git config --list` termina con código 0 dentro del contenedor | Ejecución en el contenedor |
| `CFG-02` | El agente usa `git` sin limpiar el entorno: `git status` y `git log` funcionan | Ejecución desde la sesión |
| `CFG-03` | `gh` deja de fallar por configuración: `gh api user` funciona sin `env -u` | Ejecución desde la sesión |
| `CFG-04` | Empujar un repositorio distinto de `deepseek-harness` funciona con la misma credencial, sin configuración añadida | Push de una rama de prueba en `pipay-sii` y borrado |
| `CFG-05` | Un host sin el fragmento montado sigue funcionando: el `include` ausente se ignora | `GIT_CONFIG_SYSTEM` sobre un archivo cuyo include no existe |
| `CFG-06` | El entrypoint avisa cuando la configuración de git no se puede leer | Lectura del mensaje de arranque |
| `CFG-07` | El `compose.yml` no menciona ningún repositorio ni clave SSH | Inspección del archivo |
| `CFG-08` | El patrón es reutilizable: otra aplicación monta su fragmento y no necesita reconstruir la imagen | Documentación y prueba del `include` |

## Restricciones

- `MDL-SEC-01`: la credencial no entra en Git, en la imagen, en los volúmenes ni en los registros; el fragmento montado no la contiene.
- `MDL-GH-01`: la credencial de GitHub vive fuera de la imagen y del repositorio, se monta como archivo de solo lectura y no se expone en el entorno de procesos. El alcance pasa de un repositorio a todos: la regla se mantiene en lo relativo al almacenamiento, la exposición y la rotación.
- `MDL-DOCKER-01` y `MDL-DOCKER-02`: sin cambios de privilegios ni socket Docker.
- `MDL-VALID-01`: lo no ejecutado se registra como pendiente.

## Implementación prevista

`mdl/docker/Dockerfile` escribe `/etc/gitconfig` con la sección `credential` y el `include` opcional. `mdl/docker/compose.yml` retira el trío `GIT_CONFIG_*`, `GIT_SSH_COMMAND` y el montaje de la deploy key. `mdl/docker/entrypoint.sh` comprueba que la configuración se lea. `mdl/docker/README.md` documenta la credencial única, el punto de extensión y cómo lo reutiliza otra aplicación.

## Validación ejecutada

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `CFG-05` | Aprobado | Con `GIT_CONFIG_SYSTEM` apuntando a un archivo cuyo `include` no existe, `git config --get credential.helper` devuelve el helper y `exit 0` |
| Semántica del `include` | Aprobado | El mismo archivo con el `include` presente devuelve el valor del fragmento incluido |
| Causa del fallo anterior | Aprobado | `git config --list` con el entorno del contenedor → `exit 128`; con `GIT_CONFIG_COUNT=0` → `exit 0` |
| `CFG-01` a `CFG-04`, `CFG-06`, `CFG-07` | Pendiente | Requieren el token ampliado, la reconstrucción y el reinicio del contenedor |

## Resultado y pendientes

- Resultado: pendiente de la reconstrucción.
- Pendientes o excepciones aceptadas: el token pasa a tener escritura sobre todos los repositorios de la cuenta, decisión del usuario registrada arriba; la causa de la desaparición de `GIT_CONFIG_KEY_0` no se confirmó.
- Decisión de salida: pendiente.
