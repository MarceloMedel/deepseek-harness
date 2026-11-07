# SPEC-014 — Instalar la interfaz en la pantalla de inicio del iPhone

Estado: En implementación
Fase: 14
Commit base: `8b04da218b`
Aprobación: usuario en sesión Web, petición «how can we convert this app into a iOS installable web app? … I need to have it as an icon in my iPhone», con `https://dsh.devmedel.com` como origen del icono. La etiqueta `NIM` la aprobó el mismo usuario en la petición «how can i change the name of icon to “NIM”?».

## Objetivo

Que MDL-HARNESS se instale en el iPhone como una aplicación de la pantalla de inicio: un icono con el arte del producto, con la etiqueta `NIM`, que abre la conversación a pantalla completa, sin la barra de Safari, alcanzable desde cualquier red.

## Contexto

`dsh web` ya sirve un manifest instalable y los iconos ([SPEC-009](009-mobile-shell.md), `MOB-09`): `display: standalone`, `theme_color`, iconos de 192 y 512 px, `apple-touch-icon` de 180 px, `viewport-fit=cover` y el shell con `100dvh`. iOS no lee ese manifest igual que Chromium: el nombre bajo el icono, el modo sin barra del navegador y el estilo de la barra de estado salen de las etiquetas `apple-mobile-web-app-*` del HTML, y el único origen alcanzable desde el teléfono es el hostname público con Cloudflare Access ([VPS_HANDOFF.md](../VPS_HANDOFF.md#acceso-remoto)). La prueba [pwa-manifest.e2e.ts](../../apps/web/tests/pwa-manifest.e2e.ts) quedó desactualizada cuando SPEC-009 cambió `display` de `fullscreen` a `standalone`: esperaba el manifest anterior y no cubría ninguna etiqueta de iOS.

## Alcance

- Etiquetas `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` y `apple-mobile-web-app-status-bar-style` en [index.html](../../apps/web/index.html).
- Icono de 180 px declarado también en el manifest, además de la etiqueta `apple-touch-icon` existente.
- Etiqueta de instalación `NIM` en el manifest (`name`, `short_name`) y en `apple-mobile-web-app-title`.
- Prueba del artefacto construido que fija el manifest completo, las etiquetas de iOS y las dimensiones de los PNG.
- Instrucciones de instalación, origen y sesión de Access en [VPS_HANDOFF.md](../VPS_HANDOFF.md).

## Fuera del alcance

- Service worker, caché e interfaz sin conexión: sin servidor no hay conversación, y la instalación en iOS no los requiere.
- Imágenes de arranque (`apple-touch-startup-image`) y variantes por tamaño de dispositivo.
- Barra de estado translúcida con el contenido debajo: exige que el header de la conversación reserve `env(safe-area-inset-top)`, que hoy no reserva.
- Publicación en la App Store, notificaciones push, insignias, `shortcuts` y `orientation` del manifest.
- Cambios en Cloudflare Access, el tunnel o el Caddy del gateway: la duración de la sesión de Access se ajusta en el panel de Zero Trust, no en este repositorio.
- Diseño, composición o comportamiento de la interfaz: este cambio solo agrega metadatos de instalación.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `IOS-01` | El HTML servido declara `apple-mobile-web-app-capable=yes` y `mobile-web-app-capable=yes` | Prueba sobre `dist/index.html` |
| `IOS-02` | El nombre bajo el icono es `NIM` en la etiqueta y en el manifest, independiente del `<title>` | Prueba sobre `dist/index.html` y `dist/manifest.webmanifest` |
| `IOS-03` | La barra de estado usa el estilo `default`, de modo que la página empieza debajo de ella | Prueba sobre `dist/index.html` |
| `IOS-04` | El manifest declara `standalone`, `theme_color`, `background_color` y un icono de 180 px; cada PNG existe con las dimensiones declaradas | Prueba sobre `dist/` |
| `IOS-05` | El teléfono instala la app desde el hostname público y abre la conversación sin la barra de Safari | Validación manual en el iPhone |

## Restricciones

- `MDL-IDENT-01`, `MDL-IDENT-03`: el icono instalado es el arte del producto. Excepción aprobada a `MDL-IDENT-01`: la etiqueta de la pantalla de inicio es `NIM`; el nombre visible dentro del producto —`<title>` y el wordmark— sigue siendo `MDL-HARNESS`.
- `MDL-THEME-01`, `MDL-THEME-02`: `theme_color` sigue siendo `#D40000`, y los temas claro, oscuro y sistema siguen funcionando en la app instalada.
- `MDL-SEC-02`: no se abre ningún puerto ni se relaja un control de red; el acceso sigue pasando por Cloudflare Access y el plano privilegiado sigue respondiendo solo por loopback.
- `MDL-UPSTREAM-01`: el cambio es aditivo —cuatro etiquetas `meta`, una entrada de icono y una prueba— sobre archivos compartidos con upstream.
- `MDL-VALID-01`: la comprobación en dispositivo se registra como pendiente si no se ejecuta.

## Implementación prevista

`apps/web/index.html` (etiquetas), `apps/web/public/manifest.webmanifest` (icono de 180 px), `apps/web/tests/pwa-manifest.e2e.ts` (prueba del artefacto) y la documentación de operación en `mdl/`.

## Validación ejecutada

Fecha: 2026-11-07. Entorno: checkout local, Node 22, sin navegadores de Playwright instalados.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Build de librerías y del frontend Web | Aprobado | `npm run build` compiló `build:lib` (host y cliente); el `build:web` filtrado por `npm` no encontró `pnpm` en el PATH de este entorno, así que el frontend se construyó con `./node_modules/.bin/vite build` en `apps/web`, que emite los mismos assets que sirve la GUI viva (`index-CRmSFs4W.js`) |
| Prueba del artefacto de instalación | Aprobada | `npx vitest run --config vitest.web.config.ts apps/web/tests/pwa-manifest.e2e.ts`: 3 de 3. Antes del cambio esa prueba fallaba porque esperaba el manifest anterior a SPEC-009 |
| HTML y manifest servidos por `dsh web` | Aprobado | `dsh web --port 3099` en un `DSH_HOME` temporal y `curl`: las cuatro etiquetas `meta` en la respuesta y el manifest con el icono de 180 px, `content-type: application/manifest+json` |
| Iconos servidos con su tipo | Aprobado | `curl -o /dev/null`: `apple-touch-icon.png` 200 `image/png`, `icon-192.png` 200 `image/png`, `favicon-32.png` 200 `image/png` |
| `IOS-02`: etiqueta `NIM` servida | Aprobado | Frontend reconstruido y `dsh web --port 3099` en un `DSH_HOME` temporal: `apple-mobile-web-app-title` vale `NIM` y el manifest sirve `name`/`short_name` `NIM` con `<title>` intacto |
| `IOS-05`: instalación en el iPhone | Parcial | El usuario confirmó la instalación y el funcionamiento con la etiqueta anterior; la etiqueta `NIM` requiere borrar el icono y volver a añadirlo, todavía no verificado |
| Prueba de navegador sobre el shell | Pendiente | Este entorno no tiene navegadores de Playwright; `pnpm run test:web` no se ejecutó |

## Resultado y pendientes

- Resultado: el shell declara las etiquetas de instalación de iOS, el manifest declara el icono de 180 px y la app se instala y funciona desde `dsh.devmedel.com` con la etiqueta `NIM`; la prueba del artefacto fija las tres cosas.
- Pendientes o excepciones aceptadas: falta reinstalar el icono en el iPhone para ver la etiqueta nueva; `pnpm run test:web` sin ejecutar por falta de navegadores; el hostname público solo sirve el cambio después de reconstruir y recrear el contenedor.
- Decisión de salida: pendiente hasta la validación en dispositivo; estado de la especificación `En implementación`.
