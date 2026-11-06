# SPEC-002 — Nombre, colores e icono de MDL-HARNESS

Estado: En implementación
Fase: 2
Commit base: `2ec6d44ca4ee906483745a7ca8d3335ab9d5e013`
Aprobación de la especificación: usuario, antes de crear la rama `change/002-branding`

## Objetivo

Presentar la identidad visible `MDL-HARNESS`, una paleta roja y grafito en los temas claro y oscuro y un icono de instalación propio, sin alterar la estructura ni la compatibilidad interna con DSH.

## Contexto

La Fase 1 está validada en [001-base.md](001-base.md). La personalización debe concentrarse en los puntos de identidad y en los tokens de tema para reducir conflictos con futuras integraciones de upstream.

## Alcance

- Sustituir el nombre visible por `MDL-HARNESS` en títulos, manifest, marca escrita y textos de identidad de la aplicación.
- Sustituir la marca gráfica escrita de la barra lateral por texto `MDL-HARNESS`, conservando los iconos internos.
- Generar el icono de instalación desde `mdl/assets/min.jpg` en 32, 180, 192 y 512 px, más una variante maskable.
- Aplicar el rojo `#D40000` como color principal de marca y acento.
- Aplicar grises neutros y grafito mediante los tokens de `ui-theme`.
- Mantener operativos los temas claro, oscuro y sistema.
- Iniciar en inglés cuando no exista preferencia guardada y el navegador no solicite un idioma soportado.
- Mantener chino disponible para navegadores `zh` y para selección manual.
- Actualizar pruebas y snapshots existentes afectados.

## Fuera del alcance

- Icono de pez y demás iconos internos; el icono de instalación sí forma parte de este alcance.
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
| `ICON-01` | Favicon, Apple Touch e iconos 192/512 usan el arte derivado de `min.jpg` y tienen las dimensiones declaradas | Test de assets PNG y revisión visual |
| `ICON-02` | El manifest declara iconos normales y maskable; el favicon anterior ya no se referencia | Test del manifest y búsqueda de referencias |
| `ICON-03` | Los assets PNG se sirven como `image/png` | Test HTTP del servidor de frontend |
| `THEME-01` | `#D40000` se define como token de marca y se reutiliza en acentos aprobados | Tests o revisión de tokens y capturas |
| `THEME-02` | El tema oscuro usa superficies grafito y el claro usa grises legibles | Revisión visual en ambos temas |
| `THEME-03` | Focus, selección, botones y estados interactivos son visibles; el rojo de marca no ambigúa errores o acciones destructivas | Checklist visual y contraste |
| `THEME-04` | El modo sistema sigue alternando correctamente entre claro y oscuro | Tests de tema y validación manual |
| `LOCALE-01` | Sin preferencia guardada, un navegador no soportado inicia en inglés | Tests de locale y validación con navegador español |
| `LOCALE-02` | Un navegador chino continúa iniciando en chino y la selección manual de idioma permanece operativa | Tests de locale y configuración |
| `LOCALE-03` | El atributo `lang` del documento refleja el idioma activo (`en` o `zh-CN`) | Test de locale y validación en navegador |
| `COMPAT-01` | Se conservan `MDL-IDENT-02`, `MDL-LOCALE-01`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01` y `MDL-SEC-01` | Revisión del diff y validaciones asociadas |

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
- `apps/web/public/` para favicon, Apple Touch, iconos PWA y variante maskable.
- `mdl/assets/min.jpg` como fuente reproducible y `mdl/assets/app-icon-1024.png` como alta resolución.
- `packages/host/frontend-static/src/index.ts` para el MIME `image/png`.
- El componente propietario del título en `packages/client/web`.
- `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` y sus pruebas para la marca escrita.
- `packages/client/ui-theme/src/styles/` para los tokens compartidos.
- `packages/client/locale/src/client/index.ts` para el idioma inicial por defecto.
- Otros componentes únicamente cuando una referencia visible al nombre no pueda resolverse desde los puntos anteriores.

No se editarán artefactos `dist/` o `lib/` manualmente; se generarán mediante el build.

## Plan de validación

### Automática

- Ejecutar los tests de título de `packages/client/web`.
- Ejecutar los tests y snapshots de `packages/client/ui-sidebar`.
- Ejecutar los tests de `packages/client/ui-theme`.
- Ejecutar los tests de `packages/client/locale`.
- Ejecutar el test de iconos de `ui-primitives` como comprobación de no regresión de `FishLogo` e iconos internos.
- Ejecutar el test de manifest, dimensiones PNG y MIME de `image/png`.
- Ejecutar `corepack pnpm run build` después de los cambios.
- Revisar que los identificadores internos permanezcan intactos y que solo cambie el icono de instalación.

### Manual

Ejecutar el fork en un puerto loopback distinto de `3080`, con un perfil de prueba aislado. Confirmar que un navegador `es-CL` sin preferencia abre en inglés. Revisar en claro, oscuro y sistema:

- Barra lateral expandida y contraída.
- Título inicial y título de sesión.
- Conversación, composer y onboarding.
- Botones, menús, selectores, tooltips y foco de teclado.
- Configuración, diálogos, carga, conexión y error.
- Bloques de código y resultados de herramientas.
- Contraste y diferenciación entre marca, errores y acciones destructivas.
- Favicon y assets de instalación servidos con sus dimensiones y tipo de contenido correctos.

Registrar capturas como evidencia de revisión sin incorporar credenciales, sesiones personales o datos sensibles.

## Validación ejecutada

Fecha: `2026-11-06T14:42:55-0300`
Entorno: macOS 15.7.7, arm64; Chromium Playwright `149.0.7827.55`

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Pruebas dirigidas de identidad y paleta | 4 archivos, 86 pruebas aprobadas | Título, manifest, onboarding, iconos y tokens |
| Pruebas de idioma | 19 pruebas aprobadas | Español/no soportado → inglés; chino manual; `lang` sincronizado |
| Suite GUI | 273 archivos, 3.762 pruebas aprobadas, 1 omitida | `corepack pnpm run test:gui`, código 0 |
| Snapshot de sidebar | 2 snapshots actualizados intencionalmente | Solo cambió el SVG por texto `MDL-HARNESS` |
| Build completo | Código 0 | Host, Client, bundles y frontend Web |
| Suite Web final | 253 pruebas aprobadas, 15 omitidas, 0 fallidas | `DSH_SNAPSHOT=replay corepack pnpm run test:web`, código 0 |
| Validación posterior de `lang` | 10 pruebas Web dirigidas aprobadas | Manifest e idioma persistente; build final código 0 |
| Iconos y MIME | 2 pruebas PWA y 1 prueba HTTP aprobadas | Dimensiones PNG, manifest y `image/png` |
| Assets servidos | 5 de 5 respuestas HTTP 200 con `image/png` | Favicon, Apple Touch, 192, 512 y maskable |
| Verificación en navegador español | Aprobada | `htmlLang=en`, UI inglesa, sin texto chino, sin nombre anterior, 0 errores |
| Tokens computados | Aprobados | Claro `rgb(212, 0, 0)` / `rgb(244, 244, 245)`; oscuro `rgb(255, 99, 99)` / `rgb(17, 17, 19)` |
| Contrastes AA | Aprobados | 5,53:1; 16,12:1; 6,09:1; 9,69:1 |
| Documentación | 28 comprobaciones aprobadas | `corepack pnpm run doc-sync`, código 0 |
| Pares bilingües | 936 pares consistentes | `verify-translation-pairing` |
| Diff, iconos y secretos | Aprobados | Icono de instalación actualizado dentro del alcance; `FishLogo` e iconos internos intactos; sin secretos |

La primera ejecución Web encontró fallos de entorno —Chromium no instalado y sandbox anidado— y diferencias en dos expectativas de color y un golden de onboarding con el nombre anterior. Tras instalar el navegador, corregir únicamente esas expectativas y regenerar el snapshot intencional de sidebar, las tres áreas afectadas pasaron 22 pruebas y la suite Web completa terminó con código 0.

### Evidencia visual

La instancia aislada quedó disponible durante la revisión en `http://127.0.0.1:3081`. Capturas locales:

- `/tmp/mdl-harness-visual/spanish-final-light.png`
- `/tmp/mdl-harness-visual/spanish-final-dark.png`
- `/tmp/mdl-harness-visual/verified-collapsed-dark.png`
- `/tmp/mdl-harness-visual/onboarding-light.png`

Assets de icono revisados:

- `mdl/assets/app-icon-1024.png`
- `apps/web/public/favicon-32.png`
- `apps/web/public/apple-touch-icon.png`
- `apps/web/public/icon-192.png`
- `apps/web/public/icon-512.png`
- `apps/web/public/icon-maskable-512.png`

La revisión automática y del agente no encontró máscaras residuales, texto ilegible ni errores de consola. La aprobación visual final corresponde al usuario.

## Resultado y pendientes

- Resultado: desarrollo y validaciones técnicas completados; pendiente de aprobación visual.
- Pendientes: aprobación visual del usuario sobre las capturas y la instancia aislada.
- Decisión de salida: pendiente de aprobación visual; después se marcará como **Validada**.
