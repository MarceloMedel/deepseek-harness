# SPEC-005 — Configuración, secretos, persistencia y sandbox

Estado: Validada
Fase: 5
Commit base: `c4f5f6e3e9`
Aprobación: usuario en el VPS, `Aprobar SPEC-005 completa`

## Objetivo

Convertir la imagen validada en una instancia operativa en el VPS: configuración reproducible sin secretos, exposición controlada por Cloudflare Access, persistencia y restauración comprobadas, y sandbox de DSH funcionando dentro del contenedor.

## Contexto

`SPEC-004` validó la imagen en macOS arm64. En el VPS amd64 se reconstruyó y se verificaron build, healthcheck, GUI, WebSockets, iconos, usuario no root, red loopback, volúmenes y ausencia del socket Docker.

La validación amd64 descubrió un defecto que bloquea la Fase 5: **el sandbox de DSH no puede arrancar dentro del contenedor**. `dsh-sandbox-local` prueba `bwrap` y luego Landlock; `bwrap` falla porque AppArmor del host restringe los user namespaces no privilegiados, y el launcher Landlock no existe en la imagen porque el binario nativo no se compila durante la build. Ambos peldaños quedan `unusable` y `bash` falla cerrado con `SANDBOX_UNAVAILABLE`.

Landlock sí funciona en este Docker: se compiló el launcher y se probó positivamente (escritura dentro de la ruta concedida) y negativamente (escritura fuera rechazada con `Permission denied`) en un contenedor desechable con el perfil por defecto y sin capabilities.

El agente del VPS debe leer [VPS_HANDOFF.md](../VPS_HANDOFF.md) y [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) antes de comenzar.

## Decisiones resueltas

| Decisión | Elección | Consecuencia |
|---|---|---|
| Proveedor | Ollama local, ruta OpenAI-compatible en `http://host.docker.internal:11434/v1` | Sin API key; los modelos `deepseek-v4.1-flash:cloud` (principal) y `gemma4:cloud` (alternativo) se declaran en `settings.yaml` |
| Acceso | Cloudflare Tunnel existente, hostname `dsh.devmedel.com`, Cloudflare Access con email OTP | No se abre ningún puerto público; el tunnel llega a Caddy y Caddy al contenedor |
| Exposición local | Se conserva `127.0.0.1:3081` en el VPS | Acceso de administración por túnel SSH; el plano privilegiado de DSH exige loopback |
| Persistencia | Volúmenes Docker con backup externo | Los volúmenes actuales se conservan |
| Backup | Diario fuera del volumen, retención de 7 días, en `/srv/backups/mdl-harness` | Restauración probada antes de validar la fase |
| Recursos | Límites pendientes de medir con el uso real | Se fijan al final de la fase con evidencia |
| UID/GID | UID 1000 (`node`) | Sin cambios |

### Restricción de seguridad del plano privilegiado

DSH no tiene autenticación propia y su herramienta `bash` ejecuta comandos en el contenedor. Además, `dsh-client-connection` fija los métodos privilegiados (`settings.*`, `credentials.*`, `llm.discoverModels`, `host.pickDirectory`, `agentPreset.read/copy/remove/openDocument`) a loopback mediante el fence de Host, independientemente de `trustedHosts`.

Por eso la exposición pública con Cloudflare Access queda limitada a sesiones y conversación: la configuración del proveedor, las credenciales y el selector de workspace se administran por loopback o escribiendo `$DSH_HOME/settings.yaml`. Esto es intencional y no se relaja en esta fase.

## Alcance

- Construir el launcher Landlock en la imagen y validar el sandbox con pruebas positivas y negativas.
- Configurar el proveedor Ollama en `$DSH_HOME/settings.yaml` sin secretos, de forma reproducible y persistente.
- Añadir `host.docker.internal` al contenedor y verificar el acceso al endpoint de Ollama del host.
- Publicar `dsh.devmedel.com` a través del Caddy y el cloudflared existentes, con Access email OTP.
- Pasar el hostname público a DSH como `--trusted-host` y verificar el fence.
- Probar backup y restauración de configuración, sesiones y workspace.
- Verificar que las sesiones sobreviven a reinicio y recreación del contenedor.
- Definir logs, healthcheck, reinicio y límites de recursos.
- Documentar el procedimiento operativo y de recuperación.

## Fuera del alcance

- Exposición pública sin Cloudflare Access.
- Dominio y certificados TLS propios.
- Multiusuario o cuentas compartidas.
- Publicación de la imagen en un registry.
- Sincronización automática de upstream.
- Optimización cosmética del tamaño de la imagen.
- Modificar el plano privilegiado de DSH para operarlo desde el hostname público.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CFG-01` | El proveedor y el modelo quedan configurados y persisten tras recrear el contenedor | UI local y reinicio |
| `CFG-02` | La configuración no depende de rutas o archivos del host no documentados | Revisión y clon limpio |
| `CFG-03` | `settings.yaml` no contiene secretos y declara el endpoint por `host.docker.internal` | Inspección del volumen |
| `SEC-01` | Ninguna credencial aparece en Git, imagen, logs, capturas o documentos | Escaneo y revisión |
| `SEC-02` | Las credenciales tienen permisos mínimos y no se montan en el workspace | Inspección de mounts y permisos |
| `SEC-03` | El puerto no se expone fuera de loopback | `docker port` y firewall |
| `ACCESS-01` | El acceso remoto entra solo por `dsh.devmedel.com` con Cloudflare Access | Prueba desde fuera sin sesión |
| `ACCESS-02` | Una solicitud sin sesión de Access no alcanza DSH | `curl` externo sin cookie |
| `ACCESS-03` | Los métodos privilegiados responden 403 desde el hostname público y funcionan por loopback | Prueba de ambos caminos |
| `DATA-01` | `DSH_HOME` y el workspace persisten tras reinicio y recreación | Prueba de escritura y reciclado |
| `DATA-02` | El backup restaura configuración y sesiones en un entorno limpio | Restauración verificada |
| `SANDBOX-01` | Un comando permitido dentro del workspace funciona | Prueba positiva |
| `SANDBOX-02` | Un acceso de escritura fuera del workspace falla de forma segura | Prueba negativa |
| `SANDBOX-03` | El sandbox no depende de privilegios o capabilities innecesarias | Inspección y prueba con límites |
| `SANDBOX-04` | El runner Landlock existe en la imagen y el probe reporta enforcement completo | `landlock-run --probe` dentro del contenedor |
| `OPS-01` | Healthcheck, reinicio y logs permiten diagnosticar la instancia | Operación y fallo simulado |
| `OPS-02` | Existe un procedimiento documentado de arranque, parada y recuperación | Revisión del documento |

## Validación prevista

### Sandbox

- Confirmar que el binario `native/landlock-run/packages/linux-x64/bin/landlock-run` existe y es ejecutable en la imagen.
- Ejecutar `landlock-run --probe` dentro del contenedor y registrar `landlock: fully enforced`.
- Ejecutar lectura y escritura permitidas dentro del workspace.
- Intentar escritura fuera del workspace y confirmar el rechazo con `sandbox.denied`.
- Comprobar que el fallo no deja el proceso ni el contenedor en estado inconsistente.
- Revisar capabilities, seccomp y montajes.

### Configuración

- Escribir `settings.yaml` con la ruta Ollama y el modelo principal.
- Recrear el contenedor y confirmar la persistencia del modelo y la conexión.
- Ejecutar una ronda corta con el agente desde loopback.

### Acceso

- Añadir el hostname al tunnel y a Caddy; recargar el gateway.
- Verificar que una solicitud externa sin Access es redirigida al login de Cloudflare.
- Verificar que la conversación carga con Access y que los métodos privilegiados responden 403 por el hostname público.
- Verificar que el plano privilegiado funciona por `http://127.0.0.1:3081` con túnel SSH.

### Datos

- Crear una sesión y un archivo de prueba.
- Ejecutar backup, eliminar volúmenes de prueba y restaurar.
- Verificar sesión, configuración y workspace restaurados.

### Operación y seguridad

- Simular reinicio y fallo de healthcheck.
- Revisar logs por secretos y errores.
- Verificar que el puerto sigue enlazado solo a `127.0.0.1`.
- Repetir el arranque desde un clon limpio en amd64.

## Validación ejecutada

Fecha: `2026-11-06T19:38:00Z`
Entorno: VPS Linux amd64, 6 vCPU, 11 GiB; Docker `29.9.3`, Compose `5.7.0`; imagen `mdl-harness:local` `sha256:ee2caa6a…`

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Build amd64 | Aprobada | Imagen `amd64`, contenedor `healthy` |
| Runner sandbox | Aprobado | `landlock-run --probe` → `landlock: fully enforced` |
| Sandbox positivo | Aprobado | `pwd` → `/workspace`; `sandbox.txt` creado con `ok` |
| Sandbox negativo | Aprobado | Escritura en `/etc` rechazada: `[sandbox: file access denied under workspace-write mode]`; archivo inexistente |
| Proveedor | Aprobado | Ruta `ollama` activa (`declared: true`) con `deepseek-v4.1-flash:cloud` y `gemma4:cloud` |
| Ronda real del agente | Aprobada | `pwd`, lectura de archivo y escritura con herramientas reales |
| Persistencia | Aprobada | Archivo y configuración sobreviven `restart` y recreación |
| Backup | Aprobado | `mdl-harness-20261106T193817Z.tar.gz`, modo 600, manifiesto con commit e imagen |
| Restauración | Aprobada | Volúmenes recreados desde cero; `settings.yaml` con el mismo hash; ronda del agente posterior |
| Límites | Aplicados | `NanoCpus=4e9`, memoria 4 GiB, `pids=512` |
| Ruteo por Caddy | Aprobado | `Host: dsh.devmedel.com` → 200 a través de `127.0.0.1:8080` |
| Fence privilegiado | Aprobado | `settings.describe` → 403 por hostname público; 200 por loopback |
| Fallo simulado | Aprobado | `pkill nginx` → contenedor reiniciado por `unless-stopped` y `healthy` |
| Backup diario | Instalado | Cron de root, `17 4 * * *`, log en `/var/log/mdl-harness-backup.log` |
| Red y credenciales | Aprobadas | Solo `127.0.0.1:3081`; sin `.credentials.yaml`; `settings.yaml` modo 600 |
| DNS público | Aprobado | `dsh.devmedel.com` resuelve al tunnel |
| Access sin sesión | Aprobado | `302` a `marcelomedel.cloudflareaccess.com/cdn-cgi/access/login/dsh.devmedel.com` antes de alcanzar DSH |
| Sesión con Access | Aprobada | Tunnel sirviendo `/plugins/events` del navegador; usuario confirmó la GUI operativa |

La ruta hacia Ollama requirió un header `Authorization` porque el transporte OpenAI-compatible de pi-ai lo exige aunque el endpoint no autentique. El valor es un literal no secreto y está documentado en `mdl/docker/settings.yaml`.

La aplicación de Access se creó por API el `2026-11-06T19:45Z`: `mdl-harness`, dominio `dsh.devmedel.com`, política `allow-owner` con el email del propietario, IdP `onetimepin` y sesión de 24 h. Se creó antes del DNS a propósito. El CNAME se creó desde el dashboard porque el token de API del gateway no tiene permiso de DNS.

## Resultado

**Validada.** Sandbox, proveedor, persistencia, backup, restauración, límites, operación y exposición con Access funcionan en la instancia amd64 del VPS.

## Pendientes

- Repetir el arranque desde un clon limpio en `SPEC-006`.
- Revisar el tamaño de la imagen y la política de retención cuando el uso real lo justifique.
