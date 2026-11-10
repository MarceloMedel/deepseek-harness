# MDL-HARNESS en Docker

Instancia personal de DSH: el fork compilado, nginx y una configuración de proveedor sin secretos, con acceso remoto solo a través de Cloudflare Access.

## Arranque

```sh
sudo docker compose -f mdl/docker/compose.yml up -d --build
sudo docker compose -f mdl/docker/compose.yml ps
curl -fsS http://127.0.0.1:3081/ >/dev/null && echo "MDL-HARNESS OK"
```

La instancia escucha en `127.0.0.1:3081` del host. DSH escucha en `127.0.0.1:3080` dentro del contenedor y nginx publica `8080`; el contenedor corre como `node` (UID 1000), sin capabilities y sin el socket Docker.

El contenedor se une a la red externa `edge`, la misma que usan Caddy y cloudflared del gateway de `personal-suite`.

## Proveedor

`settings.yaml` declara una ruta OpenAI-compatible contra Ollama en el host (`http://host.docker.internal:11434/v1`). El entrypoint la copia a `$DSH_HOME/settings.yaml` solo si el volumen todavía no tiene una; a partir de ahí manda el volumen.

El contenedor llega a Ollama por `host.docker.internal:host-gateway`; `ufw` del host permite `11434` solo desde `172.16.0.0/12`, así que el endpoint no está expuesto a Internet.

Modelo principal: `deepseek-v4.1-flash:cloud`. Alternativo: `gemma4:cloud`. Ninguno requiere credencial en la configuración.

Para cambiar de modelo, editá `$DSH_HOME/settings.yaml` dentro del volumen o usá la página de modelos desde loopback. El archivo se recarga en caliente.

## Proyectos del host

El contenedor monta `${MDL_PROJECTS_DIR:-/srv/projects}` en la misma ruta absoluta, en lectura-escritura. Si la ruta no existe, Docker la crea como `root` y el agente no podrá escribir hasta corregir el dueño. Para trabajar sobre un proyecto, abrí la GUI por loopback (`ssh -L 3081:127.0.0.1:3081 USUARIO@VPS`), creá una sesión y elegí la carpeta con el selector; el sandbox confina las escrituras a ese workspace.

`/srv/projects/secrets` es `root:root` modo 700 y el usuario `node` no puede leerlo aunque el directorio padre esté montado. Una sesión con `danger-full-access` sí podría escribir en cualquier punto del montaje.

Los proyectos no entran en el backup diario: se respaldan por git. El volumen `mdl-workspace` sigue disponible para sesiones sin proyecto.

## Identidad git y credenciales

El contenedor autentica todo por HTTPS con el token de GitHub de la sección anterior: clonar, empujar y abrir PR funcionan en **cualquier repositorio** al que ese token alcance, sin configuración por repositorio. El token debe emitirse con acceso a todos los repositorios, con `Contents: Read and write`, `Pull requests: Read and write`, `Issues: Read and write` y `Metadata: Read`.

La imagen no sabe de ningún repositorio: solo aporta el mecanismo en `/etc/gitconfig`.

```ini
[credential]
	helper = /usr/local/bin/mdl-git-credential
[include]
	path = /etc/mdl-harness/git/gitconfig
```

Ese `include` es el punto de extensión y vale para cualquier aplicación desplegada con Docker. Un `include` cuyo archivo no existe se ignora, así que un despliegue que no necesita nada más no monta nada. El que sí lo necesita monta un fragmento en solo lectura con sus propias reglas, por ejemplo un alias SSH y una clave por repositorio:

```ini
[url "ssh://github-otro-repo/OWNER/REPO.git"]
	insteadOf = https://github.com/OWNER/REPO.git
[core]
	sshCommand = ssh -F /etc/mdl-harness/git/ssh_config
```

Añadir un repositorio es añadir ese bloque en el host y reiniciar el contenedor; no se reconstruye ninguna imagen ni se toca `compose.yml`.

El contenedor ya no lleva deploy keys ni variables `GIT_CONFIG_*`. La reescritura a SSH de `pipay-sii` de `SPEC-008` se retiró en la Fase 11: ese repositorio, como cualquier otro, usa el token.

## Herramientas de la imagen

La imagen de runtime instala solo lo que el agente usa de verdad ([SPEC-017](../specs/017-optimizacion-imagen.md) reemplaza el inventario de `DOCKER-03` de `SPEC-004`):

| Herramienta | Para qué |
|---|---|
| `bash`, `git`, `curl`, `jq`, `less`, `ca-certificates` | Herramienta bash, clonado y trabajo sobre repositorios, `gh` |
| `bubblewrap`, `tini`, `nginx-light` | Cadena de sandbox, entrypoint y proxy de `SPEC-004` |
| `python3` + `uv` | Trabajo sobre proyectos Python; `uv` cubre `pip` y `venv` |
| `gh` | PR y credencial de GitHub de `SPEC-010` a través del wrapper |

Estas herramientas se retiraron porque ningún consumidor las necesita en runtime; reponer cualquiera es volver a agregarla a la lista de `apt` del `Dockerfile`:

- `graphifyy` (con su venv de `uv`): herramienta de grafos de documentación, sin consumidor en la ruta del agente.
- `docker-ce-cli`: el despliegue no monta el socket por `MDL-DOCKER-02` ni define `DOCKER_HOST`, así que el binario no puede operar ningún daemon.
- `openssh-client`: todo el Git va por HTTPS con token desde `SPEC-011` y no se monta ningún fragmento SSH.
- `python3-pip`, `python3-venv`: `uv` cubre ambos.

El backend de subagentes `subagent-claude-code` ya no arrastra el SDK oficial completo: `@anthropic-ai/claude-agent-sdk` es un peer opcional. Montar ese preset sin instalarlo falla con un mensaje que nombra el paquete, no con un `ERR_MODULE_NOT_FOUND` durante el arranque.

## Herramientas externas

[SPEC-026](../specs/026-herramientas-externas-reproducibles.md) hace que estas dos capacidades sobrevivan a un volumen vacío y a una imagen reconstruida. Las dos son opcionales en el arranque: sin configuración, el despliegue compone exactamente lo de antes.

**Búsqueda multi-proveedor.** El bundle `mdl/plugins/web-search-multi/` se publica con su `install.sh` desde el entrypoint, como los bundles de GUI. Reemplaza al proveedor `deepseek-official`, que sin `DEEPSEEK_API_KEY` hacía fallar `web_search`; los motores sin clave que responden desde este VPS son Bing y Baidu. El instalador no necesita `pnpm`: copia el paquete a `profiles/node_modules/` y escribe las dos entradas de parche del bundle.

**MCP de Neon.** La fila vive en el overlay `mdl/docker/neon-mcp.yml`, que se aplica con `--patch` sólo si existen las dos condiciones siguientes:

| Variable o montaje | Contenido |
|---|---|
| `NEON_PROJECT_ID` (entorno) | Identificador del proyecto; no es secreto y no se escribe en el overlay |
| `MDL_NEON_DIR` (montaje de sólo lectura) | Directorio del host montado en `/etc/mdl-harness/neon`; el token es `token`, modo `0600`, dueño del uid del contenedor |

La credencial se lee al activar la fila y nunca es un valor de entorno; `MDL_NEON_TOKEN_FILE` cambia la ruta que lee el overlay. Un volumen que todavía tenga la fila y el paquete escritos a mano debe limpiarse antes de recrear el contenedor: dos filas con el mismo `serverName` impiden montar la segunda.

```sh
# en el host, con el contenedor detenido
docker run --rm -v mdl-harness_mdl-dsh-home:/data/dsh --entrypoint bash mdl-harness:local -lc '
  f=/data/dsh/profiles/web/cordis.patch.yml
  awk "/Multi-provider web search|Neon MCP \(managed Postgres/{exit} {print}" "$f" > "$f.tmp" &&
    mv "$f.tmp" "$f" &&
    rm -rf /data/dsh/profiles/node_modules/dsh-web-search-multi'
```

`readonly=true` retira las herramientas administrativas (ramas, migraciones, configuración de auth, snapshots) y oculta `run_sql_transaction` y `get_connection_string`, pero no convierte `run_sql` en un ejecutor de sólo lectura: las herramientas SQL se conectan como el propietario de la base. El mínimo privilegio se consigue fijando un rol con `&roleName=<rol>` en la `url:` del overlay, con permisos de sólo lectura en la base.

Comprobación:

```sh
sudo docker exec -u node mdl-harness-mdl-harness-1 \
  node /app/apps/cli/lib/bin.js --profile web --dump-config | grep -A6 'id: mcp-neon'
# serverName: neon, readonly=true en la url, la cabecera con la expresión !!js sin evaluar
```

## Sandbox

La cadena Linux de `dsh-sandbox-local` prueba `bwrap` y recurre a Landlock. Dentro del contenedor `bwrap` no puede crear user namespaces por el perfil AppArmor, así que el runner efectivo es Landlock. La imagen compila el launcher (`native/landlock-run`) durante la build; sin ese binario el sandbox se queda sin runners y `bash` falla cerrado.

Comprobación:

```sh
sudo docker exec -u node mdl-harness-mdl-harness-1 \
  /app/native/landlock-run/packages/linux-x64/bin/landlock-run --probe
# landlock: fully enforced
```

## Acceso remoto

El hostname público es `dsh.devmedel.com`. La cadena es Cloudflare (Access + tunnel) → Caddy → contenedor `mdl-harness:8080`.

La configuración del gateway vive fuera de este repositorio, en `/srv/projects/personal-suite/ops/gateway/`:

- `cloudflared.yml` declara el hostname.
- `Caddyfile` lo enruta al contenedor.

Aplicar y validar:

```sh
cd /srv/projects/personal-suite
sudo make edge-validate
sudo make edge-up
```

La publicación requiere una aplicación de Cloudflare Access con política por email para `dsh.devmedel.com`. Sin Access, cualquiera que resuelva el hostname puede ejecutar comandos en el contenedor.

### Plano privilegiado

DSH no tiene autenticación propia y fija a loopback los métodos que leen o escriben configuración y credenciales (`settings.*`, `credentials.*`, `llm.discoverModels`, `host.pickDirectory`, `agentPreset.read/copy/remove/openDocument`). Por `dsh.devmedel.com` funcionan conversación y sesiones. La configuración se administra por `http://127.0.0.1:3081` (túnel SSH), editando el volumen, o — desde SPEC-024 — por el hostname público si el despliegue declara el tag de aplicación de Access.

```sh
ssh -L 3081:127.0.0.1:3081 USUARIO@VPS
```

Habilitar el plano en el hostname público (`SPEC-024`) requiere el **Application Audience (AUD) Tag** de la aplicación de Access, que se copia de Zero Trust → Access → Applications → `dsh.devmedel.com` → Overview. No es un secreto. Se pasa al contenedor por el entorno y el arranque aplica la capa `privileged-access.yml`:

```sh
# en el VPS, junto al compose (por ejemplo en mdl/docker/.env)
echo 'DSH_ACCESS_AUD=<tag>' | sudo tee -a mdl/docker/.env
sudo mdl/docker/backup.sh          # opcional: respaldo antes de recrear
cd mdl/docker && sudo docker compose up -d --build
```

Sin `DSH_ACCESS_AUD` el arranque no aplica la capa y el plano privilegiado sigue en solo loopback, exactamente como antes de SPEC-024; el registro del contenedor lo dice en ambos casos. Con el tag declarado, DSH verifica la aserción que Cloudflare firma para esa aplicación (firma RS256 contra las claves publicadas del equipo, `iss` del equipo, `aud` del tag, vigencia) y solo entonces admite `Configuración → Modelos` y el resto del plano en `dsh.devmedel.com`. Loopback sigue entrando sin aserción, y cualquier otra autoridad sigue recibiendo `403`.

La rotación de claves del equipo se reconoce en la primera petición posterior al intervalo de recarga (60 s); mientras dure ese intervalo, una petición firmada con la clave nueva recibe `403`.

## Backup y restauración

```sh
sudo mdl/docker/backup.sh                 # detiene, archiva y reinicia
sudo mdl/docker/restore.sh <archivo>      # destructivo, pide confirmación
sudo mdl/docker/restore.sh <archivo> --yes
```

Los archivos van a `/srv/backups/mdl-harness` (configurable con `MDL_BACKUP_DIR`) con retención de 7 días (`MDL_BACKUP_RETENTION_DAYS`). Cada archivo tiene un `.manifest` con fecha, commit e imagen.

## Operación

```sh
sudo docker compose -f mdl/docker/compose.yml logs -f
sudo docker compose -f mdl/docker/compose.yml restart
sudo docker compose -f mdl/docker/compose.yml down     # conserva volúmenes
sudo docker compose -f mdl/docker/compose.yml down -v  # elimina datos
```

Diagnóstico rápido:

```sh
sudo docker compose -f mdl/docker/compose.yml ps           # healthcheck
sudo docker exec -u node mdl-harness-mdl-harness-1 id      # UID 1000
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example' \
  -X POST http://127.0.0.1:3081/api/llm.providers            # 403
```
