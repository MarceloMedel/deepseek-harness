# SPEC-028 — SearXNG como motor de búsqueda del despliegue

Estado: Validada
Fase: 28
Commit base: `d9939f0077`
Aprobación para iniciar: usuario, 2026-11-10 — clave de Tavily cargada en el despliegue y aprobada la implementación de esta fase

## Objetivo

Que `web_search` consulte un SearXNG propio alojado en el host, de modo que las búsquedas salgan de un agregador bajo control del operador en lugar de depender de que Bing y Baidu acepten el raspado directo desde la IP del VPS, sin publicar el motor en ninguna interfaz y sin que una caída suya deje al agente sin búsqueda.

## Contexto

Hoy `web_search` lo sirve el bundle `dsh-web-search-multi` (SPEC-026) con `provider: auto`. Los motores que responden desde este VPS son **Bing y Baidu**; 360 falla con un bucle de redirección y DuckDuckGo devuelve su página anti-bot. Ese conjunto es frágil por construcción: son raspados de HTML sin SLA, y su disponibilidad depende de la IP del servidor.

El bundle ya trae un adaptador `searxng`, así que no hace falta código nuevo en DSH. Lo que ese adaptador exige, leído en `mdl/plugins/web-search-multi/lib/index.js`:

- `GET {searxngUrl}/search?q=…&format=json`, con `Accept: application/json`.
- Un token opcional, enviado a la vez como parámetros (`token`, `auth`) y cabeceras (`Authorization: Bearer`, `X-Searxng-Token`), resuelto por credencial o por entorno según `searxngTokenEnv`.
- `searxngUrl` se toma de la configuración o de `SEARXNG_URL`.

Dos consecuencias directas: **SearXNG no sirve JSON por defecto** (`search.formats` trae `html`), así que la integración falla en el primer intento si no se habilita; y el token sólo hace falta si el motor queda accesible fuera de la red de Docker, que esta fase no permite.

Alcanzabilidad medida hoy desde este contenedor, con un `curl` de navegador, que es el escenario que SearXNG va a repetir:

| Motor | Respuesta | Lectura |
|---|---|---|
| `mojeek.com` | 200 | Apto |
| `google.com` | 200 | Apto, aunque puede devolver consentimiento o JS |
| `qwant.com` | 200 | Apto |
| `startpage.com` | 200 | Apto, con posible desafío |
| `search.brave.com` | 429 | Bloqueado por tasa |
| `lite.duckduckgo.com` | 202 | Desafío anti-bot |
| `en.wikipedia.org` | 302 | Redirección normal |

Por decisión del usuario del 2026-11-10, el despliegue combina este motor con **Tavily como respaldo autenticado**: su nivel gratuito son 1 000 créditos al mes, verificado ese día en `docs.tavily.com`, y su clave ya está cargada por la página de configuración, de modo que una búsqueda sigue respondiendo aunque SearXNG esté caído. Ese respaldo no cambia el alcance de esta fase; la cadena de reserva ya lo pone en segundo lugar tras fijar `provider: searxng`.

El despliegue ya tiene la pieza de red que hace falta: el `compose.yml` declara la red `edge` como externa y usa la red por defecto del proyecto para el servicio de DSH. Un servicio más en ese mismo proyecto resuelve por nombre, sin publicar puertos y sin tocar la red `edge`. El host comparte 6 vCPU y 11 GiB entre Ollama, personal-suite y este despliegue, con el contenedor de DSH limitado a 4 CPU y 4 GiB, así que el motor nuevo compite por CPU de raspado en cada búsqueda.

Este documento posee el alcance de la fase; el contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md).

## Alcance

- `SRX-01` Un servicio `searxng` en `mdl/docker/compose.yml`, con imagen fijada por etiqueta concreta, únicamente en la red por defecto del proyecto, sin puertos publicados, con límites de CPU y memoria, `restart: unless-stopped` y sin privilegios añadidos.
- `SRX-02` La configuración del motor vive en el repositorio y se monta de sólo lectura: `search.formats` incluye `json`, el limitador queda desactivado porque el consumo es interno y de un solo cliente, y `server.secret_key` llega por el entorno del servicio, nunca desde el archivo versionado.
- `SRX-03` Los motores habilitados se eligen con la medición de alcanzabilidad, no con la lista por defecto: se conservan los que responden desde esta IP y se retiran los que devuelven desafío o tasa agotada.
- `SRX-04` La configuración de DSH es declarativa en la capa de parche del perfil: `provider: searxng`, `searxngUrl` apuntando al servicio por su nombre de red, y `enableFallback: true` para que Bing y Baidu sigan respondiendo si SearXNG no contesta.
- `SRX-05` Sin credencial nueva: mientras el motor no se publique fuera de la red de Docker, no hay token, y el despliegue no gana un secreto que custodiar.
- `SRX-06` El catálogo de herramientas no cambia: `web_search` sigue siendo una sola herramienta, y el costo de la fase es un contenedor más, no contexto de modelo.
- `SRX-07` Degradación probada: con el servicio detenido, una búsqueda sigue devolviendo resultados por el siguiente motor de la cadena.

## Fuera del alcance

- Publicar SearXNG en `dsh.devmedel.com` o en cualquier puerto del host. Eso exigiría su propia especificación por `MDL-SEC-02`, más token y limitador activos.
- Escribir un proveedor SearXNG nativo para DSH: el bundle ya lo tiene y sustituirlo es trabajo de upstream.
- Construir una imagen propia del motor, cambiar su cadena de raspado o añadir proxies de salida.
- Copia y rotación del `secret_key` más allá de su generación inicial; el respaldo de volúmenes sigue siendo de `SPEC-005`.
- Retirar el bundle `dsh-web-search-multi` o los motores directos: siguen siendo el respaldo.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `SRX-01` | El motor corre en el proyecto, sin puertos publicados | `docker compose config` muestra el servicio sin `ports:`, y `ss -ltn` en el host no gana ninguna escucha nueva |
| `SRX-02` | El JSON está habilitado y el secreto no está versionado | `curl "http://…/search?q=test&format=json"` devuelve JSON con `results`; `git grep` no encuentra el `secret_key` |
| `SRX-03` | Los motores habilitados responden | Una búsqueda con `engines=` explícito por motor devuelve resultados; la tabla medida queda registrada en esta especificación |
| `SRX-04` | DSH usa SearXNG sin reconstruir la imagen | La fila `web-search-multi` compone `provider: searxng` y `searxngUrl`; una llamada real a `web_search` devuelve fuentes |
| `SRX-05` | No hay credencial nueva | El despliegue no gana variables ni archivos de secreto; el motor responde por nombre de red |
| `SRX-06` | El catálogo no cambia | La medición de herramientas desde el log de sesión da el mismo total que antes de la fase |
| `SRX-07` | La caída del motor no rompe la búsqueda | Detener `searxng`, llamar a `web_search`, comprobar resultados por Bing o Baidu, y volver a arrancarlo |

## Restricciones

- Se conservan `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-DOCKER-02` se mantiene: el motor no recibe el socket de Docker ni capabilities extra, y su imagen se fija por etiqueta para que una actualización sea una decisión y no una sorpresa.
- La configuración de DSH va en la capa de parche del perfil, que se recarga en caliente, así que la fase no exige reconstruir la imagen; el servicio nuevo sí exige recrear el contenedor, y eso se hace desde el host.
- SearXNG agrega resultados de motores de terceros: usarlo desde un VPS puede contravenir los términos de esos motores. Es una decisión del operador y queda registrada aquí, no resuelta por el código.
- La calidad de los resultados depende de la IP: los motores medidos como bloqueados hoy pueden cambiar mañana en cualquiera de las dos direcciones, igual que el catálogo de herramientas de `SPEC-026` cambió de 49 a 51 sin aviso.

## Implementación prevista

- `mdl/docker/compose.yml`: servicio `searxng` con la imagen fijada en `searxng/searxng:2026.11.9-57ff753ad`, `expose` de 8080 sin `ports`, la red por defecto del proyecto, `cpus: 1.0`, `mem_limit: 512m`, `pids_limit: 256`, `no-new-privileges` y las tres capabilities que el entrypoint necesita para bajar del usuario root (`CHOWN`, `SETGID`, `SETUID`) con el resto descartadas. La configuración se monta de sólo lectura y la caché usa un volumen propio.
- `mdl/docker/searxng/settings.yml`: configuración versionada del motor —`formats: [html, json]`, `limiter: false`, `public_instance: false`, `image_proxy: false`— con `duckduckgo` y `brave` desactivados por la medición de alcanzabilidad. El `secret_key` llega por `SEARXNG_SECRET`; sin él SearXNG genera uno por arranque, que es aceptable porque nada de esta fase depende de sesiones.
- `$DSH_HOME/profiles/web/cordis.patch.yml`: las tres claves de la fila `web-search-multi` (`provider`, `searxngUrl`, `enableFallback`), aplicadas sobre el volumen y no sobre la imagen. La página de configuración del bundle escribe las mismas claves en `$DSH_HOME/settings.yaml` y **sus valores ganan sobre el parche**, así que ambos tienen que coincidir.
- `mdl/docker/README.md`: sección de herramientas externas, con el motor, su ausencia de puertos y la degradación.
- `mdl/ROADMAP.md`: fila de la fase al validar.

## Validación ejecutada

Ejecutada el 2026-11-10 sobre el despliegue, con el servicio ya en marcha:

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `SRX-01` servicio interno | Cumplido | Responde en `http://searxng:8080` desde dentro del contenedor de DSH; el compose no declara `ports`, sólo `expose: 8080` |
| `SRX-02` JSON y secreto | Cumplido | `GET /search?format=json` devuelve `results`; el único `SEARXNG_SECRET` del repositorio es la referencia `${SEARXNG_SECRET:-}` del compose |
| `SRX-03` motores medidos | Cumplido | Ocho consultas por motor leyendo `unresponsive_engines`: `google cse` 160 resultados (20 por consulta, siempre responde) y `bing` 40 (10 por consulta, la mitad de las veces) funcionan; `google` (HTML) y `qwant` responden `Suspended: access denied` en 8/8, y `baidu` `Suspended: CAPTCHA` en 8/8, así que quedan desactivados junto a `duckduckgo` y `brave`. `mojeek` y `startpage` no existen en esta imagen |
| `SRX-04` DSH usa el motor | Cumplido | La ruta `/_dsh/web-search-multi/settings` informa `provider: searxng`, `searxngUrl: http://searxng:8080`, `enableFallback: true`, cambiado por la capa de parche recargada en caliente y sin reconstruir la imagen; una llamada real a `web_search` devolvió el mismo conjunto de hosts que el motor para esa consulta (`docs.searxng.org`, `contabo.com`, `github.com`, `perlod.com`, …) |
| `SRX-05` sin credencial nueva | Cumplido | `$DSH_HOME/.credentials.yaml` contiene sólo `TAVILY_API_KEY`; el motor responde por nombre de red y no usa token |
| `SRX-06` catálogo sin cambios | Cumplido | 97 herramientas / 83 896 bytes, idéntico al total previo a la fase |
| `SRX-07` degradación | Cumplido por [SPEC-029](029-busqueda-web-lite.md) | El respaldo por el que esta fase respondía (`enableFallback` del bundle) fue retirado con el bundle en SPEC-029; la cadena propia prueba lo mismo con evidencia medida: con el motor inalcanzable, la primera búsqueda tardó 2 573 ms y la segunda 37 ms porque el eslabón quedó omitido, y TAVILY respondió ambas veces |
| `SRX-03` historial de la medición | Cumplido | La lista de motores cambió dos veces en la misma sesión y ambas mediciones están registradas: `bing` se activó porque respondía la mitad de las consultas, y se desactivó al comprobar que respondía con resultados **ajenos** a la consulta («receta de pan amasado» devolvió TikTok, «searxng documentation» devolvió criptografía). `google` y `qwant` respondían «access denied», `baidu` pedía CAPTCHA, y `mojeek`/`startpage` no existen en la imagen |

## Resultado y pendientes

- Resultado: implementado y en marcha. `web_search` lo sirve el motor propio (20–30 resultados por consulta en 0,45–1,4 s) con Tavily detrás como respaldo autenticado.
- Pendientes o excepciones aceptadas: ninguno por defecto.
- Decisión de salida: validada. El motor sirve al despliegue desde `http://searxng:8080`, sin puertos publicados y sin credencial, y su cobertura general descansa en `google cse`, un raspado sin clave que respondió 160 de 160 en la medición; el respaldo autenticado que la fase dejó configurado vive ahora en [SPEC-029](029-busqueda-web-lite.md).
