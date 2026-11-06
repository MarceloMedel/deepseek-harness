# SPEC-004 — Imagen Docker local

Estado: Aprobada
Fase: 4
Commit base: `fefd988b6241c8e200120febf4e8f0b2a543863c`
Aprobación para iniciar: usuario, continuación directa de la Fase 3

## Objetivo

Construir y validar una imagen Docker local de MDL-HARNESS que ejecute la aplicación compilada del fork con usuario no root, herramientas de desarrollo y un proxy loopback, sin publicar la imagen ni exponer el servicio fuera del equipo.

## Contexto

`SPEC-003` validó GUI, sesiones y agente real desde el fork. `pnpm deploy --prod` omite peers necesarios del runtime, por lo que esta fase utiliza un snapshot completo del monorepo compilado. La optimización del tamaño y la validación profunda del sandbox pertenecen a fases posteriores.

## Alcance

- Dockerfile multietapa con build del monorepo y runtime Linux.
- Usuario no root y directorios persistentes para `DSH_HOME` y workspace.
- Nginx interno escuchando en `0.0.0.0:8080` y proxy hacia DSH en `127.0.0.1:3080`.
- Publicación únicamente en `127.0.0.1` del host.
- Herramientas: Git, Bash, curl, SSH, Python, uv, Graphify, GitHub CLI y Docker CLI.
- Docker CLI sin socket ni acceso al daemon del host.
- Imagen etiquetada localmente, sin registry.
- Volúmenes nombrados para configuración y workspace.

## Fuera del alcance

- VPS, dominio, TLS público o túnel SSH.
- Publicación en GHCR o Docker Hub.
- Migración completa de configuración y sesiones personales.
- Autenticación multiusuario.
- Optimización agresiva de tamaño de imagen.
- Validación final de backup, restauración y sandbox; pertenecen a la Fase 5.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `DOCKER-01` | La imagen se construye localmente desde el fork | Build con código 0 |
| `DOCKER-02` | El proceso runtime no es root | `id -u` distinto de 0 |
| `DOCKER-03` | Las herramientas solicitadas están disponibles | Versiones dentro del contenedor |
| `DOCKER-04` | La GUI y el transporte Web funcionan a través del proxy | Navegador y API responden |
| `DOCKER-05` | DSH escucha solo en loopback y el puerto del host se publica solo en `127.0.0.1` | Inspección de red y compose |
| `DOCKER-06` | `DSH_HOME` y workspace usan volúmenes persistentes | Volúmenes creados y escribibles |
| `DOCKER-07` | No se monta el socket Docker | Inspección de mounts |
| `DOCKER-08` | No hay credenciales incorporadas en la imagen | Escaneo del contexto y la imagen |
| `DOCKER-09` | La imagen queda solo local | `docker image ls`, sin push |
| `DOCKER-10` | La imagen conserva el branding e iconos validados | HTTP y assets del contenedor |

## Validación prevista

### Build

- Construir la imagen desde el commit candidato.
- Confirmar que no se copian `node_modules` del host ni secretos.
- Verificar el tamaño y la arquitectura resultante.

### Ejecución

- Levantar con Compose usando la imagen local.
- Comprobar Healthcheck y URL `http://127.0.0.1:3081`.
- Verificar título, iconos, manifest y carga de la GUI.
- Ejecutar las herramientas dentro del contenedor.
- Confirmar que el usuario es no root y que no existe `/var/run/docker.sock`.
- Comprobar que DSH no escucha en todas las interfaces.
- Detener el contenedor y verificar que los volúmenes permanecen.

## Resultado

Pendiente de ejecución.

## Pendientes

- Registrar evidencia y decisión de salida al finalizar.
