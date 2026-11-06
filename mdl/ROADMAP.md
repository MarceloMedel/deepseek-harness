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
| 5 | Configuración, persistencia y seguridad | [SPEC-005](specs/005-config-persistence-security.md) | En implementación |
| 6 | Candidato reproducible en VPS | [SPEC-006](specs/006-reproducible-candidate.md) | Borrador |

## Dependencias

- La Fase 1 ya validó la base de compilación.
- La habilitación del flujo debe validar sus documentos y reglas antes de iniciar la Fase 2.
- La Fase 2 requiere aprobar `SPEC-002` antes de modificar código y termina con validación técnica y aprobación visual.
- La Fase 3 requiere una Fase 2 validada y termina con GUI, sesiones y agente operativos desde el fork.
- La Fase 4 parte del commit validado en Fase 3 y termina con el producto completo ejecutándose en Docker.
- La Fase 5 exige persistencia, separación de secretos y sandbox validado.
- La Fase 6 reproduce el candidato desde un clon limpio en el VPS.

## Próxima acción

`SPEC-005` está aprobada e implementándose en `change/005-config-persistence-security`: proveedor Ollama local, acceso por Cloudflare Access en `dsh.devmedel.com`, fix del sandbox Landlock, backup y restauración. La Fase 6 no inicia hasta validar restauración y aislamiento.

## Decisiones del despliegue VPS

Resueltas en `SPEC-005`: proveedor Ollama local (`deepseek-v4.1-flash:cloud`), acceso por Cloudflare Tunnel con Access email OTP, hostname `dsh.devmedel.com`, volúmenes Docker con backup diario externo, UID 1000 y límites de 4 CPU, 4 GiB y 512 procesos. La aplicación de Access ya está creada; falta el CNAME en el dashboard de Cloudflare.
