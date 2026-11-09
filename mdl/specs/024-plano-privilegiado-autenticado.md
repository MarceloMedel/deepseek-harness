# SPEC-024 — Plano privilegiado autenticado desde el hostname público

Estado: Validada
Fase: 24
Aprobación para iniciar: usuario, 2026-11-09 — aprobar el alcance tal como está; el tag `AUD` se aporta al desplegar
Commit base: `e66067f423`

## Objetivo

Administrar la configuración de modelos desde `Configuración → Modelos` en `dsh.devmedel.com`, con los mismos permisos que por loopback: ver el directorio de proveedores y las variables de configuración, declarar un proveedor, agregar o quitar modelos de Ollama, guardar o quitar la clave de un proveedor y descubrir modelos en un endpoint.

## Contexto

`SPEC-005` dejó el plano de configuración en solo loopback y verificó ese comportamiento (`ACCESS-03`): `dsh-client-connection` incluye `settings.*`, `credentials.*`, `llm.discoverModels`, `host.pickDirectory`, `host.openPath` y `agentPreset.*` en `PRIVILEGED_METHODS` y los evalúa con la lista de confianza vacía, así que cualquier `Host` que no sea loopback recibe `403` aunque `trustedHosts` lo declare. La página Modelos pide `llm.providers` y `settings.describe` en paralelo; `llm.providers` responde `200` desde el hostname público y `settings.describe` responde `403`, y ese rechazo tumba la carga completa con el mensaje «No se pudo cargar el directorio de proveedores».

La decisión de `SPEC-005` no es un defecto de DSH, es su modelo de confianza: `trustedHosts` es un fence anti-rebinding, no autenticación. Habilitar el plano público exige que algo autentique la petición. La instancia ya tiene esa autenticación delante: Cloudflare Access con política por email OTP protege el hostname, y Access entrega al origen, en cada petición autenticada, un JWT firmado (`Cf-Access-Jwt-Assertion` y la cookie `CF_Authorization`) con `iss` del equipo, `aud` de la aplicación, `exp` corto y la clave pública publicada en `https://<equipo>.cloudflareaccess.com/cdn-cgi/access/certs`. Verificar ese JWT dentro de DSH convierte la política de Access en una condición comprobable por el propio proceso, sin secreto compartido, sin cambios en Caddy ni en el túnel, y sin abrir ningún puerto.

El contenedor ya alcanza ese endpoint de certificados (`200` desde el propio contenedor) y el resto de la cadena llega intacta: `cloudflared → Caddy → nginx (proxy_set_header Host $http_host) → dsh`.

El contrato de producto está en [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md) y el orden en [../ROADMAP.md](../ROADMAP.md).

## Alcance

- `PRIV-01` Nueva configuración opcional de `dsh-client-connection` que habilita el plano privilegiado para autoridades declaradas cuando la petición trae una aserción de Cloudflare Access válida. Sin esa configuración el comportamiento es exactamente el actual.
- `PRIV-02` Verificación criptográfica del JWT dentro del proceso: firma RS256 contra el JWKS del equipo, `iss` igual al dominio del equipo, `aud` igual al tag de la aplicación, `exp`/`nbf` vigentes. Claves públicas en caché de memoria, con recarga acotada ante un `kid` desconocido.
- `PRIV-03` La aserción se lee del encabezado `Cf-Access-Jwt-Assertion` y, si no está, de la cookie `CF_Authorization`. Sin aserción válida la respuesta es `403`, igual que hoy.
- `PRIV-04` El `Host` de la petición debe estar además en la lista de autoridades privilegiadas declaradas: una aserción válida desde otro origen no habilita nada.
- `PRIV-05` El fence existente se conserva completo: `Origin` de otro origen, `sec-fetch-site: cross-site` y `Origin: null` siguen rechazados aunque la aserción sea válida.
- `PRIV-06` El despliegue compone la configuración por una capa de parche propia de la imagen (`--patch`), con el dominio del equipo y el tag `AUD`; el tag no es un secreto y se versiona en `mdl/docker`.
- `PRIV-07` Con el plano habilitado, `Configuración → Modelos` carga desde `dsh.devmedel.com`, muestra el catálogo por defecto de DSH, agrega y quita modelos de Ollama, y persiste en `$DSH_HOME/settings.yaml` conservando los comentarios y sin perder los valores por defecto.

## Fuera del alcance

- Autenticación propia de DSH: no se agrega login, token de administración ni pantalla de desbloqueo.
- Cuentas múltiples, roles o autorización por usuario: sigue siendo una instancia personal.
- Habilitar el plano privilegiado en una autoridad que no esté detrás de un autenticador verificado; la configuración exige `kind: cloudflare-access` y no admite «confiar en cualquier cabecera».
- Cambiar qué métodos son privilegiados o sacarlos de la lista.
- Reemplazar Cloudflare Access, el túnel o la política del gateway.
- Publicar modelos que Ollama no tenga descargados en el host: descargarlos sigue siendo una acción del host.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `PRIVV-01` | Sin configuración, `settings.describe` desde `dsh.devmedel.com` responde `403` y por loopback `200` | Prueba del paquete y `curl` contra el servidor vivo |
| `PRIVV-02` | Con configuración y aserción válida, `settings.describe` responde `200` desde el hostname declarado | Prueba con JWKS y JWT locales firmados con una clave RSA generada en la prueba |
| `PRIVV-03` | Firma inválida, clave ajena, `aud` ajeno, `iss` ajeno, token vencido, token sin `exp`, `alg` distinto de RS256, aserción ausente: `403` en todos los casos | Prueba parametrizada, un caso por condición |
| `PRIVV-04` | `settings.mutate` y `credentials.set` con aserción válida desde el hostname declarado escriben la capa de usuario | Prueba de integración con el provider de archivo y verificación del documento resultante |
| `PRIVV-05` | Una aserción válida con un `Host` fuera de la lista privilegiada responde `403` | Prueba del fence |
| `PRIVV-06` | `Origin` ajeno, `Origin: null` y `sec-fetch-site: cross-site` siguen rechazados con aserción válida | Prueba del fence |
| `PRIVV-07` | JWKS inalcanzable, respuesta malformada o `kid` desconocido sin recarga útil: `403` (falla cerrado) y el motivo se registra sin el token | Prueba del verificador con un servidor JWKS que falla |
| `PRIVV-08` | Dominio de equipo vacío, `aud` vacío o `hosts` vacío fallan la carga del plugin | Prueba de configuración y `dsh --profile web --dump-config` |
| `PRIVV-09` | El token nunca aparece en registros, mensajes de error ni en el documento de configuración | Revisión de código y búsqueda en la salida de las pruebas |
| `PRIVV-10` | En el despliegue real: Modelos carga desde `dsh.devmedel.com`, agrega un modelo de Ollama, persiste tras recargar y tras recrear el contenedor; la misma llamada desde otro origen responde `403` | Validación manual en escritorio y teléfono sobre el contenedor reconstruido, más `curl` con y sin aserción |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-ENV-01`, `MDL-DATA-01` y `MDL-VALID-01`.
- `MDL-SEC-01`: no se incorpora ninguna credencial. El tag `AUD`, el dominio del equipo y las claves públicas no son secretos; el JWT de Access no se guarda.
- `MDL-SEC-02`: es esta especificación la que habilita la relajación, y la validación de seguridad adjunta es la que sigue.
- `MDL-UPSTREAM-01`: la configuración nueva es opcional y por defecto inerte, así que el comportamiento de upstream no cambia cuando nadie la declara.

### Análisis de seguridad

Qué autentica: la firma de Cloudflare para esta aplicación concreta. Un atacante que no pueda obtener un JWT de Access para `dsh.devmedel.com` no alcanza el plano privilegiado por ninguna ruta, aunque conozca el hostname, la IP del contenedor o esté dentro de la red `edge`.

Qué NO autentica y queda aceptado:

- Un JWT o una cookie robados dentro de su vigencia equivalen a la sesión de Access, que ya da acceso a la conversación y a `bash` en el contenedor. El plano privilegiado no agrega una capacidad que esa sesión no tuviera ya por otro camino.
- Un XSS en la propia GUI podría usar la sesión del navegador; no introduce una ruta nueva, porque el código que se ejecuta ya corre en el origen de la aplicación.
- `llm.discoverModels` deja que el usuario autenticado haga que el host consulte una URL que elige. Es el mismo usuario que opera el agente, y el túnel no expone el contenedor a terceros.
- La política de Access sigue siendo la fuente de identidad: revocar a un usuario o cambiar la política se hace en Cloudflare, no en DSH.

Por qué no se elige una cabecera de confianza inyectada por el proxy: el secreto tendría que vivir en Caddy y en DSH, cualquier contenedor de la red `edge` podría enviarlo si lo conociera, y no se podría distinguir una petición autenticada por Access de otra que simplemente copie el encabezado. La verificación de firma no depende de la ruta de red.

## Implementación prevista

- `packages/client/connection`: nuevo módulo de verificación de Cloudflare Access (JWKS con caché, verificación RS256 con `node:crypto`, lectura de encabezado y cookie), ampliación de `Config` con la sección opcional, y sustitución del test síncrono de loopback por una decisión que consulte la aserción en los dos puntos donde hoy se aplica el pin (la comprobación de `PRIVILEGED_METHODS` en `apply` y el interceptor `authority: 'loopback'` en `rpc-host.ts`). README y JSDoc del paquete al día.
- `mdl/docker`: capa de parche `privileged-access.yml` con la fila `connection`, montada de solo lectura y pasada por `--patch` en el arranque; el `AUD` y el dominio del equipo como valores del despliegue.
- `mdl/`: roadmap y esta especificación.
- Pruebas: unitarias del verificador con un servidor JWKS local y claves generadas; prueba de composición real del plugin (la política aplicada en el interceptor y en el método privilegiado); actualización de las pruebas existentes del fence.
- Nota de agente para el repositorio: la decisión de confiar en una aserción verificada, con su alcance y sus límites.

## Validación ejecutada

Validado el 2026-11-09 dentro del contenedor de despliegue, primero sobre el árbol de trabajo del fork y después sobre la imagen reconstruida en el VPS.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `PRIVV-01` pin intacto sin configuración | Cumplida | `npx vitest run packages/client/connection` (127 pruebas): `settings.describe` con `Host` público y sin aserción responde `403`; por loopback `200`. Repetido sobre la imagen reconstruida: `403` por `dsh.devmedel.com` sin aserción, `200` por loopback, `200` el catálogo |
| `PRIVV-02` aserción válida admitida | Cumplida | `tests/cloudflare-access.host.spec.ts` con un JWKS real en loopback; arranque real del perfil compuesto con aserción en el encabezado y en la cookie; y en el despliegue el usuario abrió `Configuración → Modelos` en `https://dsh.devmedel.com`, que carga el catálogo y admite edición — el mismo pedido que antes devolvía el error del directorio |
| `PRIVV-03` rechazos por condición | Cumplida | Casos parametrizados: aserción ausente o vacía, token no JWT, segmentos fuera de base64url, encabezado sin JSON, `alg` simétrico o ausente, sin `kid`, firma ajena, vencido, sin `exp`, `nbf` futuro, otro equipo, otra aplicación, `aud` en lista ajena, carga manipulada — `403` en cada uno |
| `PRIVV-04` escritura por el plano | Cumplida | Arranque real: `settings.mutate` con aserción responde `200`, el valor queda en `$DSH_HOME/settings.yaml`, y la misma llamada sin aserción responde `403`. En el despliegue, agregar `GLM 5.3 flash` desde la página en `https://dsh.devmedel.com` escribió `llm-pi-ai.providers.ollama.models` conservando los comentarios del documento y el resto de los namespaces en sus valores por defecto (`settings.yaml`, 2026-11-09 18:32) |
| `PRIVV-05` autoridad no declarada | Cumplida | `tests/node-half.host.spec.ts` sobre HTTP real: autoridad confiable pero fuera de `hosts` con aserción válida → `403` |
| `PRIVV-06` fence de navegador | Cumplida | Mismos casos: `Origin` ajeno, `Origin: null` y `sec-fetch-site: cross-site` con aserción válida → `403`; `Origin` del propio host → admitido |
| `PRIVV-07` falla cerrado sin claves | Cumplida | Endpoint de certificados con `503`, conjunto publicado sin clave RSA usable y `kid` desconocido: `403`, con una sola consulta por intervalo (el contador del servidor de prueba lo comprueba). El JWKS real del equipo se inspeccionó antes del despliegue: dos claves RSA/RS256 con `kid` y `use: sig`, la forma que el verificador consume |
| `PRIVV-08` configuración inválida | Cumplida | Casos de carga fallida (origen en texto plano, origen con ruta, sin `audience`, sin `hosts`, autoridad fuera de `trustedHosts`, loopback como extensión, autoridad no canónica) y `dsh --profile web --dump-config --patch mdl/docker/privileged-access.yml`, que compone la fila con la expresión `trustedHosts` intacta, también con el tag real |
| `PRIVV-09` token fuera de registros | Cumplida | Revisión: el verificador no registra el token ni lo incluye en rechazos; solo cachea claves públicas en memoria |
| `PRIVV-10` despliegue real | Cumplida | Imagen `mdl-harness:local` reconstruida y contenedor recreado; el proceso arranca con `--patch /etc/mdl-harness/privileged-access.yml` y la capa queda montada en `/etc/mdl-harness/`; el bundle instalado contiene el verificador; `Configuración → Modelos` carga desde `https://dsh.devmedel.com`, agrega un modelo, lo guarda en el volumen y lo muestra tras recargar la página y tras `docker compose up -d --force-recreate` |

Nota de implementación: el esquema del Loader materializa un objeto anidado como `{}` cuando falta, lo que habría hecho fallar la carga de todo despliegue que no declara la extensión. La sección se declara como unión para que «no declarada» y «declarada vacía» sigan siendo distinguibles, y `node-half.host.spec.ts` fija ese comportamiento resolviendo la configuración por el esquema real.

## Resultado y pendientes

- Resultado: desplegado y validado. El plano privilegiado responde por el hostname público con la aserción de Access verificada, `Configuración → Modelos` carga, agrega un modelo de Ollama, lo guarda en el volumen conservando comentarios y valores por defecto, y lo mantiene tras recargar y tras recrear el contenedor. El usuario lo confirmó en `https://dsh.devmedel.com`.
- Pendientes o excepciones aceptadas: fuera de esta especificación, el modelo declarado todavía no está descargado en el host — `glm-5.3-flash:cloud` existe en el registro de Ollama pero no en la instancia, así que hay que traerlo con `ollama pull` antes de seleccionarlo.
- Decisión de salida: validada.
