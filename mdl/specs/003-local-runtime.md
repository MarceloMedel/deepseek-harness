# SPEC-003 — Validación local integrada

Estado: Validada
Fase: 3
Commit base: `f243441c78b1064805473035f6ff7e1fd173c4e1`
Aprobación para iniciar: usuario, `listo, validado. avancemos`

## Objetivo

Validar el producto completo desde el fork: interfaz, conexión, sesiones y una ejecución real del agente dentro de un workspace desechable, sin afectar la instalación global ni sus sesiones personales.

## Contexto

`SPEC-002` está validada visualmente e integrada en la rama estable. Esta fase comprueba el comportamiento ensamblado antes de introducir Docker. No agrega funcionalidad salvo correcciones necesarias para el arranque o la ejecución.

## Alcance

- Arrancar el fork compilado en un puerto loopback distinto de `3080`.
- Usar un `DSH_HOME` temporal y un workspace desechable.
- Verificar carga del shell, boot manifest, plugins de cliente y conexión.
- Crear, reabrir y cambiar una sesión y un workspace de prueba.
- Refrescar el navegador y comprobar reconexión.
- Ejecutar una ronda real del agente con una credencial inyectada temporalmente.
- Ejecutar un comando seguro y comprobar lectura/escritura dentro del workspace desechable.
- Confirmar que el DSH global y sus sesiones no cambian.

## Fuera del alcance

- Docker y persistencia de volúmenes.
- Migración de configuraciones o sesiones personales.
- Cambios de autenticación, red pública o exposición remota.
- Sincronización con upstream.
- Rediseño visual; solo se corrigen defectos que impidan la validación.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `RUN-01` | El fork compilado arranca en un puerto alterno con `DSH_HOME` aislado | Servidor escucha y URL responde |
| `RUN-02` | La interfaz carga con boot manifest y plugins de cliente | Navegador sin errores funcionales |
| `SESSION-01` | Se crea, reabre y cambia una sesión y workspace de prueba | Inspección UI y estado |
| `CONN-01` | Un refresh recupera la sesión y la conexión de eventos | Navegador y log del servidor |
| `AGENT-01` | Una petición real produce respuesta del proveedor | Ronda completada en la UI |
| `AGENT-02` | El agente ejecuta una herramienta segura y accede al workspace desechable | Resultado visible y archivo de prueba |
| `AGENT-03` | No se modifican archivos fuera del workspace permitido | Inspección del sandbox y del workspace |
| `ISOLATION-01` | El DSH global y sus sesiones permanecen intactos | Puerto `3080` y estado previo sin cambios |
| `RUN-SEC-01` | La credencial temporal no aparece en el repositorio ni en registros | Búsqueda y limpieza del entorno |

## Validación prevista

### Automática

- Compilación del fork.
- Suites acotadas de la superficie modificada si esta fase requiere algún arreglo.
- Verificación HTTP de la instancia y del endpoint de eventos.

### Manual y navegador

- Carga de la GUI en un puerto alterno.
- Creación de workspace y sesión desechables.
- Recarga completa y reapertura de la sesión.
- Ejecución del agente y de una herramienta segura.
- Comparación con el estado de la instalación global.

### Seguridad

- La credencial se inyecta solo en el proceso temporal.
- No se imprime, versiona ni incorpora a capturas.
- El `DSH_HOME` temporal y el workspace desechable se eliminan o quedan fuera del repositorio al terminar.

## Validación ejecutada

Fecha: `2026-11-06T15:20:50-0300`
Entorno: macOS 15.7.7, arm64; Node `22.23.2`; Chromium Playwright

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Arranque aislado | Aprobado | `http://127.0.0.1:3081` con `DSH_HOME` temporal |
| Interfaz y conexión | Aprobadas | Shell cargado, inglés activo, 0 errores de página |
| Workspace | Aprobado | `/private/tmp/mdl-harness-phase3-workspace` conectado |
| Sesión creada | Aprobada | Título `Run pwd and create phase3 file` |
| Reapertura tras recarga | Aprobada | Conversación, herramientas y salida restauradas |
| Cambio de sesión | Aprobado | Nueva sesión en blanco y regreso a la sesión del agente |
| Ronda real del agente | Aprobada | `deepseek-v4.1-flash:cloud`, 1 turno, 4 pasos, 0 errores |
| Herramientas | Aprobadas | Bash ejecutó `pwd`; Write produjo `phase3.txt` |
| Archivo producido | Aprobado | `/tmp/mdl-harness-phase3-workspace/phase3.txt`, 9 bytes, `phase3-ok` sin salto final |
| Sandbox | Aprobado | Ningún otro archivo del workspace o repositorio fue modificado |
| DSH global | Intacto | `http://127.0.0.1:3080` respondió HTTP 200 |
| Credencial temporal | Limpiada | Enlace eliminado; archivo original de DSH intacto |

La primera conexión falló porque el `settings.yaml` copiado seleccionaba el preset `standard-wide`, ausente en el perfil limpio. Se cambió únicamente el hogar temporal a `standard`; no se modificó código del producto.

Evidencia visual:

- `/tmp/mdl-harness-visual/phase3-agent-round.png`
- `/tmp/mdl-harness-visual/phase3-session-reopened.png`
- `/tmp/mdl-harness-visual/phase3-session-switch.png`

## Resultado

**Validada.** La GUI, la conexión, el workspace, las sesiones y una ronda real del agente funcionan desde el fork compilado.

## Pendientes

- Ninguno para esta especificación.
- La Fase 4 puede iniciar.
