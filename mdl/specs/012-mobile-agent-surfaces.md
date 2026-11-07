# SPEC-012 — Operar el agente desde el teléfono

Estado: En implementación
Fase: 12
Commit base: `a307029372`
Aprobación: usuario en sesión Web, `aprobado el spec`

## Objetivo

Cerrar el bucle de trabajo desde un teléfono: abrir el detalle de una llamada de herramienta y responder las aprobaciones y preguntas del agente, sin volver al escritorio para hacerlo.

## Contexto

La Fase 9 dejó el teléfono con una sola superficie: la conversación, con el drawer para sesiones y proyectos. Quedaron fuera las tres superficies con las que se opera al agente. Hoy el detalle es inalcanzable —`openDetails()` se rechaza en la fase móvil y la columna mide cero—, y las tarjetas de aprobación y pregunta llegan como relevo del composer con geometría pensada para puntero: acciones de 36 px alineadas a la derecha, tope de 336 px y ningún tratamiento del viewport dinámico.

## Alcance

- Detalle de una llamada en móvil como hoja a pantalla completa, con cierre propio y sin desplazar la conversación.
- El detalle sigue siendo la misma columna del escritorio: se reutiliza el panel, no se duplica.
- Tarjeta de aprobación usable al tacto: acciones a ancho completo, alto mínimo de 36 px, tope atado al viewport visible y hueco para el indicador de inicio.
- Preguntas del agente con la misma treatment: opciones de 40 px, acción principal a ancho completo y tope contra el viewport.
- Pruebas de comportamiento para la hoja y para los dos paneles.

## Fuera del alcance

- Ajustes a pantalla completa y el bloque contenedor que rompe los paneles fijos: Fase 13.
- Trajectory en el teléfono; sigue sin ofrecerse.
- Gestos de deslizamiento para cerrar la hoja.
- Cambios en el escritorio: el comportamiento de las tres superficies por encima del breakpoint no cambia.
- El panel de detalles de una sesión de subagente o cualquier superficie nueva que no exista hoy.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `AGENT-01` | En móvil, abrir el detalle desde una tarjeta de herramienta muestra una hoja a pantalla completa con el título de la llamada y su contenido | Test jsdom de la geometría declarada y e2e móvil si el entorno lo permite |
| `AGENT-02` | El botón de cerrar de la hoja mide al menos 36 px y la cierra; el detalle queda inalcanzable de nuevo | Test jsdom y e2e móvil |
| `AGENT-03` | La hoja cubre el viewport, hace scroll interno y no desplaza la conversación de debajo | e2e móvil con viewport 390×844 |
| `AGENT-04` | Cambiar de sesión con la hoja abierta la cierra | Test jsdom sobre el cambio de sesión actual |
| `AGENT-05` | La tarjeta de aprobación lleva sus acciones a ancho completo, con 36 px de alto mínimo, y el cuerpo hace scroll dentro de un tope que nunca excede el área visible | Test jsdom de la tarjeta y e2e móvil de geometría |
| `AGENT-06` | Las preguntas del agente ofrecen opciones de 40 px y una acción principal a ancho completo, y la tarjeta no excede el viewport visible con el teclado abierto | e2e móvil de geometría y estilo computado |
| `AGENT-07` | Por encima de 768 px las tres superficies conservan su comportamiento actual | `DSH_SNAPSHOT=replay pnpm run test:web` y pruebas existentes |

## Restricciones

- El detalle reutiliza `DetailsPanel` y su propietario de slot; no se crea un panel paralelo ni se duplica el contrato.
- El estado de la hoja sigue siendo `ctx.layout.openDetails`/`closeDetails`, la misma cara que ya consumen las tarjetas de herramienta; no se añade estado propio en la conversación.
- `MDL-THEME-01` y `MDL-THEME-02`: tokens semánticos, sin colores literales, y los tres temas siguen legibles.
- `MDL-VALID-01`: lo no ejecutado se registra como pendiente.
- El breakpoint sigue siendo uno solo, 767 px, documentado en [docs/web-styling.md](../../docs/web-styling.md).

## Implementación prevista

`ui-layout` vuelve a permitir abrir el detalle en la fase móvil y da a la columna de detalles la geometría de hoja cuando hay una sesión con detalle seleccionado; el cierre sigue viniendo del propio panel. `ui-conversation` agranda el cierre del panel y adapta la tarjeta de aprobación. `ui-user-questions` hace lo propio con la pregunta y la revisión de plan. La documentación del sistema de estilos y los README de los paquetes tocados se actualizan en el mismo cambio, con su nota de agente.

## Validación ejecutada

Ejecutada el 2026-11-07 en la rama `change/012-mobile-agent-surfaces`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `AGENT-01` (mecanismo) | Aprobado | `openDetails()` en la fase móvil escribe la preferencia de ancho y `AppFrame` publica `data-details-open`; el `grid` sigue en una columna (`minmax(0, 1fr) 0px 0px`) |
| `AGENT-02` (cierre) | Aprobado en jsdom | `closeDetails()` retira `data-details-open`; el cierre del panel crece a 36 px en el breakpoint |
| `AGENT-04` | Aprobado | Cambiar de sesión con la hoja abierta la cierra: escenario nuevo en `app-frame.client.spec.tsx` |
| `AGENT-05` y `AGENT-06` (estilos) | Aprobado | Reglas de 767 px: acciones de la aprobación en columna a ancho completo y tope `min(50dvh, …)`; pregunta y revisión de plan a `min(60dvh, 520px)` con pie que refluye |
| `AGENT-03`, `AGENT-05` y `AGENT-06` (geometría real) | Pendiente | Requieren navegador y dispositivo: el entorno del agente no arranca Chromium |
| `AGENT-07` | Parcial | `npm run test:gui` verde (3773 pruebas); el replay de snapshots no se ejecutó por la misma causa |
| `npm run typecheck`, oxlint, `verify-md-wrap` | Aprobados | Sin errores en las dos caras, 0 hallazgos de lint y 1860 archivos con prosa bien envuelta |

## Resultado y pendientes

- Resultado: implementado y verificado por pruebas unitarias y de tipos; la comprobación en dispositivo queda pendiente.
- Pendientes o excepciones aceptadas: ninguno por defecto.
- Decisión de salida: pendiente de la validación en teléfono antes de fusionar.
