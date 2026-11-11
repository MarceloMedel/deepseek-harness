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

- `docker-ce-cli`: el despliegue no monta el socket por `MDL-DOCKER-02` ni define `DOCKER_HOST`, así que el binario no puede operar ningún daemon.
- `openssh-client`: todo el Git va por HTTPS con token desde `SPEC-011` y no se monta ningún fragmento SSH.
- `python3-pip`, `python3-venv`: `uv` cubre ambos.

El backend de subagentes `subagent-claude-code` ya no arrastra el SDK oficial completo: `@anthropic-ai/claude-agent-sdk` es un peer opcional. Montar ese preset sin instalarlo falla con un mensaje que nombra el paquete, no con un `ERR_MODULE_NOT_FOUND` durante el arranque.

## Herramientas externas

[SPEC-026](../specs/026-herramientas-externas-reproducibles.md) hace que estas dos capacidades sobrevivan a un volumen vacío y a una imagen reconstruida. Las dos son opcionales en el arranque: sin configuración, el despliegue compone exactamente lo de antes.

**Búsqueda web.** [SPEC-029](../specs/029-busqueda-web-lite.md) la sirve un proveedor propio, `mdl/plugins/web-search-lite`, con una cadena fija: SearXNG (el motor de esta fase, [SPEC-028](../specs/028-searxng-como-motor-de-busqueda.md)), Tavily con su clave del servicio de credenciales, Bing raspado y Brave, que queda inerte hasta que exista `BRAVE_API_KEY`. El primero que devuelve una fuente gana; un eslabón que falla se omite 30 s, y cuando fallan todos el error nombra a cada uno y su motivo. La cadena vive en la capa de parche y no hay página de configuración, así que nada puede ensombrecerla.

SearXNG trae `search.formats: [html, json]` —el adaptador pide JSON y el motor sólo sirve HTML por defecto— y los motores desactivados salen de una medición: `google cse` responde siempre y es el que sostiene al motor, mientras `bing` devolvió resultados ajenos a la consulta, `google` y `qwant` respondieron «access denied» y `baidu` pidió CAPTCHA. Vuelve a medirse antes de reactivar cualquiera.

El bundle de terceros `dsh-web-search-multi` de `SPEC-026` quedó retirado: sus filas, su paquete y su sección de `settings.yaml` se quitaron en la migración, y su nombre salió del bucle de bundles del entrypoint.

**MCP de Neon.** La fila vive en el overlay `mdl/docker/neon-mcp.yml`, que se aplica con `--patch` sólo si existen las dos condiciones siguientes:

| Variable o montaje | Contenido |
|---|---|
| `NEON_PROJECT_ID` (entorno) | Identificador del proyecto; no es secreto y no se escribe en el overlay |
| `NEON_ROLE_NAME` (entorno) | Rol de Postgres al que el servidor fija cada herramienta SQL; por defecto `mdl_reader`. Vacío deja la URL sin fijar y las herramientas corren como el propietario |
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

`readonly=true` retira las herramientas administrativas (ramas, migraciones, configuración de auth, snapshots), oculta `run_sql_transaction` y `get_connection_string`, y ejecuta las consultas en una transacción de sólo lectura: una escritura a una tabla real responde `cannot execute DELETE in a read-only transaction` (`SQLSTATE 25006`). La comprobación tiene que hacerse contra una tabla existente; contra una tabla inexistente la respuesta es `SQLSTATE 42P01` porque la resolución de nombres ocurre antes, y eso no demuestra que la escritura esté permitida. El rol fijado con `&roleName=<rol>` añade mínimo privilegio sobre las lecturas y sobrevive a quitar `readonly`.

El rol se crea una vez, con alcance al esquema de la aplicación —`pipaysii` aquí, no `public`— y cubre las tablas que el propietario cree después:

```sh
# el CLI imprime la contraseña: el servidor MCP resuelve la credencial por su
# cuenta, así que no hay que guardarla en ninguna parte
npx neon@latest roles create --project-id <project-id> --branch production \
  --name mdl_reader --access read_only --schema pipaysii --schema public
```

**Índice de código.** [SPEC-027](../specs/027-indice-de-codigo-graphify.md) instala `graphifyy[mcp]` en una versión fijada durante la build —el extra `[mcp]` es obligatorio, sin él el binario arranca y muere con `ModuleNotFoundError`— y el entrypoint aplica `mdl/docker/graphify-mcp.yml` cuando `/usr/local/bin/graphify-mcp` existe. Sin variable de entorno que lo decida: la fila viaja con el binario.

El grafo por defecto es `/etc/mdl-harness/no-default-graph.json`, que no existe a propósito. Las diez herramientas aceptan un `project_path` opcional, así que una consulta que lo omita responde `graph.json not found` en vez de datos de otro proyecto; con `project_path=/srv/projects/<repo>` responde el grafo de ese repositorio y avisa de su frescura comparando el commit del grafo con el `HEAD` del proyecto. Construir o refrescar el grafo es una acción del operador (`graphify-out/graph.json` en cada repositorio), no del contenedor.

**Motor de búsqueda propio.** [SPEC-028](../specs/028-searxng-como-motor-de-busqueda.md) añade el servicio `searxng` al compose: imagen fijada en una etiqueta concreta, sin `ports` —sólo `expose: 8080` en la red por defecto del proyecto—, `cpus: 1.0`, `mem_limit: 512m` y las tres capabilities que su entrypoint necesita para bajar de root. La configuración vive en `mdl/docker/searxng/settings.yml`, se monta de sólo lectura y trae `search.formats: [html, json]`: el adaptador del bundle pide `format=json` y SearXNG sólo sirve HTML por defecto, así que sin esa línea toda consulta falla antes de llegar a un motor. El limitador queda apagado porque el servicio no se publica y su único cliente es este despliegue.

Los motores desactivados salen de una medición, no de una preferencia: `duckduckgo` devolvió su desafío anti-bot y `brave` limitó la tasa desde esta IP, mientras `mojeek`, `google`, `qwant` y `startpage` respondieron. Vuelve a medirse antes de reactivar cualquiera.

El respaldo es Tavily (1 000 créditos al mes), cuya clave se carga desde la página de configuración del bundle y queda en `$DSH_HOME/.credentials.yaml`. Con `provider: searxng` y `enableFallback: true`, una caída del motor sigue devolviendo resultados.

Comprobación:

```sh
# el motor responde JSON (lo que el adaptador necesita)
sudo docker exec -u node mdl-harness-mdl-harness-1 \
  curl -s 'http://searxng:8080/search?q=test&format=json' | head -c 200
# y el despliegue no publica ningún puerto nuevo del motor
sudo docker compose -f mdl/docker/compose.yml ps searxng
```

Comprobación:

```sh
sudo docker exec -u node mdl-harness-mdl-harness-1 graphify-mcp --help
sudo docker exec -u node mdl-harness-mdl-harness-1 \
  node /app/apps/cli/lib/bin.js --profile web --dump-config \
  | grep -A8 -e 'id: mcp-graphify' -e 'id: mcp-neon'
# graphify: transport stdio, command /usr/local/bin/graphify-mcp, args con el grafo inerte
# neon: readonly=true y roleName=mdl_reader en la url, la cabecera !!js sin evaluar
```

Una escritura a través del rol fijado responde `cannot execute DELETE in a read-only transaction` (`SQLSTATE 25006`), y las lecturas y los diagnósticos `inspect_database` siguen funcionando con ese rol.

## Correr las compuertas del repositorio dentro del contenedor

La imagen de runtime no trae `pnpm`, así que `pnpm run …` no existe aquí y las compuertas que lo requieren (`doc-sync`, `change-scope`, el typecheck del `pre-push`) fallan con `pnpm: not found`. `corepack` sí está, y basta con darle un `COREPACK_HOME` escribible y un shim en el `PATH`:

```sh
mkdir -p /tmp/pnpm-shim /tmp/corepack
printf '#!/bin/sh\nexec /usr/local/bin/node /usr/local/lib/node_modules/corepack/dist/corepack.js pnpm "$@"\n' > /tmp/pnpm-shim/pnpm
chmod +x /tmp/pnpm-shim/pnpm
PATH=/tmp/pnpm-shim:$PATH COREPACK_HOME=/tmp/corepack pnpm --version   # 11.7.0
```

Sin eso, las compuertas se corren desde el host o quedan pendientes, y `dsh plugin` sigue sin poder instalarse nada: es un forwarder de `pnpm`.

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
