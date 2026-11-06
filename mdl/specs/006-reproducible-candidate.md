# SPEC-006 — Candidato reproducible en el VPS

Estado: Validada
Fase: 6
Commit base: `394a8f6b93`
Aprobación: usuario en el VPS, `si, continua con el push y ajusta el spec 006 antes de desarrollar`

## Objetivo

Reproducir MDL-HARNESS desde un clon limpio de `main` y demostrar que la imagen, la configuración restaurada y el agente funcionan igual que en la instancia validada, sin tocar la instancia viva.

## Contexto

`SPEC-005` validó la instancia operativa. La imagen actual se construyó desde el árbol de trabajo, no desde un clon, y el fork no tiene CI que valide `mdl/`. Este ensayo cubre el escenario de recuperación real: clon nuevo, imagen nueva y backup restaurado.

## Aislamiento del candidato

La instancia viva usa el proyecto Compose `mdl-harness`, el puerto `3081` y la red externa `edge`, donde Caddy resuelve el alias `mdl-harness`. El candidato no puede compartir ninguno de los tres:

- Proyecto `mdl-candidate`, que da volúmenes `mdl-candidate_mdl-dsh-home` y `mdl-candidate_mdl-workspace`.
- Puerto `127.0.0.1:3082`.
- Sin la red `edge`. El alias duplicado haría que Caddy reparta tráfico entre la instancia viva y el candidato.
- Imagen etiquetada `mdl-harness:candidate` para no reemplazar `mdl-harness:local`.

La red, el túnel y Cloudflare Access no se vuelven a validar: pertenecen a `SPEC-005`.

## Alcance

- Clonar `main` en `/srv/repro/deepseek-harness` y registrar el commit.
- Construir la imagen desde el clon y registrar el ID resultante y si hubo capas desde caché.
- Crear volúmenes nuevos del proyecto `mdl-candidate` y restaurar el último backup validado.
- Arrancar el candidato aislado y verificar configuración, sesión, workspace, sandbox y una ronda corta del agente.
- Confirmar que la instancia viva, Caddy y el túnel no cambian.
- Registrar versiones, commit, comandos y resultados.
- Crear un tag local de release solo si el usuario lo aprueba.

## Fuera del alcance

- Publicación de imágenes o tags en un registry.
- Alta disponibilidad, balanceo o múltiples nodos.
- Cambios de producto no necesarios para reproducir el candidato.
- Sincronización de upstream no aprobada.
- Revalidar Cloudflare Access o la exposición pública.
- Migrar, detener o modificar la instancia viva.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `CAND-01` | Un clon limpio de `main` construye la imagen sin pasos secretos | Build desde `/srv/repro/deepseek-harness` |
| `CAND-02` | La arquitectura resultante coincide con el VPS | `docker image inspect mdl-harness:candidate` |
| `CAND-03` | El candidato arranca con volúmenes nuevos y configuración restaurada | Compose aislado y API local |
| `CAND-04` | La sesión, el workspace y el agente funcionan tras la restauración | Ronda corta y archivo de prueba |
| `CAND-05` | El candidato no toca la red, el puerto ni los volúmenes de la instancia viva | `docker ps`, `docker network inspect`, `docker port` |
| `CAND-06` | La evidencia registra commit, versiones, comandos y desviaciones | Especificación completada |
| `CAND-07` | El clon no depende de archivos no versionados | El árbol del clon queda limpio durante todo el ensayo |

## Validación prevista

1. Clonar `main` en `/srv/repro/deepseek-harness` y fijar el commit.
2. Crear `/srv/repro/candidate.override.yml`, fuera del clon, que reemplace puerto, redes e imagen del servicio.
3. Construir con `docker compose -p mdl-candidate -f <clon>/mdl/docker/compose.yml -f /srv/repro/candidate.override.yml build`.
4. Crear los volúmenes `mdl-candidate_*` y extraer el último backup con `volume-nocopy`, igual que `restore.sh`.
5. Arrancar el candidato y esperar `healthy`.
6. Verificar `settings.yaml`, la sesión restaurada, el archivo de prueba del workspace y el probe de Landlock.
7. Ejecutar una ronda corta del agente desde el candidato.
8. Confirmar que la instancia viva sigue `healthy`, en `3081`, en la red `edge`, y que `dsh.devmedel.com` sin sesión sigue redirigiendo a Access.
9. Registrar el resultado, apagar el candidato con `down -v` sobre `mdl-candidate` y decidir si se crea un tag local.

## Validación ejecutada

Fecha: `2026-11-06T20:24:17Z`
Entorno: VPS Linux amd64; Docker `29.9.3`, Compose `5.7.0`; clon en `/srv/repro/deepseek-harness` en `394a8f6b93`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Clon limpio | Aprobado | `394a8f6b93`, árbol con 0 cambios antes y después del build |
| Build desde el clon | Aprobado | Código 0, **0 capas desde caché**; imagen `mdl-harness:candidate` `sha256:eee0c98f…` |
| Arquitectura | Aprobada | `amd64`, `linux`, 4,17 GB |
| Restauración | Aprobada | `mdl-harness-20261106T193817Z.tar.gz`; `settings.yaml` con hash `05e6a624…`, igual al de la instancia viva |
| Arranque | Aprobado | `mdl-candidate-mdl-harness-1` en `healthy`, `127.0.0.1:3082` |
| Sesiones | Aprobadas | 4 sesiones restauradas |
| Workspace | Aprobado | `sandbox.txt` con `ok` |
| Sandbox | Aprobado | `landlock: fully enforced` en la imagen del clon |
| Agente | Aprobado | Ronda real que leyó `sandbox.txt` y reportó `/workspace` |
| Aislamiento | Aprobado | Candidato solo en `mdl-candidate_default`; `edge` sigue con la instancia viva; sin colisión de puerto |
| Instancia viva | Intacta | Sigue `healthy` en `3081`, con 4 sesiones y el workspace sin cambios |
| Acceso público | Intacto | `dsh.devmedel.com` sin sesión sigue en `302` al login de Access |
| Desmontaje | Aprobado | `down -v` del proyecto `mdl-candidate` eliminó sus dos volúmenes y su red |

Los IDs de imagen difieren entre la instancia viva (`ee2caa6a…`) y el candidato (`eee0c98f…`). La diferencia proviene de contenido no determinista de las capas de instalación; la reproducibilidad comprobada es funcional y de arquitectura, no bit a bit.

## Resultado

**Validada.** Un clon limpio de `main` reconstruye la imagen, restaura el backup y ejecuta el agente con el mismo comportamiento, sin afectar la instancia viva.

## Pendientes

- Crear un tag local de release solo si el usuario lo aprueba; no se creó.
- Eliminar `/srv/repro/deepseek-harness` y la imagen `mdl-harness:candidate` cuando no se necesiten para otro ensayo.
