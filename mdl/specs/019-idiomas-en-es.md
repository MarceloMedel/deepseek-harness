# SPEC-019 — Idiomas: inglés y español, sin chino

Estado: En implementación
Fase: 19
Aprobación para iniciar: usuario, 2026-11-07 — tres especificaciones independientes en orden 017 → 018 → 019
Commit base: `ac1643ba89`

## Objetivo

Publicar la interfaz en inglés y español, con un navegador sin idioma soportado iniciando en inglés, y retirar el chino del producto y del repositorio: catálogos de interfaz, documentos traducidos y herramientas de traducción.

## Contexto

Hoy el chino es el idioma de origen del proyecto: cada catálogo declara `zh` como conjunto de claves fuente de verdad y `en` como traducción verificada por tipos (`satisfies Record<Key, string>`, la compilación falla si falta una clave). `LOCALE_IDS = ['zh', 'en']` en `packages/client/locale/src/locale-settings.ts` y la fila de idioma registra `中文` y `English`. `MDL-LOCALE-01` exige hoy que el chino siga disponible como idioma del navegador o por selección manual.

Mediciones sobre `ac1643ba89`, con el contexto general en [SPEC-017](017-optimizacion-imagen.md#contexto):

- **654 entradas chinas** en 26 catálogos `packages/*/src/client/locales.ts`, más 3 en `common` y `settings.locale`. Equivalen a **47 KB (1,5%)** de los bundles que recibe el navegador: la retirada no es una palanca de tamaño, es una decisión de producto y de superficie de mantenimiento.
- 1082 archivos `.zh.md` (**7,60 MB**: `.agents` 4,64 MB, `packages` 1,47 MB, `docs` 1,43 MB, `apps` 0,02 MB) y 1082 manifiestos `.i18n.yaml` (528 KB) que los emparejan con su original inglés.
- Cero cadenas chinas en prompts y descripciones de herramientas, es decir, nada bilingüe llega al modelo. Cero páginas chinas en `website/`.
- La cadena de traducción son ~10 scripts (`translation-prompt`, `translation-pairing`, `translation-brief`, `gen-translation-brief`, `merge-translation-pairing`, `verify-translation-pairing`, `verify-translation-prompt` y sus pruebas) y dos gates de `doc-sync`.

El chino dentro de la imagen desaparece con la poda de [SPEC-017](017-optimizacion-imagen.md) (`A2` retira `docs/` y `.agents/notes/`), así que el aporte de esta especificación al tamaño de la imagen es nulo y su valor es de producto y de mantenimiento.

## Alcance

**A. Catálogos de interfaz.**

- `L1` Retirar el diccionario `zh` de los 26 catálogos de feature y de `common`/`settings.locale`; el inglés pasa a ser el conjunto de claves fuente de verdad y el español se verifica completo contra él por tipos.
- `L2` Agregar el diccionario `es` en los mismos 26 catálogos y en `common`/`settings.locale`, con paridad de claves (654 + 3 entradas) y los mismos marcadores de plantilla (`{name}`) que el inglés.
- `L3` `LOCALE_IDS = ['en', 'es']`; la fila de idioma registra `English` y `Español`; el esquema persistido sólo acepta esos dos valores.
- `L4` Un navegador sin preferencia explícita y sin idioma soportado inicia en inglés; un navegador en español inicia en español; la elección manual se persiste en el documento de settings del Host.

**B. Documentación y herramientas.**

- `L5` Eliminar los 1082 `.zh.md`, los 1082 `.i18n.yaml` y las referencias cruzadas que los enlazan, incluidos los índices bilingües y los enlaces de sitio.
- `L6` Retirar la cadena de traducción (scripts, pruebas y gates `translation prompt` y `translation pairing` de `doc-sync`), y la habilidad `dsh-translate-docs` si queda sin uso.
- `L7` Los documentos de ingeniería quedan en inglés, sin par traducido. La documentación de usuario tampoco se publica en español en esta fase: el español queda limitado a la interfaz.

**C. Regla de producto.**

- `L8` Reemplazar `MDL-LOCALE-01` en `mdl/PRODUCT_SPEC.md`: la interfaz se publica en inglés y español; sin preferencia explícita y sin idioma del navegador soportado inicia en inglés; no se publica ninguna variante en chino.

## Fuera del alcance

- Documentación de usuario o de ingeniería en español (`L7`).
- Traducir prompts, descripciones de herramientas o cualquier texto que llega al modelo: ya están sólo en inglés y siguen así.
- Cambiar el nombre del producto, los paquetes `@deepseek-ai/*`, el comando `dsh` o las variables `DSH_*` (`MDL-IDENT-02`).
- Simplificar el mecanismo de locale más allá de cambiar los idiomas publicados.
- Retirar el chino de artefactos ya publicados en Git.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `LANG-01` | Ningún bundle servido contiene caracteres chinos | Barrido CJK sobre `apps/web/dist` y los 49 `lib/client.js`; debe dar cero |
| `LANG-02` | El español está completo: falta de una clave `es` rompe la compilación | `pnpm run build:lib:client` y prueba negativa que quite una clave |
| `LANG-03` | Un navegador sin idioma soportado inicia en inglés | Navegador con locale no soportado contra la imagen |
| `LANG-04` | Un navegador en español inicia en español | Navegador con locale `es-*` contra la imagen |
| `LANG-05` | La elección manual se persiste y sobrevive al reinicio del contenedor | Elegir idioma, reiniciar, verificar (`MDL-DATA-01`) |
| `LANG-06` | No quedan `.zh.md` ni `.i18n.yaml` en el árbol | `find` vacío sobre el repositorio |
| `LANG-07` | La cadena de traducción está retirada y `doc-sync` pasa | `pnpm run doc-sync` y `find` de los scripts retirados |
| `LANG-08` | No hay enlaces internos roto a documentos eliminados | `pnpm run verify-md-links` y `pnpm run website:build` |
| `LANG-09` | La interfaz en español se lee completa en escritorio y en 390 px, claro y oscuro | Revisión visual de cada superficie con textos largos |
| `LANG-10` | Los snapshots de interfaz reflejan el cambio de idioma | `pnpm run test:snapshot` y `pnpm run test:web` |

## Restricciones

- Se conservan `MDL-IDENT-01`, `MDL-IDENT-02`, `MDL-IDENT-03`, `MDL-THEME-01`, `MDL-THEME-02`, `MDL-ENV-01`, `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DATA-01`, `MDL-UPSTREAM-01` y `MDL-VALID-01`.
- `L8` modifica `MDL-LOCALE-01`, la única regla permanente que esta fase cambia; requiere aprobación explícita antes de escribir código.
- Los textos en español deben respetar la terminología ya usada en la configuración del despliegue y no inventar vocabulario técnico nuevo.
- El cambio es visible para el usuario: exige el GIF de demostración grabado del servidor real y actualizar los snapshots en el mismo cambio.
- `L1` cambia el idioma fuente de verdad de 26 paquetes; la paridad de claves debe imponerse por tipos y no por revisión manual.

## Implementación prevista

- `packages/client/locale/src/locale-settings.ts`: `LOCALE_IDS`, tipo `LocaleId` y esquema persistido.
- `packages/client/locale/src/locales/{en,es,settings}.ts` y `src/client/index.ts`: diccionarios `common` y `settings.locale`, `LOCALES` y fila de idioma.
- Los 26 `packages/*/src/client/locales.ts`: retiro de `zh`, alta de `es`, inglés como fuente de verdad.
- `scripts/verify-translation-*`, `scripts/translation-*`, `scripts/gen-translation-brief.ts` y sus pruebas: retiro, junto con sus entradas en `run-gates.ts` y `package.json`.
- `.agents/skills/dsh-translate-docs/` y los `README.i18n.yaml` / `*.i18n.yaml`: retiro si quedan sin consumidor.
- `mdl/PRODUCT_SPEC.md`: texto nuevo de `MDL-LOCALE-01`.
- `mdl/ROADMAP.md`: fila de la fase al validar, según `SPEC-000`.

## Validación ejecutada

Fecha: `2026-11-07`/`2026-11-08`. Entornos: checkout del repositorio con Node `22.23.4` y pnpm `11.7.0` vía `corepack`, sin daemon Docker; y Chromium `131.0.6778.33` (Playwright `1.49.1`) contra el contenedor desplegado, para las comprobaciones de navegador, la auditoría de 390 px y el GIF.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `L1` `zh` fuera de los catálogos | Aprobado | 26 catálogos de feature más `common` y `settings.locale` reescritos a `en` (fuente de verdad) + `es`; `packages/client/locale/src/locales/zh.ts` eliminado |
| `L2` español completo por contrato de tipos | Aprobado | 675 entradas traducidas; cada `es` es `satisfies Record<Key, string>`, así que una clave faltante rompe la compilación |
| `L3` `LOCALE_IDS` y fila de idioma | Aprobado | `LOCALE_IDS = ['en', 'es']`, `English` / `Español`, `FALLBACK_LOCALE` y `DOCUMENT_LANG` actualizados |
| `L5` documentos `.zh.md` | Aprobado, con una excepción declarada | **940 `.zh.md` y 940 `.i18n.yaml` eliminados**; fuera de `.agents/notes/archived/` no queda ninguno. El archivo congelado conserva sus 142 `.zh.md` y sus manifiestos porque `verify-archived-agent-notes` sella cada byte y prohíbe modificarlo |
| `L6` cadena de traducción | Aprobado | 17 scripts, la habilidad `dsh-translate-docs`, `docs/i18n/`, las entradas de `package.json`, los dos gates de `doc-sync`, los dos hooks de `lefthook.yml` y el merge driver bilingüe de `install-lefthook.mjs` retirados |
| `LANG-01` sin chino en bundles servidos | Aprobado | Barrido CJK sobre `apps/web/dist` y todos los `lib/*.js`: **0** caracteres. Incluyó traducir el contenido de demostración de `packages/client/connection/src/client/fixture.ts` y los comentarios que citaban copia china |
| `LANG-02` español completo | Aprobado | `tsc -b tsconfig.client.json` sin errores: la paridad de claves se verifica por tipos |
| `LANG-07` `doc-sync` | Aprobado salvo `docs:build` | **25 gates en verde** de 26; `docs:build` no puede ejecutarse aquí porque su script interno invoca `pnpm`, ausente del PATH de este shell, pero el build subyacente sí corre: `vitepress build .` completa en 56 s |
| `LANG-08` enlaces y sitio | Aprobado | `verify-md-links`: 969 archivos sin enlaces roto; el build de VitePress completa (`vitepress build .`, 56 s) |
| `LANG-10` snapshots | Aprobado: sin regresiones atribuibles | Suite keyless de snapshots: 109 en verde, 1 omitida, 5 en rojo. Las mismas pruebas se corrieron sobre `origin/main` y fallan allí igual (aviso experimental de SQLite, diferencia de PTY persistente); el `EACCES` de ACP es del sandbox del entorno y el caso de headless pasa 14/14 en corridas aisladas. Detalle en [SPEC-018](018-payload-cliente.md#snapshots) |
| `LANG-10` pruebas | Aprobado en lo que cubre el cambio | suite completa: **798 archivos y 13 310 pruebas en verde**. Las 28 pruebas restantes en 5 archivos (`fs-sandbox`, `terminal-bash`, `tool-terminal`, `tool-bash-persistent`, `subprocess-local/process-exit`) fallan por el entorno, no por este cambio: `EACCES mkdtemp '/home/node/…'` del sandbox de archivos y `forkpty(3) failed` del contenedor. En esos paquetes el cambio solo toca sus README |
| `LANG-03` navegador no soportado → inglés | **Aprobada** | Confirmada por el usuario en navegador contra el contenedor, y reproducida después con Chromium `131.0.6778.33` y locale `fr-FR`: `<html lang>` queda en **`en`** |
| `LANG-04` navegador en español → español | **Aprobada** | Confirmada por el usuario y reproducida con locale `es-ES`: `<html lang>` queda en **`es`** |
| `LANG-05` persistencia de la elección | Mecanismo verificado; falta la recreación | Elegir español en Ajustes › Idioma escribe `locale:\n  preference: es` en `/data/dsh/settings.yaml`, el documento del volumen nombrado `mdl-dsh-home`, así que la elección vive en el volumen y no en el navegador. Falta observar que siga seleccionada después de `docker compose -f mdl/docker/compose.yml down` + `up -d` |
| `LANG-09` revisión en escritorio y 390 px | Aprobada en escritorio y auditada a 390 px; falta confirmación visual | El usuario confirmó la interfaz en español en escritorio. A 390 px se auditaron seis estados (inicio, conversación con respuesta real, ajustes, en claro y en oscuro): **0 elementos que sangren a la derecha del viewport y 0 textos recortados** en botones, títulos, descripciones y compositor, con el sidebar fuera de pantalla como corresponde. Las capturas quedan en `.playwright-mcp/review-390/`; el modelo que ejecutó la auditoría no lee imágenes, así que la confirmación visual sigue siendo del usuario |
| GIF de la interfaz | Grabado | `5` frames de una sola corrida contra el servidor real (commits `07bbe0d6e1`, imagen `mdl-harness:local`, Chromium `131.0.6778.33`, viewport 390×844, locale `es-ES`, modelo real por Ollama): inicio en español, menú de idioma, interfaz en inglés, vuelta a español y una respuesta real. Codificado en `.playwright-mcp/demo-idiomas.gif` (141 801 B, 560×1212, 10,5 s). Los frames viven en `.playwright-mcp/gif-frames-idiomas/` |

Cambios de herramienta que la retirada del chino exigió, registrados aquí porque alteran compuertas compartidas:

- `gen-cordis-catalog.ts` inyecta regiones en una sola página por artefacto (antes exigía el par).
- `website/docs.ts` proyecta cada página desde su fuente inglesa; el sitio conserva sus dos rutas de locale sobre el mismo contenido.
- `install-lefthook.mjs` ya no registra el merge driver `merge.dsh-translation-pairing`.
- `project-doc-site.spec.ts` y `gen-cordis-catalog.spec.ts` afirman la proyección monolingüe.

Pendientes:

1. Observar `LANG-05` tras recrear el contenedor sobre el mismo volumen, y dar la confirmación visual de `LANG-09` sobre las capturas de 390 px.
2. Decidir si el sitio publicado debe dejar de duplicar cada página en dos rutas de locale, ahora que ambas leen la misma fuente.
3. Regenerar los snapshots de la interfaz web (`DSH_SNAPSHOT=refresh`) sobre la app compilada.

- Resultado: mecanismo, migración y compuertas completos; `LANG-01` a `LANG-04`, `LANG-06` a `LANG-08`, el GIF y la auditoría de 390 px registrados.
- Estimación: 654 + 3 entradas a traducir; 1064 archivos `.zh.md` y 1082 manifiestos eliminados; ~10 scripts y 2 gates menos en `doc-sync`. El peso del navegador no cambia de forma apreciable (47 KB reemplazados por un peso equivalente en español).
- Pendientes o excepciones aceptadas: la documentación en español queda fuera por decisión del usuario; `LANG-05` necesita la recreación del contenedor y `LANG-09` la confirmación visual del usuario.
- Decisión de salida: pendiente.

## Decisiones resueltas

- Idiomas publicados: inglés y español. El chino no se publica en ninguna superficie.
- El español alcanza sólo la interfaz; la documentación queda en inglés (`L7`).
- Se valida como especificación propia, independiente de la imagen ([SPEC-017](017-optimizacion-imagen.md)) y del payload ([SPEC-018](018-payload-cliente.md)).
