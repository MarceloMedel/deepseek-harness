# SPEC-006 — Candidato reproducible en el VPS

Estado: Aprobada
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

## Resultado

Pendiente de ejecución.

## Pendientes

- Ejecutar el ensayo.
- Definir si se crea un tag de release local.
