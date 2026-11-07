# SPEC-015 — Conversación compacta

Estado: En implementación
Fase: 15
Commit base: `fdaeb34d10`

## Objetivo

Que un turno largo se lea como una conversación y no como un registro: las respuestas del asistente quedan visibles, el trabajo intermedio se resume en una fila por bloque con las herramientas que se usaron, y lo que el agente está haciendo en este momento se lee en un solo sitio que no se mueve.

## Contexto

Hoy cada evento ocupa una fila propia en el flujo: cada paso de razonamiento es una fila `Think` colapsada ([ReasoningRow.tsx](../../packages/client/ui-conversation/src/client/chat/ReasoningRow.tsx)) y cada llamada de herramienta una fila de una línea ([ToolRow.tsx](../../packages/client/ui-tool/src/client/tool/components/ToolRow.tsx)). Una tarea de treinta pasos produce decenas de filas equivalentes y el flujo las arrastra al seguir el extremo; el único indicador de actividad, `Deep diving...`, también vive dentro del flujo y desaparece al hacer scroll ([ChatView.tsx](../../packages/client/ui-conversation/src/client/chat/ChatView.tsx)).

El host ya publica la presentación de cada llamada ([ToolCallView.title/description](../../packages/core/tools/src/presentation.ts)) y el snapshot de la sesión conserva `runningCalls` y `partial`, de modo que el resumen de la fila de actividad y la línea viva se calculan sin tocar el modelo ni el log. Las superficies de detalle existentes no cambian: expandir la fila, `Inspect` con el panel de detalles, la pestaña `Trajectory` en escritorio y la hoja móvil de [SPEC-012](012-mobile-agent-surfaces.md).

## Alcance

- Agrupar el trabajo intermedio de un turno en una fila de actividad colapsada.
- Nombrar en esa fila las herramientas usadas, no solamente contarlas.
- Añadir una línea viva sobre el composer con la acción actual.
- Retirar el estado `Deep diving...` del flujo.
- El mismo comportamiento en móvil.

## Fuera del alcance

- Preferencia de densidad (Compacta, Equilibrada, Detallada) persistida en los ajustes: queda para una especificación posterior.
- Cambios en las filas de herramienta, en sus tarjetas expandidas o en el panel de detalles.
- Cambios en Trajectory.
- Cambios en el log de sesión, en el protocolo o en lo que ve el modelo.
- Cambios en la política de scroll y de seguimiento del extremo.
- Plegar turnos completos o mensajes del usuario.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CALM-01` | Un turno con razonamiento y herramientas sin prosa intermedia se muestra como una sola fila de actividad colapsada; al expandirla aparecen exactamente las filas de hoy, en su orden y con sus mismas interacciones | Test jsdom de `ChatView` y replay de snapshots |
| `CALM-02` | La fila colapsada nombra las llamadas ejecutadas con el título que publica el host y su recuento por título repetido, el número de bloques de pensamiento y la duración del bloque, y muestra además la última línea del último pensamiento del bloque | Test jsdom sobre un fixture de nodos |
| `CALM-03` | Una llamada fallida no se oculta: la fila colapsada muestra el marcador de error y la primera línea del fallo | Test jsdom |
| `CALM-04` | El razonamiento que acompaña prosa conserva la fila `Think` colapsada con su primera línea; el razonamiento sin prosa solo se cuenta dentro de la fila de actividad | Test jsdom |
| `CALM-05` | Mientras un turno corre, una línea sobre el composer muestra la herramienta en curso con su título y el tiempo transcurrido; sin herramienta en curso muestra el aviso de que el agente sigue trabajando | Test jsdom con `runningCalls` |
| `CALM-06` | La línea viva desaparece al terminar el turno y no queda ningún indicador de actividad dentro del flujo | Test jsdom y `DSH_SNAPSHOT=replay pnpm run test:web` |
| `CALM-07` | Mensajes del usuario, prosa, errores, aprobaciones, preguntas, interrupciones, compactaciones y reintentos nunca se pliegan | Test jsdom sobre un turno mixto |
| `CALM-08` | A 390 px la fila de actividad y la línea viva ocupan una sola línea cada una, se truncan sin desbordar y no alteran la geometría del composer | Revisión en dispositivo |
| `CALM-09` | Seleccionar una llamada desde el panel de detalles abre el bloque que la contiene, de modo que el enlace existente sigue revelando la fila señalada | Test jsdom de la selección externa |

## Restricciones

- Solo presentación: ningún evento nuevo en el log y ninguna lectura nueva del modelo; `Model-visible ⟺ logged` se mantiene.
- La fila de actividad se compone con las sillas de render existentes; `ui-tool` no amplía su API pública.
- Una fila, un hecho: la línea viva es el único hogar de "qué está pasando ahora".
- El anclaje de paginación (`data-chat-anchor-key`) sigue funcionando con bloques plegados.
- `MDL-THEME-01` y `MDL-THEME-02`: tokens semánticos, sin colores literales, y los tres temas legibles.
- `MDL-LOCALE-01`: la copia nueva existe en inglés y chino; un navegador no soportado arranca en inglés.
- `MDL-VALID-01`: lo no ejecutado se registra como pendiente.

## Implementación

En `ui-conversation`: una pasada de agrupación en `ChatView` sobre el orden de nodos, con la regla de nodos de actividad consecutivos del mismo turno; `activity-model.ts` con la derivación pura (clasificación, corte del bloque, resumen y reloj del turno); `ActivityGroup` como fila colapsada que monta los mismos asientos de cada miembro al expandir; `LiveActivity` registrada en `conversation.input.dock` con orden 10; el retiro del estado de actividad del flujo; y la copia nueva en `locales.ts`. `ui-tool` no cambia: los títulos de cada llamada llegan del `ToolCallView` que publica el host. Los README inglés y chino del paquete y la nota de agente acompañan el cambio.

## Validación ejecutada

Ejecutada el 2026-11-07 en la rama `change/015-conversacion-compacta`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `CALM-01`, `CALM-02` y `CALM-04` | Aprobado | `activity-group.client.spec.tsx` (7 pruebas) y `chat-view.client.spec.tsx` verifican el plegado, el resumen con títulos y recuentos, la vista previa del pensamiento y las filas que se muestran al expandir |
| `CALM-03` | Aprobado | `activity-group.client.spec.tsx` y `activity-model.client.spec.ts` cubren la primera línea del fallo y la identidad del error |
| `CALM-05` y `CALM-06` | Aprobado | `live-activity.client.spec.tsx` (5 pruebas) cubre el título de la llamada en curso, el aviso entre llamadas, el reloj desde `turn/start` y la ausencia de la línea cuando no hay turno; el estado en flujo ya no existe |
| `CALM-07` | Aprobado | `activity-model.client.spec.ts` y `activity-group.client.spec.tsx` cubren los nodos que cortan el bloque y la prosa dentro de un bloque |
| `CALM-09` | Aprobado | `activity-group.client.spec.tsx` abre el bloque que contiene la llamada seleccionada |
| `CALM-08` | Pendiente | Requiere un dispositivo: el entorno del agente no inicia un navegador |
| `pnpm run test:gui` | Aprobado | 3807 pruebas aprobadas, 1 omitida |
| `tsc -b tsconfig.client.json` y oxlint del paquete | Aprobado | Sin errores de tipos ni hallazgos de lint |
| `verify-agent-note-format` y `verify-md-wrap` | Aprobado | 544 notas conformes; 1862 archivos con prosa bien envuelta |
| Pruebas de snapshots del navegador | Pendiente | `DSH_SNAPSHOT=replay pnpm run test:web` no se ejecutó: requiere reconstruir el bundle y el entorno no dispone de navegador |

## Resultado y pendientes

- Resultado: implementado; un turno largo se lee como respuestas más una fila por bloque de trabajo, con la acción en curso en una línea fija sobre el composer.
- Pendientes o excepciones aceptadas: la revisión visual a 390 px y la prueba de snapshots del navegador quedan pendientes por falta de navegador en el entorno.
- Decisión de salida: pendiente de la revisión visual antes de fusionar.
