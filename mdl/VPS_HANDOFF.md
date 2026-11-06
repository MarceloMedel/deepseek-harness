# MDL-HARNESS — traspaso al VPS

Este documento es el punto de entrada para el agente que continuará el trabajo desde el VPS. El estado validado localmente es la Fase 4; las fases 5 y 6 están preparadas como borradores.

## Repositorio y rama

- Repositorio: `https://github.com/MarceloMedel/deepseek-harness.git`
- Rama estable: `main`
- Cuenta esperada: `MarceloMedel`
- No se versionan credenciales, sesiones, workspaces ni volúmenes Docker.

## Primer arranque en el VPS

```sh
git clone https://github.com/MarceloMedel/deepseek-harness.git
cd deepseek-harness
git switch main
docker compose -f mdl/docker/compose.yml up -d --build
```

Verificar:

```sh
docker compose -f mdl/docker/compose.yml ps
curl -fsS http://127.0.0.1:3081/ >/dev/null && echo "MDL-HARNESS OK"
```

La URL del host es `http://127.0.0.1:3081`. Desde el equipo local se accede mediante un túnel SSH:

```sh
ssh -L 3081:127.0.0.1:3081 USUARIO@VPS
```

Abrir `http://127.0.0.1:3081` en el navegador local.

## Arquitectura actual

- La imagen `mdl-harness:local` compila el monorepo y ejecuta DSH como usuario no root `node` (UID 1000).
- DSH escucha en `127.0.0.1:3080` dentro del contenedor.
- Nginx escucha en `0.0.0.0:8080` dentro del contenedor y hace proxy HTTP/WebSocket.
- Compose publica solo `127.0.0.1:3081` en el host.
- Los volúmenes `mdl-harness_mdl-dsh-home` y `mdl-harness_mdl-workspace` persisten configuración y workspace.
- El socket Docker no se monta. La Docker CLI del contenedor no controla el host.
- La imagen local fue validada en `linux/arm64`; el VPS amd64 debe reconstruirla y verificar la arquitectura.

## Configuración y secretos

La imagen no contiene claves. El primer arranque muestra el onboarding de API key.

- No copiar `~/.dsh`, `.credentials.yaml` ni sesiones personales al repositorio o a la imagen.
- Configurar el proveedor desde la UI o mediante el volumen `DSH_HOME`, según se defina en `SPEC-005`.
- Mantener las credenciales fuera del contexto Docker; `.dockerignore` excluye `.env`.
- No montar `/var/run/docker.sock`.
- No exponer `3081` en una interfaz pública sin una especificación de seguridad aprobada.

## Flujo obligatorio

1. Leer `mdl/PRODUCT_SPEC.md`, `mdl/ROADMAP.md` y la especificación activa.
2. Aprobar la especificación antes de implementar.
3. Trabajar en una rama `change/NNN-*`.
4. Validar solo lo ejecutado y registrar evidencia en la especificación.
5. Actualizar roadmap y `main` al cerrar la fase.
6. No usar `git push --force` ni reescribir historia publicada.
7. No agregar atribución de IA a commits.

## Estado y límites conocidos

- Fase 1: base reproducible, validada.
- Fase 2: branding, idioma e icono, validados.
- Fase 3: GUI, sesiones y agente real local, validados.
- Fase 4: imagen Docker local, healthcheck, proxy, WebSockets, herramientas y volúmenes, validados.
- La imagen mide aproximadamente 4,1 GB; la optimización queda pendiente.
- El sandbox dentro del contenedor todavía no tiene pruebas positivas y negativas.
- No existen backups automáticos ni restauración probada.
- La build amd64 y el despliegue remoto todavía no se ejecutaron.
- El contenedor no tiene proveedor configurado; es esperado.

## Siguiente trabajo

Abrir `mdl/specs/005-config-persistence-security.md`, resolver las decisiones pendientes y aprobarla antes de implementar. Después de validarla, continuar con `mdl/specs/006-reproducible-candidate.md`.

## Operación

```sh
# Detener conservando volúmenes
docker compose -f mdl/docker/compose.yml down

# Ver logs
docker compose -f mdl/docker/compose.yml logs -f

# Reconstruir tras cambios
docker compose -f mdl/docker/compose.yml up -d --build
```

Eliminar volúmenes solo con intención explícita:

```sh
docker compose -f mdl/docker/compose.yml down -v
```
