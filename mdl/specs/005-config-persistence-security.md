# SPEC-005 — Configuración, secretos, persistencia y sandbox

Estado: Borrador
Fase: 5
Commit base: `c2ae876209f165c34e0ea4393cb314c677fc4ef6`
Aprobación requerida antes de implementar: usuario en el VPS

## Objetivo

Convertir la imagen local validada en una instancia operativa en el VPS: configuración reproducible, credenciales fuera de Git, persistencia y restauración comprobadas, y sandbox de DSH validado dentro del contenedor.

## Contexto

`SPEC-004` validó la imagen, el proxy loopback, las WebSockets, las herramientas y la persistencia básica de volúmenes. Falta definir cómo se configura el proveedor, cómo se protegen y restauran los datos y si el sandbox funciona con el aislamiento de Docker del VPS.

El agente del VPS debe leer [VPS_HANDOFF.md](../VPS_HANDOFF.md) y [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) antes de comenzar.

## Decisiones pendientes de aprobación

| Decisión | Opciones | Propuesta inicial |
|---|---|---|
| Proveedor | Ollama local, DeepSeek API u otro compatible | Reutilizar el proveedor ya configurado en el entorno del usuario |
| Acceso | Túnel SSH, VPN o proxy autenticado | Túnel SSH; no abrir el puerto público |
| Persistencia | Volúmenes Docker o bind mounts | Volúmenes Docker con backup externo |
| Backup | Ruta local del VPS, almacenamiento externo o ambos | Backup diario fuera del volumen y retención definida |
| Recursos | Límites de CPU/RAM y concurrencia | Fijar según capacidad real del VPS |
| UID/GID | UID 1000 o mapeo al usuario del host | Mantener UID 1000 salvo requisito del host |

No implementar una opción por defecto sin aprobación cuando cambie el modelo de seguridad, el proveedor o la exposición de red.

## Alcance

- Configurar el proveedor y el modelo sin incorporar secretos al repositorio.
- Inyectar credenciales mediante un archivo o variable externa con permisos restringidos.
- Validar permisos de `DSH_HOME`, workspace, credenciales y backups.
- Probar backup y restauración de configuración y sesiones.
- Verificar que las sesiones sobreviven a reinicio y recreación del contenedor.
- Validar el sandbox de DSH dentro de Docker con pruebas positivas y negativas.
- Endurecer el runtime si la validación descubre capabilities o permisos innecesarios.
- Definir logs, healthcheck, reinicio y límites de recursos.
- Verificar la build amd64 y el acceso exclusivo por loopback o túnel SSH.
- Documentar el procedimiento operativo y de recuperación.

## Fuera del alcance

- Exposición pública sin autenticación.
- Dominio y certificados TLS públicos.
- Multiusuario o cuentas compartidas.
- Publicación de la imagen en un registry.
- Sincronización automática de upstream.
- Optimización cosmética del tamaño de la imagen.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CFG-01` | El proveedor y el modelo quedan configurados y persisten tras recrear el contenedor | UI y reinicio |
| `CFG-02` | La configuración no depende de rutas o archivos del host no documentados | Revisión y clon limpio |
| `SEC-01` | Ninguna credencial aparece en Git, imagen, logs, capturas o documentos | Escaneo y revisión |
| `SEC-02` | Las credenciales tienen permisos mínimos y no se montan en el workspace | Inspección de mounts y permisos |
| `SEC-03` | El puerto no se expone fuera de loopback sin una decisión de seguridad aprobada | `docker port`, firewall y túnel SSH |
| `DATA-01` | `DSH_HOME` y el workspace persisten tras reinicio y recreación | Prueba de escritura y reciclado |
| `DATA-02` | El backup restaura configuración y sesiones en un entorno limpio | Restauración verificada |
| `SANDBOX-01` | Un comando permitido dentro del workspace funciona | Prueba positiva |
| `SANDBOX-02` | Un acceso de escritura fuera del workspace falla de forma segura | Prueba negativa |
| `SANDBOX-03` | El sandbox no depende de privilegios o capabilities innecesarias | Inspección y prueba con límites |
| `OPS-01` | Healthcheck, reinicio y logs permiten diagnosticar la instancia | Operación y fallo simulado |
| `OPS-02` | Existe un procedimiento documentado de arranque, parada y recuperación | Revisión del documento |

## Validación prevista

### Configuración

- Configurar el proveedor elegido desde el flujo aprobado.
- Recrear el contenedor y confirmar la persistencia del modelo y la conexión.
- Ejecutar una ronda corta con el agente.

### Datos

- Crear una sesión y un archivo de prueba.
- Ejecutar backup, eliminar el volumen de prueba y restaurar.
- Verificar sesión, configuración y workspace restaurados.

### Sandbox

- Ejecutar lectura y escritura permitidas dentro del workspace.
- Intentar escritura fuera del workspace y confirmar el rechazo.
- Comprobar que el fallo no deja el proceso ni el contenedor en estado inconsistente.
- Revisar capabilities, seccomp y montajes.

### Operación y seguridad

- Simular reinicio y fallo de healthcheck.
- Revisar logs por secretos y errores.
- Verificar que el puerto sigue enlazado solo a `127.0.0.1`.
- Repetir el arranque desde un clon limpio en la arquitectura amd64.

## Resultado

Pendiente de aprobación e implementación.

## Pendientes

- Resolver las decisiones de configuración y seguridad con el usuario.
- Ejecutar la validación y registrar evidencia al finalizar.
