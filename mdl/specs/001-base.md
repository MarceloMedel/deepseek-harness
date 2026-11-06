# SPEC-001 — Fork y base reproducible

Estado: Validada
Fase: 1
Tipo: registro retrospectivo de trabajo validado antes de adoptar el flujo de especificaciones
Commit base: `15148dbd9a1d1f1ef1a26e5749b32af0cd663935`

## Objetivo

Crear una base personal trazable de DeepSeek Harness `0.1.0-rc.6` que instale dependencias, compile y ejecute el CLI sin modificar la instalación global.

## Alcance realizado

- Fork en `MarceloMedel/deepseek-harness`.
- Clon en `~/projects/dsh-personal`.
- Rama `mdl-harness` fijada en el commit de publicación de `0.1.0-rc.6`.
- `origin` dirigido al fork y `upstream` al repositorio oficial.
- Instalación y build sin personalización.
- Comprobación del CLI y de artefactos principales.

## Fuera del alcance

- Personalización visual.
- Ejecución integrada de la GUI del fork o de un agente.
- Docker, migración de datos y cambios de seguridad.
- Corrección de advertencias preexistentes de upstream.

## Requisitos y resultado

| ID | Requisito | Resultado |
|---|---|---|
| `BASE-01` | La versión base corresponde al DSH instalado | Ambos reportan `0.1.0-rc.6` |
| `BASE-02` | La base usa una toolchain compatible | Node `22.23.2`; pnpm `11.7.0` mediante Corepack |
| `BASE-03` | Las dependencias se instalan sin cambiar el lockfile | `corepack pnpm install --frozen-lockfile` terminó con código 0 |
| `BASE-04` | La aplicación compila | `corepack pnpm run build` terminó con código 0 |
| `BASE-05` | El CLI del fork ejecuta | `corepack pnpm dsh --version` reportó `0.1.0-rc.6` |
| `BASE-06` | El trabajo no degrada el DSH actual | La instalación global respondió `0.1.0-rc.6` y `127.0.0.1:3080` devolvió HTTP 200 |

## Validación ejecutada

Fecha: `2026-11-06T09:43:14-0300`
Entorno: macOS 15.7.7, arm64
Git: `2.39.5`

| Comprobación | Resultado |
|---|---|
| Instalación con lockfile congelado | Exitosa |
| Build Host, Client, bundles y frontend Web | Exitoso |
| CLI desde el fork | Exitoso |
| `apps/cli/lib/bin.js` | Existe |
| `apps/web/dist/index.html` | Existe |
| Binarios de ejemplos ACP y JSON-RPC | Existen después del build |
| Estado Git posterior al build | Sin cambios en archivos versionados |
| Identidad Git | Resuelta desde la configuración de `~/projects/**`, sin sobrescrituras por comando |
| Cuenta GitHub | `MarceloMedel`, seleccionada por el usuario y verificada para HTTPS |

No se ejecutó la suite completa de tests. El repositorio exige seleccionar comprobaciones acotadas y reserva la cobertura exhaustiva para CI. La ejecución integrada de la GUI y del agente pertenece a una fase posterior.

## Advertencias de la base

- pnpm informó dependencias cíclicas de workspace y paquetes Linux no aplicables al host macOS arm64.
- Los avisos de binarios de ejemplos durante la instalación desaparecieron como problema de artefactos cuando el build generó los archivos `lib/` correspondientes.
- tsdown informó opciones deprecadas y tiempos de plugins.
- Vite informó chunks de más de 500 kB.

Ninguna advertencia interrumpió las comprobaciones ejecutadas. No se modificó upstream para resolverlas.

## Resultado y pendientes

- Resultado: **Validada**.
- Pendientes de esta especificación: ninguno.
- La validación funcional de GUI, sesiones y agente no forma parte de este registro y permanece pendiente en el roadmap.
