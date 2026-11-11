# SPEC-029 — Búsqueda web propia: una cadena lite sin bundle de terceros

Estado: Aprobada
Fase: 29
Commit base: `d9939f0077`
Aprobación para iniciar: usuario, 2026-11-10 — «can I have a local lite solution? I only want to use searcxng -> tavily -> bing -> brave», aprobada la implementación en el mismo diálogo

## Objetivo

Que `web_search` lo sirva un proveedor propio, escrito y versionado en este repositorio, con una cadena fija —SearXNG, Tavily, Bing, Brave— y sin ninguna pieza de terceros en el camino, conservando el respaldo autenticado que mantiene la búsqueda viva cuando el motor falla.

## Contexto

La búsqueda del despliegue pasó por dos estados en el mismo día: primero el raspado directo de Bing y Baidu, que devolvió cero resultados cuando su marcado cambió, y después `dsh-web-search-multi` (SPEC-026) con SearXNG como motor y Tavily detrás. El bundle funciona, pero impone tres costos: su orden de reserva es suyo y coloca a SearXNG en octavo lugar, su página de configuración escribe en `$DSH_HOME/settings.yaml` valores que **ganan sobre la capa de parche**, y su código no es de este repositorio.

La costura que hace falta es pequeña y está en `packages/web/web/src/types.ts`: un proveedor de búsqueda son tres miembros —`id`, `available()` y `search(request, signal)`— registrados con `ctx.web.registerSearchProvider`. Nada del bundle es necesario para cumplirla.

Hechos medidos que deciden el diseño:

- `available()` no puede hacer red, así que la disponibilidad de un eslabón es configuración y credencial, no una prueba de vida.
- SearXNG en este despliegue responde en JSON desde `http://searxng:8080` y tarda entre 0,45 y 1,4 s por consulta (SPEC-028).
- Tavily tiene 1 000 créditos al mes y su clave ya vive en `$DSH_HOME/.credentials.yaml`.
- Ni Brave ni Bing tienen credencial hoy: Brave queda inerte hasta que exista una clave, y Bing es el último recurso raspado.
- El motor de Bing dentro de SearXNG devuelve resultados **ajenos a la consulta** desde esta IP —«receta de pan amasado» devolvió páginas de TikTok y «searxng documentation» devolvió artículos de criptografía—, así que una respuesta equivocada es peor que ninguna: termina la cadena y llega al modelo como hecho.

Este documento posee el alcance de la fase; el contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md). Sustituye la elección de proveedor de [SPEC-026](026-herramientas-externas-reproducibles.md), que sigue poseyendo el MCP de Neon y la reproducibilidad de las herramientas externas.

## Alcance

- `LIT-01` Un plugin propio, `mdl/plugins/web-search-lite`, publica un proveedor `lite` con la cadena en ese orden exacto: SearXNG, Tavily, Bing, Brave. El primero que devuelve al menos una fuente gana.
- `LIT-02` `available()` no toca la red: informa si el eslabón puede ejecutarse (URL configurada, credencial resoluble). Un eslabón sin configurar cuesta cero.
- `LIT-03` Un eslabón que falla en tiempo de petición queda omitido durante `retryAfterMs` (30 s), de modo que un motor caído cuesta una búsqueda lenta y no una por búsqueda. Cada eslabón tiene su propio presupuesto (`linkTimeoutMs`, 2,5 s).
- `LIT-04` Cuando todos los eslabones fallan, el error nombra a cada uno y su motivo, porque el agente puede actuar sobre «searxng respondió 502; tavily no tiene clave; bing no devolvió resultados» y no sobre «la búsqueda falló».
- `LIT-05` El eslabón raspado exige que la fuente mencione algún término de la consulta; un motor que responde con una página genérica falla en vez de entregar resultados ajenos.
- `LIT-06` La configuración vive en una sola superficie, la capa de parche del perfil, que se recarga en caliente: no hay página de configuración y por tanto no hay valor que pueda ensombrecerla.
- `LIT-07` El bundle de terceros `dsh-web-search-multi` se retira: sus filas salen de la capa de parche, su paquete sale del volumen, su nombre sale del bucle de bundles del entrypoint y su directorio sale del repositorio.
- `LIT-08` El catálogo de herramientas no cambia: sigue habiendo un solo `web_search`, y ninguna herramienta nueva entra al modelo.

## Fuera del alcance

- Escribir un cliente MCP o un proveedor de `fetch`: la fase es sólo búsqueda.
- Reimplementar los proveedores que el bundle traía y nadie usaba (360, Serper, Bocha, DuckDuckGo).
- Cambiar el motor (`SPEC-028` es su dueño) o añadir claves nuevas distintas de `TAVILY_API_KEY` y `BRAVE_API_KEY`.
- Una página de configuración en la GUI: la cadena es una decisión de despliegue, no una preferencia por sesión.
- Reescribir `dsh-tool-web` o la presentación del resultado.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `LIT-01` | El proveedor `lite` registra la cadena en el orden pedido y sirve la búsqueda | `check.mjs` monta el plugin y una búsqueda real devuelve fuentes; la ruta de configuración informa `provider: lite` |
| `LIT-02` | Un eslabón sin configurar no cuesta nada | Sin `BRAVE_API_KEY` el informe de `check.mjs` dice «link skipped», y la búsqueda no gana latencia perceptible |
| `LIT-03` | Un motor caído se omite y se reintenta después | Con el motor detenido, dos búsquedas seguidas: la primera lenta, la segunda ya sin esperar al motor, y el aviso de omisión en el error cuando todos fallan |
| `LIT-04` | El error agrega los motivos | Con todos los eslabones caídos, el mensaje enumera eslabón y motivo |
| `LIT-05` | El eslabón raspado no entrega resultados ajenos | Una consulta que Bing responde con una página genérica hace fallar ese eslabón en lugar de devolver fuentes sin relación |
| `LIT-06` | Una sola superficie de configuración | `git grep` y la comprobación de `settings.yaml`: no queda sección `web-search-multi` ni página que la escriba |
| `LIT-07` | El bundle de terceros sale de las cuatro ubicaciones | Sin su directorio en el repositorio, sin sus filas en la capa de parche, sin su paquete en `profiles/node_modules`, y `web-search-multi` fuera del bucle del entrypoint y del `Dockerfile` |
| `LIT-08` | El catálogo no cambia | Medición desde el log de sesión antes y después: mismo total de herramientas |

## Restricciones

- Se conservan `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DOCKER-01`, `MDL-DATA-01` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- Las claves se resuelven por el servicio de credenciales (`TAVILY_API_KEY`, `BRAVE_API_KEY`) y nunca se escriben en la capa de parche ni en el repositorio.
- El plugin publica red saliente (una petición por eslabón y búsqueda) y no publica ninguna superficie entrante: no registra rutas, no sirve sockets y no monta filas de cliente.
- El eslabón raspado es una concesión deliberada: se mantiene porque la cadena pedida lo incluye, con la comprobación de relevancia de `LIT-05` como condición para no mentir al modelo.
- La migración desde el bundle es una operación de una sola vez sobre el volumen, no una capa de compatibilidad: nada en el código la repite ni la tolera indefinidamente.

## Implementación prevista

- `mdl/plugins/web-search-lite/`: `host.mjs` (el proveedor y sus cuatro eslabones), `cordis.patch.yml` (la fila del proveedor y el `searchProvider` del seam), `install.sh` (publicación idempotente en el volumen), `check.mjs` (la cadena contra los servicios vivos) y `README.md`.
- `mdl/docker/Dockerfile` y `mdl/docker/entrypoint.sh`: el bundle nuevo entra y `web-search-multi` sale del bucle y de las listas de permisos.
- `mdl/plugins/web-search-multi/`: se elimina del repositorio.
- `mdl/docker/README.md`: la sección de herramientas externas describe la cadena propia y la migración de una vez.
- `mdl/ROADMAP.md`: fila de la fase al validar.

## Validación ejecutada

Ejecutada el 2026-11-10 sobre el despliegue, con el plugin ya publicado en el volumen:

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `LIT-01` cadena y servicio | Cumplido | `check.mjs` monta el plugin (proveedor `lite`, `available: true`) y una búsqueda real devuelve cinco fuentes en 789 ms, todas de `docs.searxng.org` para una consulta sobre la configuración de SearXNG |
| `LIT-02` eslabón sin configurar | Cumplido | Sin `BRAVE_API_KEY`, `check.mjs` informa «brave key: absent (link skipped)» y la búsqueda usa el motor sin penalización |
| `LIT-05` relevancia del raspado | Cumplido en código, pendiente de ejecución | El eslabón exige que la fuente mencione un término de la consulta; la primera medición del motor mostró por qué: Bing devolvió TikTok para «receta de pan amasado» y criptografía para «searxng documentation» |
| `LIT-06` superficie única | Cumplido | La sección `web-search-multi` salió de `$DSH_HOME/settings.yaml` y ninguna página la escribe ya |
| `LIT-07` retirada del bundle | Cumplido | Directorio borrado del repositorio, filas retiradas de la capa de parche, paquete borrado de `profiles/node_modules`, y `web-search-multi` fuera del bucle del entrypoint y del `Dockerfile` |
| `LIT-08` catálogo | Cumplido | 97 herramientas / 83 896 bytes antes y después |
| `LIT-03` motor caído | Pendiente | Requiere detener SearXNG y buscar dos veces |
| Migración en imagen | Pendiente | Requiere reconstruir: el bucle del entrypoint todavía nombra `web-search-multi` en la imagen en ejecución |

## Resultado y pendientes

- Resultado: el despliegue ya busca por la cadena propia —SearXNG vivo, Tavily detrás— publicada como plugin del repositorio y sin código de terceros. La migración del volumen está hecha.
- Pendientes:
  - Reconstruir la imagen para que el bucle del entrypoint deje de publicar el bundle retirado al recrear el contenedor.
  - `LIT-03`: la prueba de degradación con el motor detenido.
  - Reiniciar `searxng` para que su lista de motores sin Bing entre en vigor.
- Decisión de salida: pendiente.
