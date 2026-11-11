# MDL-HARNESS — roadmap

Este documento define orden, dependencias y estado. Las reglas permanentes y el proceso pertenecen a [PRODUCT_SPEC.md](PRODUCT_SPEC.md); el alcance y la evidencia de cada cambio pertenecen a su especificación en [specs/](specs/).

## Secuencia

| Fase | Objetivo | Especificación | Estado |
|---|---|---|---|
| Transversal | Habilitar el flujo Spec-Driven Development | [SPEC-000](specs/000-development-workflow.md) + [plantilla](specs/TEMPLATE.md) | Validada |
| 1 | Fork y base reproducible | [SPEC-001](specs/001-base.md) | Validada |
| 2 | Nombre, colores e icono | [SPEC-002](specs/002-branding.md) | Validada |
| 3 | Ejecución local integrada | [SPEC-003](specs/003-local-runtime.md) | Validada |
| 4 | Imagen y ejecución Docker | [SPEC-004](specs/004-docker.md) | Validada |
| 5 | Configuración, persistencia y seguridad | [SPEC-005](specs/005-config-persistence-security.md) | Validada |
| 6 | Candidato reproducible en VPS | [SPEC-006](specs/006-reproducible-candidate.md) | Validada |
| 7 | Proyectos del host como workspace | [SPEC-007](specs/007-host-projects-workspace.md) | Validada |
| 8 | Credencial git para pipay-sii | [SPEC-008](specs/008-git-deploy-key.md) | Validada (credencial retirada en la Fase 11) |
| 9 | Shell móvil para el teléfono | [SPEC-009](specs/009-mobile-shell.md) | Validada |
| 10 | Credencial de GitHub para push y PR | [SPEC-010](specs/010-github-pr-credential.md) | Validada |
| 11 | Identidad git genérica por token HTTPS | [SPEC-011](specs/011-git-config-file.md) | Validada |
| 12 | Operar el agente desde el teléfono | [SPEC-012](specs/012-mobile-agent-surfaces.md) | En implementación |
| 14 | Instalar la interfaz en la pantalla de inicio del iPhone | [SPEC-014](specs/014-instalacion-ios.md) | En implementación |
| 15 | Conversación compacta con detalle a demanda | [SPEC-015](specs/015-conversacion-compacta.md) | Validada |
| 16 | Densidad de la conversación elegible | [SPEC-016](specs/016-densidad-conversacion.md) | Validada |
| 17 | Optimización de la imagen Docker | [SPEC-017](specs/017-optimizacion-imagen.md) | En implementación |
| 18 | Payload del cliente web y móvil | [SPEC-018](specs/018-payload-cliente.md) | En implementación |
| 19 | Idiomas: inglés y español, sin chino | [SPEC-019](specs/019-idiomas-en-es.md) | En implementación |
| 20 | Diferir el chunk `vendor` del primer render | [SPEC-020](specs/020-diferir-chunk-vendor.md) | Aprobada |
| 21 | Bundles de plugin: lo que se descarga antes de usarlo | [SPEC-021](specs/021-bundles-de-plugin.md) | En implementación |
| 22 | Visor de Markdown dentro de la GUI | [SPEC-022](specs/022-visor-markdown.md) | En implementación |
| 23 | Visor de HTML generado dentro de la GUI | [SPEC-023](specs/023-visor-html.md) | Validada |
| 24 | Plano privilegiado autenticado desde el hostname público | [SPEC-024](specs/024-plano-privilegiado-autenticado.md) | Validada |
| 25 | Archivos adjuntos en la conversación | [SPEC-025](specs/025-archivos-adjuntos-conversacion.md) | En implementación |
| 26 | Herramientas externas reproducibles: búsqueda multi-proveedor y MCP de Neon | [SPEC-026](specs/026-herramientas-externas-reproducibles.md) | Validada |
| 27 | Índice de código consultable por el agente (graphify) | [SPEC-027](specs/027-indice-de-codigo-graphify.md) | Validada |
| 28 | SearXNG como motor de búsqueda del despliegue | [SPEC-028](specs/028-searxng-como-motor-de-busqueda.md) | Validada |
| 29 | Búsqueda web propia: cadena lite sin bundle de terceros | [SPEC-029](specs/029-busqueda-web-lite.md) | Validada |

## Dependencias

- La Fase 1 ya validó la base de compilación.
- La habilitación del flujo debe validar sus documentos y reglas antes de iniciar la Fase 2.
- La Fase 2 requiere aprobar `SPEC-002` antes de modificar código y termina con validación técnica y aprobación visual.
- La Fase 3 requiere una Fase 2 validada y termina con GUI, sesiones y agente operativos desde el fork.
- La Fase 4 parte del commit validado en Fase 3 y termina con el producto completo ejecutándose en Docker.
- La Fase 5 exige persistencia, separación de secretos y sandbox validado.
- La Fase 6 reproduce el candidato desde un clon limpio en el VPS.
- La Fase 9 parte del commit validado de la Fase 8 y termina con la interfaz usable desde un teléfono de 390 px de ancho.
- La Fase 12 completa la interfaz móvil de la Fase 9 con el detalle de una llamada y las tarjetas de aprobación y pregunta.
- La Fase 13 queda reservada para ajustes a pantalla completa y el bloque contenedor que rompe los paneles fijos en móvil.
- La Fase 14 parte de la Fase 9 validada y agrega metadatos de instalación sin tocar la composición; se valida en el teléfono sobre el hostname público.
- La Fase 10 parte del commit validado de la Fase 9 y termina con el agente capaz de empujar una rama y abrir un PR sin que la credencial entre en la imagen, el repositorio o la sesión.
- La Fase 15 no depende de una fase anterior: cambia solo la presentación de la conversación y conserva el detalle en las superficies que ya existen.
- La Fase 16 parte de la Fase 15: convierte su comportamiento único en una preferencia de tres niveles sobre la misma presentación.
- Las fases 17, 18 y 19 son independientes entre sí y se validan por separado: 17 reduce la imagen, 18 el payload del navegador y 19 los idiomas publicados.
- Las fases 20 y 21 nacen de los dos objetivos que la fase 18 no cumplió y se validan por separado: 20 saca el chunk `vendor` de la ruta crítica del primer render, y 21 reduce los bundles de plugin que el arranque descarga.
- La Fase 22 no depende de una fase anterior: agrega una superficie nueva por el mismo mecanismo que `dsh-html-preview` y se valida sobre el contenedor reiniciado.
- La Fase 23 parte de la Fase 22 validada: reemplaza la copia no versionada del visor de HTML por un bundle del repositorio con fila en el perfil `web`, retira el preset `html-preview` y se valida sobre el contenedor reiniciado.
- La Fase 24 relaja la restricción que `SPEC-005` dejó explícitamente fuera de alcance, y solo puede hacerlo con una especificación propia y validación de seguridad (`MDL-SEC-02`): el plano privilegiado se habilita en el hostname público únicamente con una aserción de Cloudflare Access verificada dentro del proceso. No depende de otra fase y no cambia el comportamiento por defecto.
- La Fase 25 no depende de una fase anterior y no modifica paquetes de upstream: agrega el botón, el arrastre y el extractor por el mecanismo de `SPEC-022` y `SPEC-023`, y se valida sobre el contenedor reiniciado.

## Próxima acción

Las fases 1 a 11 están validadas y el fork se reproduce desde un clon limpio de `main` sin afectar la instancia viva. Las fases 15 y 16 se validaron sobre el despliegue HTTPS y llegaron a `main` por el PR #5. La Fase 9 se validó en un teléfono sobre la imagen reconstruida desde la rama `feat/mobile-shell`, y las fases 9, 10 y 11 llegaron a `main` por los PR #1, #2 y #3 del fork, con el agente empujando y abriendo el PR desde el contenedor. Queda por decidir si la interfaz móvil continúa con detalles, ajustes y aprobaciones como hoja a pantalla completa, y si se crea un tag local de release.

La Fase 22 está desplegada y en uso: el lector abre los documentos del workspace desde el escritorio y el teléfono, y las tres correcciones del uso real llegaron a `main` por los PR #10 y #11. Quedan sin ejercitar el salto desde el índice, la memoria de lectura, la tarjeta de `md_preview` en una conversación real y la observación tras recrear el contenedor.

La Fase 23 está validada: el visor de HTML vive en el repositorio y en el volumen, el usuario lo confirmó tras reiniciar el contenedor en escritorio y en el teléfono, y el uso real cerró los tres defectos de la pantalla completa (sin salida, marco sin pintar y documento cortado por desplazamiento anidado). Queda como observación una llamada real del agente a `html_preview`.

La Fase 24 está validada: el plano privilegiado de configuración responde en `dsh.devmedel.com` con la aserción de Cloudflare Access verificada dentro del proceso, la página Modelos carga y guarda desde el teléfono y el escritorio, el modelo agregado sobrevive a la recarga y a la recreación del contenedor, y sin `DSH_ACCESS_AUD` el despliegue queda exactamente como antes. Fuera de la fase queda descargar `glm-5.3-flash:cloud` en el host antes de seleccionarlo.

La Fase 25 está desplegada y validada dentro de un proceso real —la imagen publica el paquete en cada arranque y `read_document` responde en las sesiones—: `mdl/plugins/chat-files` aporta el botón de clip, el arrastre sobre la página, el depósito de los archivos en `.dsh-uploads/` del workspace con su referencia en el borrador, los extractores de PDF, DOCX y XLSX, y deja las imágenes en el carril existente. `check.mjs` pasa sus 58 comprobaciones, `--dump-config` compone la fila y una instancia aislada en el puerto 3099 sirvió el bundle y aceptó una carga real; un agente headless leyó un PDF depositado con `read_document`. Queda ejercitar la GUI en escritorio y teléfono. Para que las imágenes lleguen al modelo hay que declarar `input: [text, image]` en `gemma4:cloud` o `glm-5.3-flash:cloud`, que informan visión y aceptaron una imagen por el endpoint; el despliegue sigue declarando `[text]`.

La Fase 26 está validada: las herramientas externas se reproducen desde la imagen. La búsqueda multi-proveedor y el MCP de Neon se publican con el `entrypoint`, la clave de Neon entra por un montaje de sólo lectura que el overlay lee al activar la fila —nunca un valor de entorno, nunca en el volumen—, y el rol `mdl_reader` limita la escritura en la base. El catálogo pasó de 35 a 86 herramientas. Queda fuera de la fase el modo de escritura de Neon y sustituir el motor de búsqueda, que hicieron las fases 28 y 29.

La Fase 27 está validada: el índice de código de `graphify` viaja en la imagen (`graphifyy[mcp]`, con el extra obligatorio), el `entrypoint` aplica su overlay cuando el binario existe y el grafo por defecto es una ruta inexistente a propósito, de modo que una consulta sin `project_path` falla en voz alta en lugar de responder por otro proyecto. El catálogo llegó a 97 herramientas y el grafo de `pipay-sii` declara su propia antigüedad contra el `HEAD` del repositorio.

La Fase 28 está validada: SearXNG corre como servicio propio del compose, sin puertos publicados, con `formats: [html, json]` y una lista de motores medida. `google cse` es el que sostiene la cobertura general —160 de 160 resultados en la prueba— y `bing` quedó fuera al devolver resultados ajenos a la consulta. Su respaldo por el que respondía la fase fue retirado con el bundle en la Fase 29.

La Fase 29 está validada: `web_search` lo sirve un proveedor del repositorio con la cadena fija SearXNG → Tavily → Bing → Brave, sin bundle de terceros. El eslabón que falla se omite 30 s, el error nombra a cada eslabón con su motivo y el eslabón raspado exige que la fuente mencione la consulta. Degradación probada con el motor inalcanzable: 2 573 ms en el primer intento y 37 ms en el segundo, con Tavily respondiendo en ambos.

## Decisiones del despliegue VPS

Resueltas en `SPEC-005`: proveedor Ollama local (`deepseek-v4.1-flash:cloud`), acceso por Cloudflare Tunnel con Access email OTP en `dsh.devmedel.com`, volúmenes Docker con backup diario externo, UID 1000 y límites de 4 CPU, 4 GiB y 512 procesos.
