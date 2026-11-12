# SPEC-034 — LSP como herramienta: medido y no montado

Estado: Rechazada
Fase: 34
Commit base: `8caa3e5584`
Aprobación para medir: usuario, 2026-11-12 — «retomemos lo abierto de la tanda 3», sobre la propuesta de medir latencia, memoria y utilidad antes de comprometer la fase.

## Objetivo

Decidir si conviene montar la familia LSP que el repositorio ya trae completa (`ctx.lsp`, `lsp-stdio`, `tool-lsp`), midiendo su costo y —sobre todo— si responde las preguntas que la motivaron, en lugar de asumirlo.

## Contexto

[SPEC-031](031-stack-herramientas-desarrollo.md) dejó la Tanda 3 como decisión abierta: es la única sin costo de imagen y la que más prometía, porque `grep` no distingue símbolos. El argumento medido entonces fue que `.resolve(` aparece 2 997 veces en 676 archivos y que "¿quién implementa `ctx.skills`?" es una pregunta cotidiana en un repositorio construido sobre costuras.

El experimento se hizo en un `DSH_HOME` aislado (`/tmp/dshhome3`) con un overlay que monta `lsp-stdio` (con `typescript-language-server@6.0.3`, 2,4 MB) y `tool-lsp`, sin tocar la imagen ni el despliegue. Para separar el costo del servidor de la utilidad de la herramienta, se midió primero el servidor directo por stdio y después el caso de uso real.

## Lo que se midió

Costo de ejecución, sobre este repositorio de 2 591 archivos TypeScript en 219 paquetes:

| Medición | Valor |
|---|---|
| `initialize` en frío | 132–152 ms |
| Primera consulta (carga del proyecto) | 1 268–1 367 ms |
| Consultas siguientes, mismo servidor | 8–112 ms |
| Memoria residente | 58 MB al arrancar, 67 MB tras cinco consultas |

Ese costo no es el problema: es barato y no crece con el repositorio como se temía.

La utilidad sí. `ToolDefinition` está declarado en `packages/core/tools/src/index.ts` y aparece **121 veces en 36 archivos**:

| Consulta | Resultado |
|---|---|
| `findReferences` con los 10 archivos del paquete abiertos | 25 referencias en 4 archivos |
| `findReferences` con el archivo consultado abierto (lo que hace `lsp-stdio`) | **16 referencias en 1 archivo** |
| La misma consulta, tres veces seguidas | 16, 16, 16 — no es arranque en frío |
| Con otros 9 archivos abiertos y luego cerrados | vuelve a **16 en 1 archivo** |
| `goToDefinition` de un tipo de otro paquete | `packages/core/tools/lib/types/index.d.ts` (**artefacto compilado**, no fuente) |
| `goToImplementation` sobre la costura `ctx.web` | el archivo de la interfaz, **no** el proveedor concreto |

La causa es el diseño del proveedor, no la configuración: `lsp-stdio` abre el documento consultado y lo cierra en `finally` (transient-open), y tsserver busca referencias **sólo entre los documentos cargados**. Cerrar los otros archivos devuelve el resultado a un solo archivo, así que el alcance de la herramienta es exactamente el archivo que consulta.

## Decisión

No se monta. Con el proveedor tal como está, `lsp` responde peor que las herramientas que ya existen: para "¿dónde se usa esto?" devuelve las referencias de un archivo donde `grep` devuelve 121 apariciones en 36, y para definiciones cruzadas manda al agente a `lib/types/*.d.ts`, que es salida de build.

Montarla igual habría costado barato en bytes y habría empeorado el trabajo, que es el error que esta medición existía para evitar.

## Condición para reabrirla

Dejaría de ser un "no" si cambian las dos cosas que la limitan, y ambas son trabajo de repositorio, no una fila de despliegue:

1. **Un proveedor que mantenga el proyecto cargado**, en lugar de abrir y cerrar un documento por consulta: mantener abiertos los archivos del paquete consultado, o calentar el programa del proyecto antes de responder.
2. **Selección de proyecto por cara** (`tsconfig.host.json` / `tsconfig.client.json`) y no por el `tsconfig` más cercano, para que las definiciones cruzadas aterricen en fuente y las implementaciones crucen paquetes.

Con eso, la validación sería la misma matriz de esta prueba: referencias de `ToolDefinition` (esperado ≥ 100 en decenas de archivos), definición cruzada apuntando a `src`, `goToImplementation` devolviendo proveedores concretos, y latencia y memoria dentro de lo ya medido.

## Validación ejecutada

Entorno: contenedor `mdl-harness`, 2026-11-12. `DSH_HOME` aislado en `/tmp/dshhome3`; `typescript-language-server@6.0.3` en `/tmp/lsptest` (2,4 MB). Nada de esto cambió la imagen ni el despliegue.

Comandos y su resultado, sin repetir las tablas de arriba:

| Comprobación | Evidencia |
|---|---|
| La composición monta la familia sin tocar la imagen | `--dump-config` con el overlay muestra las filas `lsp-stdio` y `tool-lsp` |
| El costo del servidor se midió por fuera del harness | Cliente JSON-RPC propio sobre stdio: `initialize`, `textDocument/references`, `textDocument/definition`, `textDocument/implementation`, con RSS leído de `/proc/<pid>/status` |
| El alcance de las referencias se aisló con tres configuraciones de apertura | un archivo, dos archivos, los diez del paquete, y de nuevo uno tras cerrar los otros nueve |
| No es un problema de arranque en frío | tres consultas idénticas seguidas |
| No es un problema de configuración | 219 de 219 paquetes tienen `tsconfig.json` |

## Resultado y pendientes

- Resultado: medido y no montado. El costo de ejecución de la familia LSP es despreciable; la utilidad con el proveedor actual es inferior a `grep` para el caso que la motivaba.
- Pendientes o excepciones aceptadas: queda documentado el trabajo que la haría útil (proveedor con proyecto cargado y selección por cara), con su matriz de validación lista.
- Decisión de salida: rechazada en esta forma; se conserva porque evita repetir un montaje que empeora el trabajo.
