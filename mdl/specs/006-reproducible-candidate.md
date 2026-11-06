# SPEC-006 — Candidato reproducible en el VPS

Estado: Borrador
Fase: 6
Commit base: se registra al validar `SPEC-005`
Aprobación requerida antes de implementar: usuario en el VPS

## Objetivo

Reproducir MDL-HARNESS desde un clon limpio del repositorio en el VPS y demostrar que la imagen, la configuración restaurada y el agente funcionan con los mismos resultados que la instancia validada.

## Contexto

Esta fase comprueba la reproducibilidad, no agrega funcionalidad. Se ejecuta después de `SPEC-005`, cuando ya están definidos el proveedor, los secretos, el backup y el sandbox.

## Alcance

- Clonar `main` en un directorio limpio del VPS.
- Construir la imagen nativa en amd64 y registrar el digest local.
- Arrancar con volúmenes nuevos y restaurar un backup validado.
- Verificar GUI, WebSockets, sesiones, herramientas y una ronda corta del agente.
- Registrar versiones, commit, comandos y resultados.
- Confirmar que no se necesitan archivos no versionados para arrancar.
- Crear un tag o referencia de release local si el usuario lo aprueba.

## Fuera del alcance

- Publicación automática de imágenes o tags.
- Alta disponibilidad, balanceo o múltiples nodos.
- Cambios de producto no necesarios para reproducir el candidato.
- Sincronización de upstream no aprobada.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CAND-01` | Un clon limpio de `main` construye la imagen sin pasos secretos | Build desde directorio nuevo |
| `CAND-02` | La arquitectura resultante coincide con el VPS | `docker image inspect` |
| `CAND-03` | El candidato arranca con volúmenes nuevos y configuración restaurada | Compose y UI |
| `CAND-04` | La sesión, el workspace y el agente funcionan tras la restauración | Ronda corta y archivo de prueba |
| `CAND-05` | La instancia queda solo en loopback y sin socket Docker | Inspección de red y mounts |
| `CAND-06` | La evidencia registra commit, versiones, comandos y desviaciones | Especificación completada |

## Validación prevista

1. Clonar el repositorio público en un directorio nuevo.
2. Construir y arrancar sin reutilizar el árbol de trabajo original.
3. Restaurar el backup aprobado en `SPEC-005`.
4. Ejecutar una ronda corta con el agente y verificar un archivo en el workspace.
5. Recargar la GUI y comprobar persistencia.
6. Comparar red, usuario, herramientas y volúmenes con la instancia de referencia.
7. Registrar el resultado y decidir si el candidato queda aprobado.

## Resultado

Pendiente de aprobación e implementación.

## Pendientes

- Esperar la validación de `SPEC-005`.
- Definir si se crea un tag de release local.
