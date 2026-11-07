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

## Credencial git

El contenedor usa una deploy key SSH de escritura limitada a `MarceloMedel/pipay-sii`. Vive en `/home/ubuntu/.config/mdl-harness/git/` (`MDL_GIT_DIR` cambia el origen), se monta en `/etc/mdl-harness/git` como solo lectura y la reescritura de URL aplica únicamente al remoto exacto de ese repo. El remoto del host sigue en HTTPS.

No está en la imagen, ni en el volumen `DSH_HOME`, ni en el backup. Para rotarla o revocarla: GitHub → repo → Settings → Deploy keys, y después borrar el directorio del host y regenerar el par.

## Credencial de GitHub para push y PR

El agente puede empujar ramas y abrir pull requests. La credencial es un token fine-grained limitado a `MarceloMedel/deepseek-harness` con `Contents: Read and write`, `Pull requests: Read and write`, `Issues: Read and write` y `Metadata: Read`; `Workflows` queda fuera a propósito. Vive en `/home/ubuntu/.config/mdl-harness/gh/token` (modo `0600`, dueño `ubuntu`), `MDL_GH_DIR` cambia el origen y se monta en `/etc/mdl-harness/gh` como solo lectura.

El token no se expone como variable de entorno. La imagen coloca `/usr/local/bin/gh`, que lee el archivo en cada invocación y delega en `/usr/bin/gh`, y registra un helper de credenciales para que `git push` por HTTPS use el mismo token. El helper responde únicamente a `github.com`. Consecuencia práctica: rotar el token es reemplazar el archivo, sin reiniciar el contenedor.

Creación, en el host:

```sh
install -d -m 0700 /home/ubuntu/.config/mdl-harness/gh
# Pegar el token emitido en GitHub → Settings → Developer settings →
# Fine-grained tokens, con los permisos de arriba y solo el repo del fork.
install -m 0600 /dev/stdin /home/ubuntu/.config/mdl-harness/gh/token
sudo docker compose -f mdl/docker/compose.yml up -d --build
```

Validación, dentro del contenedor:

```sh
sudo docker exec -it -u node mdl-harness-mdl-harness-1 gh api user --jq .login
sudo docker exec -it -u node mdl-harness-mdl-harness-1 gh pr list --repo MarceloMedel/deepseek-harness
```

Sin el archivo, `gh` termina con código 78 y un mensaje que nombra la ruta esperada; nunca imprime el token. El token queda legible para el agente, igual que la deploy key: por eso el alcance es de un solo repositorio y la rotación es inmediata.

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

### Límite del plano privilegiado

DSH no tiene autenticación propia y fija a loopback los métodos que leen o escriben configuración y credenciales (`settings.*`, `credentials.*`, `llm.discoverModels`, `host.pickDirectory`, `agentPreset.read/copy/remove/openDocument`). Por `dsh.devmedel.com` funcionan conversación y sesiones; la configuración se administra por `http://127.0.0.1:3081` (túnel SSH) o editando el volumen.

```sh
ssh -L 3081:127.0.0.1:3081 USUARIO@VPS
```

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
