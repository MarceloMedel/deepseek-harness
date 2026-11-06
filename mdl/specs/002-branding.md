# SPEC-002 — Nombre y colores de MDL-HARNESS

Estado: Borrador
Fase: 2
Commit base: se registra al aprobar

## Objetivo

Presentar la identidad visible `MDL-HARNESS` y una paleta roja y grafito en los temas claro y oscuro, sin alterar iconos, estructura ni compatibilidad interna con DSH.

## Contexto

La Fase 1 está validada en [001-base.md](001-base.md). La personalización debe concentrarse en los puntos de identidad y en los tokens de tema para reducir conflictos con futuras integraciones de upstream.

## Alcance

- Sustituir el nombre visible por `MDL-HARNESS` en títulos, manifest, marca escrita y textos de identidad de la aplicación.
- Sustituir la marca gráfica escrita de la barra lateral por texto `MDL-HARNESS`, conservando los iconos.
- Aplicar el rojo `#D40000` como color principal de marca y acento.
- Aplicar grises neutros y grafito mediante los tokens de `ui-theme`.
- Mantener operativos los temas claro, oscuro y sistema.
- Actualizar pruebas y snapshots existentes afectados.

## Fuera del alcance

- Favicon, icono de pez y demás iconos.
- Cambios de layout, navegación, tipografía o componentes no relacionados con la identidad.
- Renombrado de paquetes, CLI, variables, API, claves internas o directorios upstream.
- Cambios en licencias, copyright o atribuciones.
- Docker, autenticación, red, credenciales, persistencia y sincronización de upstream.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `BRAND-01` | El título inicial y el sufijo de títulos de sesión usan `MDL-HARNESS` | Tests de título y revisión manual |
| `BRAND-02` | `name` y `short_name` del manifest usan `MDL-HARNESS` | Revisión del archivo generado |
| `BRAND-03` | La barra lateral expandida muestra el texto `MDL-HARNESS`; la contraída conserva su icono | Tests y snapshot de sidebar |
| `BRAND-04` | Carga, conexión, error y onboarding no presentan otro nombre de producto visible | Búsqueda de fuentes y revisión manual |
| `BRAND-05` | Las referencias internas, legales y de upstream no se sustituyen indiscriminadamente | Revisión del diff |
| `THEME-01` | `#D40000` se define como token de marca y se reutiliza en acentos aprobados | Tests o revisión de tokens y capturas |
| `THEME-02` | El tema oscuro usa superficies grafito y el claro usa grises legibles | Revisión visual en ambos temas |
| `THEME-03` | Focus, selección, botones y estados interactivos son visibles; el rojo de marca no ambigúa errores o acciones destructivas | Checklist visual y contraste |
| `THEME-04` | El modo sistema sigue alternando correctamente entre claro y oscuro | Tests de tema y validación manual |
| `COMPAT-01` | Se conservan `MDL-IDENT-02`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01` y `MDL-SEC-01` | Revisión del diff y validaciones asociadas |

## Paleta inicial aprobada para diseño

- Marca: `#D40000`.
- Fondo oscuro base propuesto: `#111113`.
- Superficies oscuras propuestas: `#18181B` y `#232327`.
- Texto oscuro principal propuesto: `#F4F4F5`.
- Fondo claro base propuesto: `#F4F4F5`.
- Superficie clara propuesta: `#FFFFFF`.
- Texto claro principal propuesto: `#18181B`.

Los valores de superficie se pueden ajustar dentro de la misma escala de grises si la revisión demuestra un problema de contraste o jerarquía. Cualquier variante del rojo principal debe quedar registrada en esta especificación antes de cerrarla.

## Implementación prevista

- `apps/web/index.html` y `apps/web/public/manifest.webmanifest` para metadatos visibles.
- El componente propietario del título en `packages/client/web`.
- `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` y sus pruebas para la marca escrita.
- `packages/client/ui-theme/src/styles/` para los tokens compartidos.
- Otros componentes únicamente cuando una referencia visible al nombre no pueda resolverse desde los puntos anteriores.

No se editarán artefactos `dist/` o `lib/` manualmente; se generarán mediante el build.

## Plan de validación

### Automática

- Ejecutar los tests de título de `packages/client/web`.
- Ejecutar los tests y snapshots de `packages/client/ui-sidebar`.
- Ejecutar los tests de `packages/client/ui-theme`.
- Ejecutar el test de iconos de `ui-primitives` como comprobación de no regresión.
- Ejecutar `corepack pnpm run build` después de los cambios.
- Revisar que los identificadores internos permanezcan intactos y que no se modifiquen iconos.

### Manual

Ejecutar el fork en un puerto loopback distinto de `3080`, con un perfil de prueba aislado. Revisar en claro, oscuro y sistema:

- Barra lateral expandida y contraída.
- Título inicial y título de sesión.
- Conversación, composer y onboarding.
- Botones, menús, selectores, tooltips y foco de teclado.
- Configuración, diálogos, carga, conexión y error.
- Bloques de código y resultados de herramientas.
- Contraste y diferenciación entre marca, errores y acciones destructivas.

Registrar capturas como evidencia de revisión sin incorporar credenciales, sesiones personales o datos sensibles.

## Validación ejecutada

No se ha ejecutado. Esta especificación está en Borrador y no autoriza implementación.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Tests y snapshots | Pendiente | Pendiente |
| Build completo | Pendiente | Pendiente |
| Revisión visual claro/oscuro/sistema | Pendiente | Pendiente |
| Revisión del diff, iconos y secretos | Pendiente | Pendiente |

## Resultado y pendientes

- Resultado: pendiente de aprobación de la especificación.
- Pendientes: confirmar que el alcance y la paleta propuesta son los que se implementarán.
- Decisión de salida: requiere pruebas técnicas exitosas y aprobación visual del usuario.
