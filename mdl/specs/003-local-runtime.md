# SPEC-003 — Validación local integrada

Estado: Aprobada
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

## Resultado

Pendiente de ejecución.

## Pendientes

- Registrar evidencia y decisión de salida al finalizar.
