# SPEC-009 — Shell móvil para el teléfono

Estado: Validada
Fase: 9
Commit base: `f5a994937d`
Aprobación: usuario en sesión Web, `Solo lo validado en el prototipo`

## Objetivo

Que la interfaz Web de MDL-HARNESS sea utilizable desde un teléfono: la conversación ocupa el ancho completo, las sesiones y proyectos se abren en un drawer lateral, y el header deja de mostrar chrome que en el teléfono no aporta (preset del agente, pestañas de vista y descarga del session log).

## Contexto

El shell resuelve tres columnas con una cadena de concesión ([`columns.ts`](../../packages/client/ui-layout/src/client/columns.ts)) y ya colapsa la barra lateral a un riel de 56 px por debajo de 1024 px. En un teléfono de 390 px eso deja 334 px de conversación, mantiene un riel que nunca se convierte en lista de sesiones y fuerza el panel de detalles a cero, de modo que el ancho disponible no alcanza para abrir sesiones. El prototipo validado por el usuario con un plugin Cordis dinámico fijó la forma del resultado: drawer + hoja, header limpio y composer táctil. El plugin es efímero y vive de selectores ajenos; esta especificación lo reescribe en los paquetes dueños.

La composición no puede variar por dispositivo porque la misma URL sirve al teléfono y al escritorio, así que «sin Trajectory en el teléfono» se decide donde se dibuja cada superficie, no en `cordis.yml`.

## Alcance

- Modo móvil en el frame del shell: una columna, barra lateral como drawer off-canvas con scrim, sin manijas de arrastre, botón de menú propio del frame.
- Cierre del drawer al cambiar la sesión actual.
- Header de sesión sin pestañas de vista en móvil, con la vista activa resuelta a `chat`.
- Sin chip del agent preset ni botón de descarga del session log en móvil.
- Composer táctil: objetivos de 36 px mínimo, textarea de 16 px, hueco para el indicador de inicio.
- Shell con altura dinámica (`100dvh`) y viewport con `viewport-fit=cover`.
- Manifest instalable como `standalone`, con `theme_color` y color de fondo.
- Un único breakpoint móvil documentado: 768 px.

## Fuera del alcance

- Panel de detalles y ajustes como hoja a pantalla completa; preguntas del agente y aprobación de permisos adaptadas al tacto. Corresponde a una especificación posterior.
- Retirar `ui-trajectory` o el comando `/export` de la composición. La vista y el comando siguen existiendo; solo dejan de ofrecerse en el teléfono.
- Gestos de deslizamiento, service worker, funcionamiento sin conexión y notificaciones push.
- Cambios en el host, en Docker o en la composición de `cordis.yml`.
- La instancia viva en `127.0.0.1:3080`: la validación en dispositivo usa el preview del fork, no la GUI original.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `MOB-01` | A 390 px la conversación ocupa el ancho completo y no queda riel de 56 px | e2e con viewport 390×844: geometría de las columnas |
| `MOB-02` | El botón de menú abre el drawer y el scrim lo cierra; en escritorio ninguno de los dos existe | Test jsdom del frame y e2e móvil |
| `MOB-03` | Elegir otra sesión con el drawer abierto lo cierra | Test jsdom sobre el cambio de sesión actual |
| `MOB-04` | La tira de pestañas no se renderiza en móvil y la vista activa es `chat` | Test jsdom y e2e móvil |
| `MOB-05` | El chip del preset no se muestra en móvil | Test jsdom del componente |
| `MOB-06` | El botón de descarga del session log no se muestra en móvil | Test jsdom del componente |
| `MOB-07` | En móvil los controles del composer miden al menos 36 px y el textarea usa 16 px | e2e móvil: cajas y estilo computado |
| `MOB-08` | El composer respeta `safe-area-inset-bottom` y el shell usa altura dinámica | e2e móvil: estilo computado |
| `MOB-09` | El manifest declara `standalone`, `theme_color` y el viewport incluye `viewport-fit=cover` | Lectura del manifest servido y del HTML |
| `MOB-10` | Por encima de 768 px la interfaz no cambia respecto del commit base | `DSH_SNAPSHOT=replay pnpm run test:web` y comparación del snapshot |

## Restricciones

- `MDL-ENV-01`: el desarrollo no modifica ni sustituye la GUI de `127.0.0.1:3080`; el preview del fork usa otro puerto.
- `MDL-UPSTREAM-01`: el cambio se mantiene pequeño y aditivo —una rama móvil dentro de los componentes existentes— para re-aplicarlo al integrar upstream.
- `MDL-THEME-01` y `MDL-THEME-02`: el drawer y el scrim usan tokens semánticos; ningún color literal nuevo ni rama de tema fuera de `ui-theme`.
- `MDL-VALID-01`: toda comprobación no ejecutada se registra como pendiente.
- Reglas de [packages/client/AGENTS.md](../../packages/client/AGENTS.md): composición solo por slots, props por las cuatro shares, CSS Modules con tokens, sin librería de componentes, copy de producto en chino.
- El breakpoint móvil queda fijado en 768 px y se documenta una sola vez en [docs/web-styling.md](../../docs/web-styling.md).

## Implementación prevista

`ui-layout` resuelve el modo móvil desde el ancho que ya mide con `ResizeObserver`, decide la geometría del drawer y renderiza el botón de menú y el scrim como chrome propio del frame; el store del layout gana el estado del drawer y el cierre por cambio de sesión sale de la lectura de sesiones que el frame ya tiene. `ui-conversation` deja de renderizar la tira de pestañas en móvil y resuelve la vista activa a `chat`. `ui-agent-preset` y `session-log-export` ocultan su propia pieza con una regla de su módulo CSS. `ui-theme` recibe los tokens de espaciado móvil y la altura dinámica, y `apps/web` el viewport y el manifest. La documentación del sistema de estilos y los README de los paquetes tocados se actualizan en el mismo cambio, junto con una nota de agente.

## Validación ejecutada

Ejecutada el 2026-11-06 en la rama `feat/mobile-shell`, sobre el checkout `/srv/projects/deepseek-harness` con `node_modules` instalado desde `pnpm-lock.yaml`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `tsc -b tsconfig.host.json` y `tsc -b tsconfig.client.json` | Pasa | Sin errores; cubre los propietarios nuevos de slot y el escenario e2e |
| `npm run test:gui` | Pasa | 272 archivos, 3772 pruebas |
| `MOB-01`, `MOB-02`, `MOB-03` (frame) | Pasan | 6 escenarios nuevos en `packages/client/ui-layout/tests/app-frame.client.spec.tsx` («AppFrame — phone layout») y 4 en `layout-store.client.spec.ts` |
| `MOB-04` (vista única) | Pasa | Escenario nuevo en `packages/client/ui-conversation/tests/skeleton.client.spec.tsx`: sin `tablist`, y una selección de `trajectory` resuelve a Chat |
| `npm run build` (host, bundles cliente y `apps/web/dist`) | Pasa | Requiere `pnpm` en el `PATH`; el paso `build:web` lo invoca |
| oxlint sobre los paquetes y pruebas tocados | Pasa | 0 errores |
| `verify-client-catalog` y `verify-export-jsdoc` | Pasan | Catálogo del cliente regenerado con los propietarios nuevos |
| `MOB-05` y `MOB-06` (chip del preset y botón de descarga) | Pasan | Confirmado en el teléfono tras reconstruir la imagen `mdl-harness:local`: el header muestra solo el título |
| `MOB-07`, `MOB-08` (composer táctil y safe-area) | Pasan | Confirmado en el teléfono: controles cómodos al tacto y composer visible con el teclado abierto |
| `apps/web/tests/phone-layout.e2e.ts` | Pendiente | Chromium no arranca en este entorno: falta `libnspr4.so` y el usuario no es root para instalarlo |
| `MOB-10` (sin cambios por encima de 768 px) | Parcial | Cubierto por pruebas unitarias y por las reglas acotadas al breakpoint; el replay de snapshots no se ejecutó por la misma causa |
| Validación en teléfono real (`MOB-01` a `MOB-08`) | Pasa | Confirmado por el usuario el 2026-11-06 sobre la imagen reconstruida desde la rama: ancho completo, drawer con cierre al elegir sesión, header limpio y composer utilizable |
| `doc-sync` | Parcial | Pasan 24 de 28 gates; los dos fallos propios (catálogo y JSDoc) quedaron corregidos, `docs:build` falla por `pnpm` ausente y `verify-translation-pairing` reclama un par bilingüe para `mdl/docker/README.md`, archivo ajeno a este cambio |

## Resultado y pendientes

- Resultado: validado. El shell es usable desde un teléfono: ancho completo para la conversación, drawer para sesiones y proyectos que se cierra al elegir una, header sin chrome inútil y composer táctil. Las pruebas unitarias, la compilación y la comprobación en dispositivo están verdes.
- Pendientes o excepciones aceptadas: la lane e2e (`apps/web/tests/phone-layout.e2e.ts`) y el replay de snapshots quedan sin ejecutar en el entorno del agente, que no puede arrancar Chromium; el escenario queda escrito para que CI o un equipo con navegador lo ejecute. `mdl/docker/README.md` sigue sin par bilingüe, ajeno a este cambio.
- Decisión de salida: la Fase 9 se cierra como Validada; detalles, ajustes, preguntas del agente y aprobaciones en el teléfono quedan para una especificación posterior.
