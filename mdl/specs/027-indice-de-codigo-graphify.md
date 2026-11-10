# SPEC-027 — Índice de código consultable por el agente (graphify)

Estado: Aprobada
Fase: 27
Commit base: `f05d96d79f`
Aprobación para iniciar: usuario, 2026-11-10 — «go with graphify», tras el preflight que fija la versión, el conjunto de herramientas y el comportamiento sin grafo por defecto

## Objetivo

Que el agente pueda consultar el grafo de conocimiento de un repositorio del host —nodos, vecinos, comunidades, caminos y estadísticas— mediante un servidor MCP que viaja en la imagen, sin pedir credenciales y sin que una sesión de otro repositorio reciba respuestas del proyecto equivocado.

## Contexto

`graphify` es la única pieza de `VPS.md` que quedó sin resolver después de `SPEC-026`. Su binario no está en la imagen porque `SPEC-017` lo retiró con la justificación «sin consumidor en la ruta del agente»; esta fase le da ese consumidor. En el host ya existe un grafo real: `/srv/projects/pipay-sii/graphify-out/graph.json`, 741 nodos, 1 525 aristas y 36 comunidades, construido sobre el commit `38978fc7`.

Preflight ejecutado el 2026-11-10 en el contenedor, antes de escribir el `Dockerfile`:

- `uv tool install "graphifyy[mcp]==0.9.91"` instala dos ejecutables, `graphify` y `graphify-mcp`, sobre el `python3` del sistema con `UV_PYTHON_DOWNLOADS=never`. Sin el extra `[mcp]` el servidor arranca y muere con `ModuleNotFoundError: No module named 'mcp'`, así que el extra es parte de la versión, no un detalle.
- El servidor publica **10 herramientas y 6 243 bytes**: `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, `list_prs`, `get_pr_impact`, `triage_prs`. Habla `2025-06-18` e informa `serverInfo` `{"name":"graphify","version":"0.9.91"}`.
- Las diez aceptan un `project_path` opcional además de sus propios argumentos, así que el grafo por defecto puede ser inerte.
- Con un grafo por defecto inexistente, toda llamada sin `project_path` responde `graph.json not found: <ruta>`; con `project_path=/srv/projects/pipay-sii` responde los datos del proyecto y añade el aviso de frescura (`Built at commit 38978fc7… HEAD is 2f1e00c…`). Es exactamente el comportamiento que `VPS.md` pedía: fallar fuerte antes que responder del proyecto equivocado.

## Alcance

- `GFY-01` La imagen de runtime instala `graphifyy[mcp]` en una versión fijada, con sus ejecutables en `/usr/local/bin`, sin descargar un intérprete de Python.
- `GFY-02` La fila del servidor vive en un overlay de la imagen (`mdl/docker/graphify-mcp.yml`), con `transport: stdio` y `serverName: graphify`, y el entrypoint la aplica sólo si el ejecutable existe.
- `GFY-03` El grafo por defecto es una ruta inexistente declarada como tal, de modo que una consulta sin `project_path` falla con un mensaje que nombra el archivo; ninguna sesión recibe datos de otro repositorio.
- `GFY-04` El costo del catálogo queda medido: 10 herramientas y 6 243 bytes, y el catálogo total del despliegue después de la fase.
- `GFY-05` La frescura del grafo queda declarada: el servidor compara el commit del grafo con `HEAD` del proyecto, y el despliegue documenta que reconstruirlo es una acción del operador.

## Fuera del alcance

- Construir grafos automáticamente. `graphify` los construye fuera del contenedor y el agente sólo los consulta.
- Un servidor por repositorio o un selector de grafo por sesión: el MCP no lo soporta y el `project_path` por consulta ya lo cubre.
- Las tres herramientas de PR (`list_prs`, `get_pr_impact`, `triage_prs`) más allá de comprobar que se publican: su uso depende de `gh` y del token ya montado por `SPEC-010`.
- Cambiar el grafo por defecto a un proyecto concreto: es justo el error que `GFY-03` evita.
- Instalar el paquete `graphify` (CLI) en el volumen o permitir que el agente reconstruya grafos.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `GFY-01` | El ejecutable existe en la imagen y no depende de un Python descargado | `docker run --rm mdl-harness:local graphify-mcp --help` y revisión del `Dockerfile`: una sola invocación de `uv tool install` con la versión y el extra fijados |
| `GFY-02` | La composición monta la fila cuando el ejecutable existe y no la monta cuando falta | `--dump-config` con y sin el overlay; y el log del entrypoint, que informa si aplicó o no el parche |
| `GFY-03` | Una consulta sin `project_path` falla y una con `project_path` responde datos de ese proyecto | Llamada `graph_stats` sin `project_path` → `graph.json not found`; con `project_path=/srv/projects/pipay-sii` → 741 nodos |
| `GFY-04` | El catálogo total queda registrado | Medición desde el log de sesión y `tools/list` del servidor: 10 herramientas / 6 243 bytes propios |
| `GFY-05` | El aviso de frescura es visible | `graph_stats` con `project_path` informa el commit del grafo y el `HEAD` del proyecto |

## Restricciones

- Se conservan `MDL-SEC-01`, `MDL-SEC-02`, `MDL-DOCKER-01`, `MDL-DOCKER-02`, `MDL-DATA-01`, `MDL-IDENT-02` y `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- `MDL-SEC-02`: el servidor no abre puertos ni transportes de red; habla stdio con el proceso que lo lanza. Las herramientas de PR usan `gh`, que ya opera con el token montado.
- La versión de `graphifyy` se fija con el extra `[mcp]` incluido; una instalación sin extra arranca y muere, así que la dependencia forma parte del requisito.
- El servidor se lanza con el `python3` de la imagen: no se descarga ningún intérprete durante la build.
- La ruta por defecto es deliberadamente inerte; cambiarla por un proyecto concreto queda prohibido por `GFY-03` y no es una decisión de despliegue.

## Implementación prevista

- `mdl/docker/Dockerfile`: instalación fijada de `graphifyy[mcp]` en la etapa de runtime, con los directorios de `uv` fuera del volumen y permisos de lectura para el usuario `node`.
- `mdl/docker/graphify-mcp.yml`: overlay con la fila `graphify`.
- `mdl/docker/entrypoint.sh`: aplicación condicionada del overlay.
- `mdl/docker/README.md`: sección de herramientas externas, con la ruta inerte y la reconstrucción del grafo.
- `mdl/ROADMAP.md`: fila de la fase al validar.

## Validación ejecutada

Ejecutada el 2026-11-10 en el contenedor, sobre el árbol de fuentes y con el paquete instalado en un directorio de herramientas del workspace:

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `GFY-01` instalación fijada | Cumplido en el espacio de trabajo | `uv tool install "graphifyy[mcp]==0.9.91"` produce `graphify` y `graphify-mcp`; sin `[mcp]` el servidor muere con `ModuleNotFoundError: No module named 'mcp'` |
| `GFY-01` ejecutable en la imagen | Pendiente | Requiere reconstruir la imagen |
| `GFY-02` composición | Cumplido | El overlay parsea con el cargador real de parches y compone una fila `graphify` con `transport: stdio` |
| `GFY-03` grafo inerte | Cumplido | Con grafo inexistente: `graph_stats` y `query_graph` responden `graph.json not found: /etc/mdl-harness/no-default-graph.json`; con `project_path=/srv/projects/pipay-sii`: 741 nodos, 1 525 aristas, 36 comunidades |
| `GFY-04` costo | Cumplido | `tools/list`: 10 herramientas, 6 243 bytes propios |
| `GFY-05` frescura | Cumplido | `graph_stats` informa `Built at commit 38978fc7… HEAD is 2f1e00c…` |
| Fila montada y 10 herramientas en DSH | Pendiente | Requiere la imagen reconstruida: el ejecutable no existe todavía en `/usr/local/bin` |

## Resultado y pendientes

- Resultado: implementado en el árbol de fuentes con el preflight completo.
- Pendientes:
  - Reconstruir la imagen y comprobar `GFY-01` dentro del contenedor y la fila montada con sus 10 herramientas.
  - Marcar la fila de la fase en `mdl/ROADMAP.md` al validar.
  - Reconstruir el grafo cuando el proyecto avance: el de `pipay-sii` es del commit `38978fc7` y el `HEAD` del repositorio ya es `2f1e00c`.
- Decisión de salida: pendiente.
