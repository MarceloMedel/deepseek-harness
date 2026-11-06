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

## Sandbox

La cadena Linux prueba `bwrap` y recurre a Landlock. Dentro del contenedor `bwrap` no puede crear user namespaces por AppArmor, así que el runner efectivo es Landlock, compilado en la imagen. Sin ese binario el sandbox falla cerrado y `bash` no ejecuta.

```sh
sudo docker exec -u node mdl-harness-mdl-harness-1 \
  /app/native/landlock-run/packages/linux-x64/bin/landlock-run --probe
```

## Acceso remoto

El hostname previsto es `dsh.devmedel.com` a través del tunnel existente. La configuración del gateway vive en `/srv/projects/personal-suite/ops/gateway/` y ya incluye el ingress y el bloque de Caddy.

Pendiente en el dashboard de Cloudflare, en este orden:

1. Crear la aplicación de Access para `dsh.devmedel.com` con política por email (One-time PIN), igual que las de `app.devmedel.com`.
2. Crear el CNAME `dsh.devmedel.com` hacia `e95d9ad3-a210-4269-b357-e42c9e99dac8.cfargotunnel.com`, proxied.
3. Verificar que sin sesión de Access el hostname redirige al login y no alcanza DSH.

Sin Access, cualquiera que resuelva el hostname puede ejecutar comandos en el contenedor. No crear el DNS antes que la aplicación de Access.

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
- Fase 5: sandbox, proveedor, persistencia, backup, restauración, límites y ruteo validados; publicación pendiente.
- Fase 6: borrador, depende del cierre de la Fase 5.

Límites conocidos:

- La imagen mide aproximadamente 4,2 GB; la optimización queda pendiente.
- La retención del backup es de 7 días y no hay copia externa al VPS.
- `dsh.devmedel.com` todavía no resuelve.
- `bwrap` no es usable dentro del contenedor; el runner es Landlock.

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
