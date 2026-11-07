# MDL-HARNESS — traspaso al VPS

Este documento es el punto de entrada para el agente que continúa el trabajo desde el VPS. La Fase 4 está validada en amd64 y la Fase 5 está implementada y validada localmente; falta la publicación por Cloudflare Access.

## Repositorio y rama

- Repositorio: `https://github.com/MarceloMedel/deepseek-harness.git`
- Rama estable: `main`
- Rama activa: `change/005-config-persistence-security`
- Cuenta esperada: `MarceloMedel`
- No se versionan credenciales, sesiones, workspaces ni volúmenes Docker.

## Arranque en el VPS

`ubuntu` no pertenece al grupo `docker`; todas las órdenes usan `sudo`.

```sh
git clone https://github.com/MarceloMedel/deepseek-harness.git
cd deepseek-harness
git switch main
sudo docker compose -f mdl/docker/compose.yml up -d --build
```

Verificar:

```sh
sudo docker compose -f mdl/docker/compose.yml ps
curl -fsS http://127.0.0.1:3081/ >/dev/null && echo "MDL-HARNESS OK"
```

La URL local es `http://127.0.0.1:3081`. Desde el equipo local se accede por túnel SSH:

```sh
ssh -L 3081:127.0.0.1:3081 USUARIO@VPS
```

## Arquitectura actual

- La imagen `mdl-harness:local` compila el monorepo y el launcher Landlock, y ejecuta DSH como usuario no root `node` (UID 1000).
- DSH escucha en `127.0.0.1:3080` dentro del contenedor.
- Nginx escucha en `0.0.0.0:8080` dentro del contenedor y hace proxy HTTP/WebSocket.
- Compose publica solo `127.0.0.1:3081` en el host y une el contenedor a la red externa `edge`.
- Los volúmenes `mdl-harness_mdl-dsh-home` y `mdl-harness_mdl-workspace` persisten configuración y workspace.
- El socket Docker no se monta. La Docker CLI del contenedor no controla el host.
- Límites: 4 CPU, 4 GiB de memoria, 512 procesos.

## Proveedor y configuración

La instancia usa Ollama del host por su endpoint OpenAI-compatible: `http://host.docker.internal:11434/v1`, con `deepseek-v4.1-flash:cloud` como modelo principal y `gemma4:cloud` como alternativo. No requiere credencial.

`mdl/docker/settings.yaml` es la plantilla; el entrypoint la copia a `$DSH_HOME/settings.yaml` solo cuando el volumen todavía no tiene una. Desde ahí manda el volumen.

El plano privilegiado de DSH (`settings.*`, `credentials.*`, `llm.discoverModels`, `host.pickDirectory`) está fijado a loopback: se administra por `127.0.0.1:3081`, nunca por el hostname público.

## Proyectos del host

El contenedor monta `/srv/projects` en lectura-escritura en la misma ruta (`MDL_PROJECTS_DIR` cambia el origen). Para trabajar sobre un repo, elegí esa carpeta como workspace desde la GUI por loopback; el sandbox confina las escrituras al workspace elegido y `secrets` sigue inaccesible para el usuario `node`. Los proyectos no forman parte del backup diario.

El contenedor autentica git y `gh` con un único token de GitHub por HTTPS, montado en solo lectura desde `/home/ubuntu/.config/mdl-harness/gh/token` (`MDL_GH_DIR` cambia el origen). Ese token está limitado a la cuenta y alcanza cualquier repositorio al que se le dé acceso; con él funcionan `clone`, `push` y la apertura de PR, sin configuración por repositorio. Para revocarlo: GitHub → Settings → Developer settings → Fine-grained tokens, y reemplazar el archivo del host.

No hay deploy keys ni claves SSH en el contenedor. La reescritura a SSH que usaba `pipay-sii` se retiró: ese repositorio, como cualquier otro, pasa por el token.

## Sandbox

La cadena Linux prueba `bwrap` y recurre a Landlock. Dentro del contenedor `bwrap` no puede crear user namespaces por AppArmor, así que el runner efectivo es Landlock, compilado en la imagen. Sin ese binario el sandbox falla cerrado y `bash` no ejecuta.

```sh
sudo docker exec -u node mdl-harness-mdl-harness-1 \
  /app/native/landlock-run/packages/linux-x64/bin/landlock-run --probe
```

## Acceso remoto

El hostname previsto es `dsh.devmedel.com` a través del tunnel existente. La configuración del gateway vive en `/srv/projects/personal-suite/ops/gateway/` y ya incluye el ingress y el bloque de Caddy.

La aplicación de Access (`mdl-harness`, política `allow-owner` con email, One-time PIN, 24 h) y el CNAME hacia el tunnel están operativos. Sin sesión, el hostname responde `302` al login de Cloudflare y no alcanza DSH.

El plano privilegiado de DSH sigue disponible solo por loopback, no por el hostname público. La aplicación de Access debe existir antes que el DNS: sin ella, cualquiera que resuelva el hostname puede ejecutar comandos en el contenedor.

## Instalación en el iPhone

La interfaz se instala en la pantalla de inicio del iPhone sin pasar por la App Store ([SPEC-014](specs/014-instalacion-ios.md)). La imagen sirve el manifest y los iconos; la instalación solo requiere que la instancia corra una versión que incluya las etiquetas `apple-mobile-web-app-*` del shell.

1. En el iPhone, abrir `https://dsh.devmedel.com` en Safari e iniciar sesión en Cloudflare Access con el email autorizado.
2. Compartir → «Añadir a pantalla de inicio». En iOS 16.4 o posterior también se ofrece desde Chrome, Edge y Firefox.
3. Confirmar el nombre `NIM`: el icono abre la conversación a pantalla completa, sin la barra de Safari.

iOS fija el nombre y el icono al instalar: un cambio de etiqueta llega cuando el contenedor reconstruido sirve el manifest nuevo y el icono se elimina y se vuelve a añadir desde Safari, porque reinstalar sobre el icono existente conserva el nombre anterior. La etiqueta vive en `name`/`short_name` del manifest y en `apple-mobile-web-app-title`; el nombre dentro del producto sigue en `<title>` y en el wordmark ([SPEC-014](specs/014-instalacion-ios.md)).

La sesión de Access dura 24 h; cuando vence, la app instalada muestra el login de Cloudflare dentro de la propia app. Subirla a una semana o a un mes es `Session Duration` en Zero Trust → Access → Applications → `mdl-harness`, fuera de este repositorio. Los ajustes de proveedor, credenciales y selector de workspace siguen respondiendo `403` por el hostname público, así que tampoco se alcanzan desde la app instalada: se administran por loopback.

## Backup y restauración

```sh
sudo mdl/docker/backup.sh              # detiene, archiva y reinicia
sudo mdl/docker/restore.sh <archivo>   # destructivo, pide confirmación
```

Cron diario a las `04:17` en `/srv/backups/mdl-harness`, retención de 7 días, modo 600. El manifiesto registra fecha, commit e imagen.

## Estado

- Fase 1: base reproducible, validada.
- Fase 2: branding, idioma e icono, validados.
- Fase 3: GUI, sesiones y agente real local, validados.
- Fase 4: imagen Docker, healthcheck, proxy, WebSockets, herramientas y volúmenes, validados en amd64.
- Fase 5: sandbox, proveedor, persistencia, backup, restauración, límites, ruteo y acceso con Cloudflare Access, validados.
- Fase 6: candidato reproducible desde un clon limpio, restauración del backup y agente, validados en amd64.

Límites conocidos:

- La imagen mide aproximadamente 4,2 GB; la optimización queda pendiente.
- La retención del backup es de 7 días y no hay copia externa al VPS.
- `bwrap` no es usable dentro del contenedor; el runner es Landlock.
- El plano privilegiado de DSH solo funciona por loopback, no por `dsh.devmedel.com`.
- La app instalada en el iPhone vuelve a pedir el PIN de Cloudflare Access cada 24 h.
- Los IDs de imagen no son idénticos entre builds sucesivos; la reproducibilidad es funcional, no bit a bit.
- Quedan `/srv/repro/deepseek-harness` y la imagen `mdl-harness:candidate` del ensayo.

## Siguiente trabajo

Todas las fases están validadas. El trabajo siguiente es de producto y requiere su propia especificación: decidir un tag local de release, optimizar el tamaño de la imagen o incorporar cambios de upstream.

## Flujo obligatorio

1. Leer `mdl/PRODUCT_SPEC.md`, `mdl/ROADMAP.md` y la especificación activa.
2. Aprobar la especificación antes de implementar.
3. Trabajar en una rama `change/NNN-*`.
4. Validar solo lo ejecutado y registrar evidencia en la especificación.
5. Actualizar roadmap y `main` al cerrar la fase.
6. No usar `git push --force` ni reescribir historia publicada.
7. No agregar atribución de IA a commits.

## Operación

```sh
sudo docker compose -f mdl/docker/compose.yml logs -f
sudo docker compose -f mdl/docker/compose.yml restart
sudo docker compose -f mdl/docker/compose.yml down      # conserva volúmenes
sudo docker compose -f mdl/docker/compose.yml down -v   # elimina datos
sudo docker compose -f mdl/docker/compose.yml up -d --build
```
