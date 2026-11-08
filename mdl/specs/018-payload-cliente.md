# SPEC-018 — Payload del cliente web y móvil

Estado: En implementación
Fase: 18
Aprobación para iniciar: usuario, 2026-11-07 — tres especificaciones independientes en orden 017 → 018 → 019
Commit base: `ac1643ba89`

## Objetivo

Reducir lo que el teléfono descarga en cada carga a menos de 400 KB en la primera visita y a menos de 700 KB de bundles de plugins, con caché que evite repetir descargas ya hechas, y sin cambiar la interfaz que el usuario ve.

## Contexto

La instalación en la pantalla de inicio del iPhone ([SPEC-014](014-instalacion-ios.md)) y el uso desde el teléfono ([SPEC-009](009-mobile-shell.md), [SPEC-012](012-mobile-agent-surfaces.md)) hacen que el peso de la primera carga se pague en cada visita a través del túnel de Cloudflare. Las mediciones del árbol están registradas en [SPEC-017](017-optimizacion-imagen.md#contexto); las de esta superficie son propias:

- `apps/web/dist` mide 12 MB en disco y **≈5,5 MB** sin sourcemaps. Primera carga: `index` 417 KB + `vendor` 727 KB + CSS 63 KB = **1,2 MB sin comprimir**; con gzip son ≈330 KB.
- Después, 49 bundles de plugins cliente (`/plugins/<id>/client.js`) suman **3,0 MB** y se piden bajo demanda.
- Gramáticas de shiki diferidas: 2,2 MB. Fuentes KaTeX: 1,05 MB, de las cuales sólo 250 KB son `woff2` (woff 296 KB y ttf 502 KB son formatos redundantes para navegadores actuales). Iconos de instalación: 507 KB (`icon-512` 256 KB, `icon-maskable-512` 170 KB, `icon-192` 41 KB, `apple-touch-icon` 37 KB, `favicon-32` 2 KB).
- **No hay compresión en ninguna capa.** `mdl/docker/nginx.conf` no habilita `gzip`. `packages/host/frontend-static` responde `readFile` con sólo el `content-type` y sin `cache-control`: los assets llevan hash en el nombre y no se declaran inmutables. `/plugins/<id>/client.js` envía `cache-control: no-cache` sin `ETag` ni `Last-Modified`, de modo que cada carga pide el cuerpo completo de los 3,0 MB.
- El chunk `vendor` (727 KB con KaTeX, shiki y markdown) lo importa estáticamente `index`, así que bloquea el primer render aunque el usuario no renderice matemática ni resaltado hasta el primer mensaje.
- Política de sourcemaps: el build los emite y la imagen los sirve; no son necesarios en producción.

## Alcance

- `P1` Habilitar `gzip` en `mdl/docker/nginx.conf` para `text/javascript`, `text/css`, `application/json`, `image/svg+xml` y `application/manifest+json`.
- `P2` Declarar `cache-control: public, max-age=31536000, immutable` en `packages/host/frontend-static` para rutas con hash en el nombre, conservando las semánticas de traversal 403, SPA fallback 200, `octet-stream` y 405 ya fijadas.
- `P3` Servir `/plugins/<id>/client.js` con `ETag` y respuesta `304` en `packages/client/modules`, conservando el 404 ruidoso cuando el bundle no está compilado.
- `P4` Emitir sólo fuentes `woff2` en `apps/web/dist` y eliminar `woff`/`ttf` del build.
- `P5` Recomprimir `icon-512.png` e `icon-maskable-512.png` para que el conjunto de iconos quede en 250 KB o menos, sin cambiar el arte de [SPEC-002](002-branding.md).
- `P7` No publicar sourcemaps de `apps/web/dist` en la imagen ni servirlos.

## Fuera del alcance

- Cambiar la composición de plugins cargados en el arranque o retirar features de la interfaz.
- Reducir el conjunto de idiomas: 654 cadenas en 26 catálogos equivalen a 47 KB (1,5%) de los bundles; [SPEC-019](019-idiomas-en-es.md) las reemplaza por español con el mismo peso.
- Diferir el chunk `vendor` de la ruta crítica del primer render: [SPEC-020](020-diferir-chunk-vendor.md) lo posee, porque su verificación es de tiempo de pintado y necesita navegador.
- Limitar las gramáticas de shiki a un conjunto menor de lenguajes: queda como trabajo posterior con su propia medición.
- Cachear en un service worker o cambiar el modo de instalación de la PWA.
- Sustituir Cloudflare o el túnel.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `WEB-01` | La primera carga transfiere ≤400 KB con compresión | Panel de red del navegador contra la imagen reconstruida, caché vacía |
| `WEB-02` | Los bundles de plugins suman ≤700 KB transferidos en una sesión que usa todas las superficies | Panel de red con la sesión de `IMG-05` en [SPEC-017](017-optimizacion-imagen.md) |
| `WEB-03` | Un asset con hash responde `cache-control` inmutable | `curl -I` sobre `/assets/index-*.js` |
| `WEB-04` | `/plugins/<id>/client.js` responde `304` con `If-None-Match` | `curl -I` con el `ETag` de una respuesta previa |
| `WEB-05` | El traversal, el fallback SPA, el `octet-stream` y el 405 siguen respondiendo como hoy | Pruebas existentes de `frontend-static` y `client-modules` |
| `WEB-06` | Sólo se sirven fuentes `woff2` | `find /app/apps/web/dist -name '*.woff' -o -name '*.ttf'` vacío |
| `WEB-07` | Los iconos de instalación suman ≤250 KB | `du -ch /app/apps/web/dist/icon-*.png /app/apps/web/dist/apple-touch-icon.png` |
| `WEB-09` | No se sirven sourcemaps en producción | `curl -I` sobre `/assets/index-*.js.map` no devuelve 200 |
| `WEB-10` | Los snapshots de la interfaz siguen pasando | `pnpm run test:snapshot` y `pnpm run test:web` |

## Restricciones

- Se conservan `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-SEC-01`, `MDL-SEC-02` y `MDL-VALID-01`; el arte y los colores de [SPEC-002](002-branding.md) no cambian.
- `P2` y `P3` no pueden introducir caché para respuestas que dependen de la sesión: sólo assets con hash y bundles de plugin versionados.
- Cualquier cambio visible de interfaz exige el GIF de demostración grabado del servidor real, como pide la política del repositorio.
- Las mediciones de transferencia se hacen con compresión de extremo a extremo; hoy Cloudflare puede comprimir en el borde y enmascarar parte del problema, así que `WEB-01` se mide contra el contenedor y no sólo a través del túnel.

## Implementación prevista

- `mdl/docker/nginx.conf`: `gzip` y tipos comprimibles.
- `packages/host/frontend-static/src/index.ts`: `cache-control` inmutable para rutas con hash.
- `packages/client/modules/src/index.ts`: `ETag` y 304.
- `apps/web/vite.config.ts` y `apps/web/index.html`: fuentes `woff2`, iconos, política de sourcemaps y división del chunk `vendor`.
- `apps/web/public/`: iconos recompuestos.
- `mdl/ROADMAP.md`: fila de la fase al validar, según `SPEC-000`.

## Validación ejecutada

Fecha: `2026-11-07`/`2026-11-08`. Entornos: checkout del repositorio con Node `22.23.4` y build de `apps/web` con Vite; y el contenedor `mdl-harness:local` en el VPS detrás de su proxy. Sin navegador en ninguno de los dos, así que las mediciones de transferencia salen de `curl` y no de una carga real.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `P1` compresión `gzip` | **Aprobada en el contenedor** | `Content-Encoding: gzip` en el asset con hash y en el bundle de plugin; un bundle pasa de 52 153 a **11 606 bytes** transferidos |
| `P2` caché inmutable | Aprobada | `cacheControlFor` en `frontend-static`: `/assets/*` responde `public, max-age=31536000, immutable` y los nombres estables `no-cache`; prueba real-composition afirma ambas |
| `P3` `ETag` y `304` | **Aprobada en el contenedor, tras corregir un defecto** | La comparación exigía igualdad exacta con el validador fuerte, pero nginx publica `W/"…"` al comprimir, así que un navegador real nunca recibía `304`; la comparación ahora es débil, como pide RFC 9110 para `If-None-Match`, y el contenedor responde **304** ante `W/"9B1W…"` |
| `P4` fuentes sólo `woff2` | Aprobada | Build de `apps/web`: las caras KaTeX quedan en 19 archivos `woff2` (250,2 KB); sobrevive un `woff`/`ttf` de 11,7 KB de otra familia sin `woff2`, que se conserva a propósito |
| `P5` iconos | Aprobada | 507 KB → **228 KB** (icon-512 256,4→103,9; maskable 169,8→85,7; icon-192 41,3→17,3; apple-touch 36,7→15,3) por cuantización a 256 colores; PSNR 39,6–41,2 dB contra el original |
| `P7` sin sourcemaps publicados | Aprobada | La etapa `runtime-tree` borra `apps/web/dist/**/*.map`; los archivos locales se conservan para depuración del build |
| `WEB-01`/`WEB-02` transferencia | Parcial | Medido por `curl` con `Accept-Encoding: gzip`: el shell responde y un bundle transfiere 11 606 bytes. La suma de una primera carga completa y del roster entero necesita el panel de red del navegador |
| `WEB-04` `ETag` y `304` | **Aprobada en el contenedor** | `curl -sI` devuelve `200` con `cache-control: no-cache` y un validador; la repetición con `If-None-Match: W/"9B1W4LdHDssa25YKWsfUbY8S8CA"` devuelve **304** |
| `WEB-03` caché inmutable | **Aprobada en el contenedor** | `/assets/index-BHhrez7c.js` responde `cache-control: public, max-age=31536000, immutable` con `Content-Encoding: gzip` |
| `WEB-05` semánticas previas | Aprobada | Las pruebas de traversal 403, SPA fallback, `octet-stream` y 405 siguen pasando |
| `WEB-10` snapshots | **No ejecutada** | `pnpm run test:snapshot` y `test:web` no se corrieron en este entorno |

Pruebas ejecutadas: `packages/host/frontend-static` y `packages/client/modules` — 28 pruebas en verde, incluidas las del validador débil y de la lista de validadores; `oxlint` sin errores en los archivos tocados; build de `apps/web` y de los bundles de cliente completos.

## Resultado y pendientes

- Resultado: `P1`–`P5` y `P7` implementados. En disco, `dist` baja ≈800 KB por fuentes y ≈280 KB por iconos, y los bundles de plugins dejan de reenviar su cuerpo en cada carga gracias al `ETag`.
- El chunk `vendor` queda fuera: su diferimiento pasó a [SPEC-020](020-diferir-chunk-vendor.md) al validarse esta fase, porque mide tiempo hasta el primer pintado y no bytes, y exige verificación en navegador.
- Pendientes o excepciones aceptadas: la reducción del conjunto de gramáticas de shiki no entra en esta fase.
- Decisión de salida: pendiente.

## Decisiones resueltas

- El payload se valida como especificación propia, independiente de la imagen ([SPEC-017](017-optimizacion-imagen.md)) y de los idiomas ([SPEC-019](019-idiomas-en-es.md)).
- El diferimiento del chunk `vendor` se separó a [SPEC-020](020-diferir-chunk-vendor.md) durante la validación.

## Estado de la validación

Pendiente: `P6` (diferir el chunk `vendor`, que necesita verificación en navegador y GIF) y las mediciones contra el contenedor (`WEB-01`, `WEB-02`, `WEB-08`, `WEB-10`).
