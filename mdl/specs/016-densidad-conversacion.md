# SPEC-016 — Densidad de la conversación

Estado: Aprobada
Fase: 16
Commit base: `fdaeb34d10`
Aprobación: usuario en sesión Web, `continue` sobre la propuesta de la Fase 15

## Objetivo

Que cada lector elija cuánto trabajo intermedio muestra la conversación por defecto, con tres niveles persistentes: la fila de actividad por bloque, una fila por paso, o una fila por paso con el razonamiento ya abierto.

## Contexto

[SPEC-015](015-conversacion-compacta.md) dejó el plegado como comportamiento único: cada bloque de trabajo ocupa una fila y el detalle vive detrás de expandir. Ese valor por defecto no sirve a quien quiere seguir el razonamiento mientras ocurre ni a quien prefiere contar con una fila por llamada sin expandir nada. El registro de preferencias del plugin ya existe (`ui-conversation` en el documento de ajustes del Host, con `busyEnter` como primer campo) y la fila de ajustes generales ya es un punto de composición, de modo que la elección no requiere ningún concepto nuevo de transporte ni de estado.

## Alcance

- Preferencia persistente `chatDensity` con los valores `compact`, `balanced` y `detailed`, por defecto `compact`.
- Fila de ajustes generales que muestra y cambia el nivel.
- `compact` mantiene el plegado por bloque; `balanced` desactiva el plegado; `detailed` desactiva el plegado y abre el razonamiento de cada paso.
- La línea viva con la acción en curso no depende del nivel.

## Fuera del alcance

- Abrir por defecto la tarjeta de una herramienta o su salida: eso pertenece a la presentación de `ui-tool`, que no amplía su API pública en este cambio.
- Cambiar lo que el plegado contiene, su resumen o su regla de corte.
- Preferencia por sesión: la densidad es del usuario, no de la conversación.
- Trajectory, el panel de detalles y las pruebas de snapshots del navegador.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `DENS-01` | Sin sección del Host, la densidad vale `compact` y un cambio se publica en el acto | Test unitario de `ChatDensityPreference` |
| `DENS-02` | El valor del Host se adopta sin reescribirlo, y escribir el mismo valor no genera una segunda escritura | Test unitario con `stubSettingsScope` |
| `DENS-03` | La sección `ui-conversation` del Host declara y valida `chatDensity`, y rechaza un valor desconocido | Test del host con el proveedor de ajustes en memoria |
| `DENS-04` | La fila de ajustes generales muestra el título, la descripción y el nivel activo, y al elegir otro nivel lo escribe y lo refleja | Test jsdom de la fila |
| `DENS-05` | Con `balanced` y con `detailed` ninguna corrida se pliega: cada llamada conserva su propia fila | Test jsdom de `ChatView` en los dos niveles |
| `DENS-06` | Con `detailed` el razonamiento de un paso se muestra abierto, y el lector puede cerrarlo | Test jsdom de `AssistantMarkdown` |
| `DENS-07` | La línea viva sigue apareciendo en los tres niveles mientras un turno corre | Test jsdom de `LiveActivity` (sin cambios de comportamiento) |

## Restricciones

- Solo presentación: ningún evento de sesión, ningún campo de wire nuevo y ninguna lectura nueva del modelo.
- Una sola lectura del namespace de ajustes: ambas preferencias comparten el mismo scope.
- `MDL-THEME-01` y `MDL-THEME-02`: la fila nueva usa los primitivos existentes, sin colores literales.
- `MDL-LOCALE-01`: la copia nueva existe en inglés y chino.
- `MDL-VALID-01`: lo no ejecutado se registra como pendiente.

## Implementación

`conversation-settings.ts` (antes `submission-settings.ts`) declara el campo nuevo y su validación; `preferences.ts` concentra la adopción y la escritura de una preferencia escalar, compartida por la política de Enter y por `ChatDensityPreference`; `DensityRow` ocupa un segundo `settings.general.item`; el registro de la vista de chat entrega la densidad por su compartimento `hooks`, `ChatView` decide con ella si pliega y la pasa como parte de los props del propietario de cada nodo, y `AssistantMarkdown`/`ReasoningRow` la usan para abrir el razonamiento.

## Validación ejecutada

Ejecutada el 2026-11-07 en la rama `change/016-densidad-conversacion`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `DENS-01`, `DENS-02` | Aprobado | `chat-density.client.spec.tsx`: valor por defecto, publicación previa a la escritura, deduplicación y adopción sin reescritura |
| `DENS-03` | Aprobado | `host.client.spec.ts`: la sección declara `chatDensity`, se actualiza y rechaza `cozy` |
| `DENS-04` | Aprobado | `chat-density.client.spec.tsx`: título, descripción, nivel activo y escritura de `Detailed` |
| `DENS-05` | Aprobado | `chat-view.client.spec.tsx`: sin fila de actividad en `balanced` ni en `detailed` |
| `DENS-06` | Aprobado | `reasoning-row.client.spec.tsx`: el razonamiento nace abierto y el lector lo cierra |
| `DENS-07` | Aprobado | `live-activity.client.spec.tsx` sin cambios: la línea no lee la densidad |
| `pnpm run test:gui` | Aprobado | 3815 pruebas aprobadas, 1 omitida |
| `tsc -b tsconfig.client.json` y oxlint del paquete | Aprobado | Sin errores de tipos ni hallazgos de lint |
| Revisión visual de la fila de ajustes y de los tres niveles | Pendiente | Requiere navegador: el entorno del agente no inicia ninguno |

## Resultado y pendientes

- Resultado: los tres niveles existen, se persisten en el documento de ajustes del Host y se aplican en la vista de chat.
- Pendientes o excepciones aceptadas: la revisión visual de la fila y de cada nivel queda pendiente por falta de navegador.
- Decisión de salida: pendiente de la revisión visual antes de fusionar.
