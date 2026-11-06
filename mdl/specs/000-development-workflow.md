# SPEC-000 — Flujo ligero de Spec-Driven Development

Estado: Validada
Fase: transversal
Commit base: `15148dbd9a1d1f1ef1a26e5749b32af0cd663935`

## Objetivo

Establecer un proceso mantenible para un desarrollador y agentes, con reglas permanentes, una especificación por cambio y validación posterior al desarrollo, sin introducir herramientas de gestión ni documentos obligatorios redundantes.

## Alcance

- Contrato de producto y desarrollo en `mdl/PRODUCT_SPEC.md`.
- Roadmap reducido a orden, dependencias y estado.
- Plantilla única de especificación.
- Registro retrospectivo de la base validada.
- Especificación de branding en Borrador.
- Referencia breve desde el `AGENTS.md` del repositorio.

## Fuera del alcance

- Implementar la personalización visual de la Fase 2.
- Modificar código de aplicación, pruebas de runtime o Docker.
- Adoptar un framework externo de especificaciones.
- Añadir aprobaciones de equipo, CODEOWNERS, gestión de épocas o seguimiento de subtareas.
- Crear especificaciones vacías para fases que todavía no se aprueban.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `SDD-01` | Las reglas permanentes tienen IDs y una única ubicación | Revisión de `PRODUCT_SPEC.md` |
| `SDD-02` | Cada cambio puede definir alcance, exclusiones, requisitos y evidencia con una plantilla | Revisión de `TEMPLATE.md` |
| `SDD-03` | El roadmap enlaza las especificaciones sin duplicar sus criterios | Revisión y enlaces |
| `SDD-04` | Los agentes reciben una referencia obligatoria al contrato y a la especificación activa | Revisión de `AGENTS.md` |
| `SDD-05` | La Fase 1 conserva su evidencia histórica real y la Fase 2 permanece sin implementar | Revisión de specs y diff |
| `SDD-06` | La documentación y los enlaces superan las comprobaciones del repositorio | `corepack pnpm run doc-sync` |
| `SDD-07` | Los archivos nuevos no contienen secretos ni errores de whitespace | Búsqueda y validación de archivos |

## Implementación prevista

Crear el directorio `mdl/`, incorporar los documentos descritos y mantener el límite de palabras de `AGENTS.md` alineado con la única regla añadida. No modificar código fuente de `apps/` o `packages/`.

## Validación ejecutada

Fecha: `2026-11-06T10:29:12-0300`
Entorno: macOS 15.7.7, arm64; Node `22.23.2`; pnpm `11.7.0`

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `corepack pnpm run doc-sync` | Exitosa | 28 comprobaciones aprobadas, 0 fallidas y 0 omitidas |
| Enlaces relativos dentro de `mdl/` | Exitosa | Seis archivos Markdown revisados; todos los destinos existen |
| Nueva línea final y whitespace | Exitosa | Seis archivos revisados; `git diff --check` también terminó sin errores |
| Presupuesto de `AGENTS.md` | Exitoso | 1.932 palabras frente al límite de 1.940; `doc-sync` validó el presupuesto |
| Búsqueda de secretos | Sin coincidencias | Patrones de tokens y claves privadas buscados en `mdl/` y `AGENTS.md` |
| Revisión del diff y ausencia de cambios en aplicación | Exitosa | Solo cambian `AGENTS.md`, su presupuesto documental y los seis archivos de `mdl/`; no hay cambios en `apps/` o `packages/` |

## Resultado y pendientes

- Resultado: **Validada**.
- Pendientes: ninguno en esta especificación.
- Decisión de salida: aprobada; la Fase 2 permanece en Borrador hasta aprobar `SPEC-002`.
