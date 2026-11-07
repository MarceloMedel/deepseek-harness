# SPEC-010 — Credencial de GitHub para empujar y abrir PR

Estado: Aprobada
Fase: 10
Commit base: `4fb0d380cc`
Aprobación: usuario en sesión Web, `Ciclo completo: push y PR` + `Tapar gh en /usr/local/bin`

## Objetivo

Que el agente, trabajando dentro del contenedor, pueda completar el ciclo de entrega de un cambio: commitear en una rama, empujarla al repositorio y abrir el pull request, sin que ninguna credencial entre en Git, en la imagen Docker, en los volúmenes ni en el registro de la sesión.

## Contexto

La imagen ya instala `gh` y el contenedor alcanza `api.github.com`; lo que falta es autenticación. `SPEC-008` estableció el patrón para git: el secreto vive en el host, se monta como archivo de solo lectura en `/etc/mdl-harness/git` y ninguna variable de entorno lo contiene. Esta credencial sigue el mismo patrón, con una diferencia: `gh` no admite leer el token de un archivo, así que la imagen interpone un envoltorio que lo lee en cada invocación.

El registro de la sesión es durable y compartido, así que una variable con el token en el entorno del proceso la expondría a cualquier volcado accidental de `env` dentro del agente. Por eso el token no entra en el entorno: solo en el proceso `gh` que lo usa.

El token vive en `~/.config/mdl-harness/gh/token` del host y no en `/srv/projects/secrets`, aunque ese directorio sea el almacén de secretos del host: `SPEC-007` define `secrets` como el almacén que el usuario del contenedor no puede leer, y un token que el contenedor debe leer pertenece al lado contrario de esa frontera. La deploy key de `SPEC-008` ya ocupa ese mismo lugar fuera del almacén, y montar un archivo desde dentro de `secrets` obligaría a abrirlo al uid 1000 o a copiarlo en cada arranque. El coste aceptado es que el token no entra en el backup diario, que solo archiva los volúmenes: si el host se pierde, se reemite.

## Alcance

- Token fine-grained limitado a `MarceloMedel/deepseek-harness`, guardado en el host fuera del repositorio y montado en solo lectura.
- Envoltorio `/usr/local/bin/gh` que lee el token por invocación y delega en `/usr/bin/gh`.
- Helper de credenciales de git restringido a `github.com` para empujar por HTTPS con el mismo token.
- Aviso de arranque en el entrypoint cuando la credencial falta, sin exponer el secreto.
- Regla permanente `MDL-GH-01` en el contrato y documentación de alcance, rotación y validación.

## Fuera del alcance

- Automatizar la creación del PAT: la emite una persona en la interfaz de GitHub.
- Permisos de administración, `workflows`, secretos de Actions o cualquier alcance sobre otros repositorios.
- Sustituir la credencial de `pipay-sii` de `SPEC-008`, que sigue siendo una clave SSH independiente.
- Protección de rama, revisión obligatoria o reglas de merge en GitHub.
- Restaurar los permisos de `/srv/projects/secrets`: la desviación respecto a `SPEC-007` se corrige en el host y se registra por separado.
- Que el agente fusione su propio PR: la fusión sigue siendo una decisión humana.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `GH-01` | Con el token montado, `gh api user` identifica al dueño del token | Ejecución en el contenedor |
| `GH-02` | El agente empuja una rama por HTTPS y crea un PR de prueba | `git push`, `gh pr create --draft`, luego `gh pr close` |
| `GH-03` | Sin el archivo del token, `gh` falla con código distinto de cero y un mensaje que nombra la ruta esperada, sin volcar el secreto | Renombrar el archivo y ejecutar |
| `GH-04` | El token no aparece en `env`, `docker inspect`, el entrypoint ni los archivos del repositorio | Búsqueda de la cadena en entorno, configuración y árbol |
| `GH-05` | Con un token sin `Contents: write`, el empuje falla con el error de GitHub y ningún volcado del secreto | Token de solo lectura de prueba |
| `GH-06` | El helper de credenciales no responde a ningún host que no sea `github.com` | Ejecución del helper con `host=example.com` |
| `GH-07` | Rotar el token es reemplazar el archivo, sin reiniciar el contenedor | Reemplazo y nueva llamada a `gh` |
| `GH-08` | El token no vive en `/srv/projects/secrets` ni en los volúmenes, y `secrets` conserva su contrato de inaccesibilidad | Inspección de rutas y de permisos del almacén |

## Restricciones

- `MDL-SEC-01`: la credencial no entra en Git, ni en la imagen, ni en capturas, ni en registros de validación.
- `MDL-SEC-02`: no se abre exposición pública ni se relajan controles de red o sandbox; la credencial es de salida y de alcance mínimo.
- `MDL-GH-01` (nueva, ver [PRODUCT_SPEC](../PRODUCT_SPEC.md)): el token vive fuera de la imagen y del repositorio, se monta como archivo de solo lectura y se limita a un repositorio.
- `MDL-DOCKER-01` y `MDL-DOCKER-02`: el usuario sigue siendo no root y el socket Docker no se monta.
- `MDL-ENV-01`: el desarrollo no toca la instancia viva; la validación de esta credencial ocurre en el contenedor del fork.
- `MDL-VALID-01`: toda comprobación no ejecutada se registra como pendiente.

## Implementación prevista

`mdl/docker/Dockerfile` instala el envoltorio `gh`, el helper de credenciales y registra el helper en la configuración de sistema de git. `mdl/docker/compose.yml` monta el directorio del host en `/etc/mdl-harness/gh` en solo lectura. `mdl/docker/entrypoint.sh` informa del estado de la credencial al arrancar. `mdl/docker/README.md` documenta la emisión del token, sus permisos, la rotación y la validación. La regla permanente se añade a `mdl/PRODUCT_SPEC.md` y la fase a `mdl/ROADMAP.md`.

## Validación ejecutada

Ejecutada el 2026-11-07 sobre la imagen reconstruida en el VPS, con el token emitido por el usuario, montado en `/etc/mdl-harness/gh/token` (`0600 node:node`) y el envoltorio `/usr/local/bin/gh` como ejecutable de PATH.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `GH-01` Identidad del token | Aprobado | `gh api user --jq .login` → `MarceloMedel`, exit 0 |
| `GH-02` Empuje y PR | Aprobado | `git push -u origin change/010-github-pr-credential` autenticó por el helper; `gh pr create` creó el PR #1 y el #2, y el #2 se fusionó |
| `GH-03` Sin archivo | Aprobado | `MDL_GH_TOKEN_FILE=<ruta ausente> gh api user` → exit 78 con el mensaje que nombra la ruta esperada |
| `GH-04` Sin exposición | Aprobado | `env` sin ninguna variable que contenga `token`; `grep -rIl 'github_pat_\|ghp_'` sin coincidencias en el árbol; el montaje es de solo lectura |
| `GH-05` Token sin `Contents: write` | Pendiente | Requiere un segundo token de solo lectura, que emite el usuario |
| `GH-06` Alcance del helper | Aprobado | El helper no responde a `host=example.com`, responde solo a `host=github.com` y no hace nada en `store`/`erase` |
| `GH-07` Lectura por invocación | Aprobado | Con el mismo proceso vivo: archivo con token inválido → `exit 1` (`Bad credentials`); archivo borrado → `exit 78`; token real → `exit 0` y `MarceloMedel`. Ningún caché, ninguna reinicio |
| `GH-08` Ubicación | Aprobado | El token vive en `~/.config/mdl-harness/gh/token`, fuera de `/srv/projects/secrets` y de los volúmenes; `secrets` no contiene ninguna copia |

## Resultado y pendientes

- Resultado: validado. La credencial permite empujar ramas y abrir PR desde dentro del contenedor, y el secreto no aparece en el entorno, en el árbol ni en los volúmenes. El PR #1 llevó la Fase 9 y esta Fase 10 a `main` en el commit `7b617375f3`.
- Pendientes o excepciones aceptadas: `GH-05` (un token sin `Contents: write` debe fallar con el error de GitHub) queda sin ejecutar porque exige un segundo token emitido por el usuario; no se registra como superado.
- Decisión de salida: la Fase 10 se cierra con `GH-05` como comprobación pendiente de una sesión de seguridad posterior.
