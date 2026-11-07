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

## Próxima acción

Las fases 1 a 11 están validadas y el fork se reproduce desde un clon limpio de `main` sin afectar la instancia viva. Las fases 15 y 16 se validaron sobre el despliegue HTTPS y llegaron a `main` por el PR #5. La Fase 9 se validó en un teléfono sobre la imagen reconstruida desde la rama `feat/mobile-shell`, y las fases 9, 10 y 11 llegaron a `main` por los PR #1, #2 y #3 del fork, con el agente empujando y abriendo el PR desde el contenedor. Queda por decidir si la interfaz móvil continúa con detalles, ajustes y aprobaciones como hoja a pantalla completa, y si se crea un tag local de release.

## Decisiones del despliegue VPS

Resueltas en `SPEC-005`: proveedor Ollama local (`deepseek-v4.1-flash:cloud`), acceso por Cloudflare Tunnel con Access email OTP en `dsh.devmedel.com`, volúmenes Docker con backup diario externo, UID 1000 y límites de 4 CPU, 4 GiB y 512 procesos.
