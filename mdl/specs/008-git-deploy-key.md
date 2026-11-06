# SPEC-008 — Credencial git para pipay-sii

Estado: Validada
Fase: 8
Commit base: `353252b67e`
Aprobación: usuario en el VPS, `Lectura y escritura` + `La agrego yo por gh`

## Objetivo

Permitir que el agente haga `fetch`, `pull` y `push` sobre `pipay-sii` desde el contenedor, con una credencial limitada a ese repositorio y sin exponerla en la imagen, el backup, el entorno del proceso ni `docker inspect`.

## Contexto

`SPEC-007` dio acceso a los repositorios del host, pero el contenedor no tiene credenciales git. `pipay-sii` es privado y su remoto es HTTPS. El host tiene sesión de `gh` como `MarceloMedel`, pero el contenedor no hereda esa sesión y montar el token de la cuenta daría acceso a todos los repositorios.

Una deploy key SSH queda limitada al repositorio donde se registra, se monta como archivo de solo lectura y se revoca desde GitHub sin afectar la cuenta.

## Decisiones

- Tipo de credencial: deploy key SSH ed25519, sin passphrase, con permiso de escritura.
- Alcance: exclusivamente `MarceloMedel/pipay-sii`.
- Almacenamiento: directorio del host fuera de `/srv/projects` y fuera de los volúmenes, montado read-only en el contenedor.
- Reescritura de URL: solo para el remoto exacto de `pipay-sii`; no se altera el remoto del host ni el de otros repositorios.
- Verificación del host SSH: `known_hosts` propio con las claves de GitHub, `StrictHostKeyChecking=yes`.

## Alcance

- Generar el par de claves y registrar la pública como deploy key del repositorio.
- Montar la clave privada y el `known_hosts` en el contenedor, en solo lectura.
- Configurar git en el contenedor para usar esa clave solo con `pipay-sii`.
- Verificar lectura, `fetch`, `pull` y `push --dry-run`.
- Documentar la revocación.

## Fuera del alcance

- Credenciales para otros repositorios.
- Montar la sesión de `gh` del host ni tokens de cuenta.
- Automatizar pushes o cambios en GitHub más allá del alta de la deploy key.
- Incluir la clave en backups.

## Requisitos

| ID | Requisito observable | Comprobación |
|---|---|---|
| `GIT-01` | El contenedor lista las ramas del remoto | `git ls-remote origin` |
| `GIT-02` | El contenedor puede hacer `fetch` y `pull` | `git fetch` y `git pull --ff-only` |
| `GIT-03` | La credencial permite escribir en el repositorio | `git push --dry-run` |
| `GIT-04` | La credencial no sirve para otros repositorios | Intentar `ls-remote` en otro repo privado y recibir rechazo |
| `GIT-05` | La clave no aparece en imagen, backup, entorno ni `docker inspect` | Inspección |
| `GIT-06` | El host conserva el remoto HTTPS y su funcionamiento | Revisión del remoto y operación desde el host |

## Validación prevista

1. Generar el par y registrar la pública con `gh api` como deploy key de escritura.
2. Montar la clave y el `known_hosts`, recrear el contenedor.
3. Ejecutar `git ls-remote`, `git fetch`, `git pull --ff-only` y `git push --dry-run` desde el contenedor.
4. Confirmar que otro repositorio privado no autentica con la misma clave.
5. Inspeccionar montajes, entorno y backup.
6. Verificar que el host sigue usando HTTPS sin cambios.

## Validación ejecutada

Fecha: `2026-11-06T20:57:00Z`
Entorno: VPS amd64; deploy key `mdl-harness vps`, id `169040303`, `read_only: false`, creada el `2026-11-06T20:55:16Z`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `GIT-01` Lectura | Aprobado | `git ls-remote --heads origin` → `refs/heads/master` en `9b32a62` |
| `GIT-02` Fetch y pull | Aprobado | `fetch --prune` eliminó `origin/feat/neon-esquema` y avanzó `master` de `226d27a` a `9b32a62`; `pull --ff-only` completó |
| `GIT-03` Escritura | Aprobado | `git push --dry-run origin master` → `Everything up-to-date` |
| `GIT-04` Alcance | Aprobado | Otro repo privado (`personal-suite`) responde `ERROR: Repository not found`; los repos públicos son legibles por cualquier clave autenticada |
| `GIT-05` Exposición | Aprobado | La clave no está en la imagen, el volumen `DSH_HOME` ni el backup; el montaje es `rw=false`; el entorno solo contiene rutas |
| `GIT-06` Host | Aprobado | El remoto del host sigue siendo `https://github.com/MarceloMedel/pipay-sii.git` |

El pull dejó el repositorio al día y conservó el archivo sin versionar `docs/PLAN_ADMIN_SECRETOS.md`.

## Resultado

**Validada.** El contenedor opera git sobre `pipay-sii` con una credencial de escritura limitada a ese repositorio, sin exponerla en la imagen, el backup ni el entorno.

## Pendientes

- Revocar la deploy key desde GitHub → Settings → Deploy keys y borrar `/home/ubuntu/.config/mdl-harness/git` cuando se rote.
