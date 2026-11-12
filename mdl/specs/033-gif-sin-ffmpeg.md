# SPEC-033 — GIF de PR sin ffmpeg: encoder Pillow en la skill

Estado: En implementación
Fase: 33
Commit base: `ca9adca74e`
Aprobación para iniciar: usuario, 2026-11-12 — «se ve perfecto en la variante de 128 colores», tras la comparación medida entre ffmpeg, Pillow y Pillow con `gifsicle`.

## Objetivo

Que la skill `record-browser-gif` del repositorio pueda grabar, codificar y verificar un GIF dentro de este despliegue, sin `ffmpeg` y sin sumar cientos de megabytes a la imagen.

## Contexto

El `AGENTS.md` del repositorio exige un GIF grabado con esa skill en todo PR que cambie comportamiento visible de la GUI, y el despliegue no podía cumplirlo: la skill pide `ffmpeg` y `ffprobe`. [SPEC-032](032-navegador-headless.md) resolvió la otra mitad —el navegador— y dejó este bloqueo declarado con su costo medido.

La comparación que decidió la fase se hizo con tres frames reales de esta GUI (1440×900, capturados con Playwright y `channel: 'chromium'`), salida de 1200×750 y una línea de tiempo de 6,5 s:

| Vía | Bytes | Colores | Acento `#d40000` decodificado | Distancia | MAE global |
|---|---|---|---|---|---|
| ffmpeg (encoder original) | 100 628 | 124 | `#d40b0a` | 14,9 | 1,65 |
| Pillow, median cut + dither (primer intento) | 245 472 | 64 | `#704e50` | **149,9** | 1,14 |
| Pillow, 256 colores, rescate, sin dither | 46 186 | 219 | `#d81a1a` | 37,0 | 2,65 |
| **Pillow, 128 colores, rescate, sin dither** | **33 368** | 112 | `#d71212` | 25,6 | 3,27 |

El primer intento enseñó lo importante: el error medio global decía que Pillow era mejor (1,14 contra 1,65) mientras convertía el rojo de marca en marrón. El acento ocupa **21 píxeles de un millón** y una paleta ordenada por frecuencia no le asigna nada; el dithering tampoco lo salvaba, porque reparte el error en vez de reservar el color. Rescatar los colores saturados antes de cubrir el resto es lo que lo arregla, y quitar el dithering reduce el archivo a un tercio del de ffmpeg en lugar de duplicarlo.

Costo medido de las dos vías: `python3-pil` son **+6,1 MB** (16 paquetes, versión 9.4.0 de Debian); `ffmpeg` son **+451 MB** por `apt` y **552 MB extraídos** como build estático.

## Alcance

- `GIF-01` La imagen instala `python3-pil`; no se instala `ffmpeg`, `ffprobe` ni `imagemagick`.
- `GIF-02` `scripts/encode_gif.py` codifica con Pillow: una paleta compartida por animación, con los colores saturados rescatados primero y sin dithering.
- `GIF-03` El contrato del encoder se conserva: frames ordenados lexicalmente, una duración por frame, `--max-width`, `--colors`, `--max-bytes`, `--force`, verificación del artefacto escrito y resumen JSON. `--fps` desaparece: existía porque ffmpeg remuestreaba la línea de tiempo, y sin remuestreo no significa nada.
- `GIF-04` El presupuesto de bytes se respeta solo: el encoder reduce colores y después ancho, y reporta cada paso en `adjustments`; si no alcanza, falla.
- `GIF-05` `--dump-frames` escribe frames representativos del GIF codificado, que es lo que permite revisar orden, paleta y duración del último estado sin `ffmpeg`.
- `GIF-06` La skill deja de pedir binarios de medios y de pedir `--fps`, y dice que este despliegue sólo tiene el navegador completo: un driver Playwright debe usar `channel: 'chromium'`.
- `GIF-07` El encoder funciona con la versión de Pillow de la imagen, no sólo con la última: se valida contra 9.4.0.

## Fuera del alcance

- `ffmpeg` en cualquiera de sus formas, y `gifsicle`: el segundo no lee PNG, así que sólo optimiza un GIF ya construido y aportó 21 KB de una diferencia que ya no importa.
- `libimagequant`: el wheel de Pillow no lo trae compilado (`dependency required by this method was not enabled at compile time`), y con el rescate de saturados no hace falta.
- Publicar el GIF en una rama de assets: esa parte de la skill no cambia y no se ejerció en esta fase.
- Capturar una demostración real de un flujo de GUI completo: la comparación usó tres estados reales, pero no un turno del modelo.

## Requisitos y validación prevista

| ID | Requisito observable | Comprobación |
|---|---|---|
| `GIF-01` | Pillow está en la imagen | `docker exec … python3 -c 'import PIL; print(PIL.__version__)'` |
| `GIF-02`/`GIF-03` | El encoder conserva el contrato | Encoding de tres frames con `--durations 1.5,1.5,3.5`: JSON con `sourceFrames`, `encodedFrames`, `width`, `height`, `durationSeconds`, `bytes` |
| `GIF-04` | El presupuesto manda | `--max-bytes 20000` → `adjustments` con la escalera y salida por debajo del límite |
| `GIF-05` | Los frames se pueden leer | `--dump-frames` deja PNGs del GIF codificado |
| `GIF-06` | La skill ya no pide medios | `grep ffmpeg .agents/skills/record-browser-gif/SKILL.md` sin coincidencias de dependencia |
| `GIF-07` | Funciona con Pillow 9.4.0 | El encoding de validación corre bajo Pillow 9.4.0, no sólo bajo la última |
| Fidelidad | El acento sobrevive | Acento decodificado a distancia < 40 de `#d40000`, y archivo menor que el equivalente de ffmpeg |

## Restricciones

- Se conservan `MDL-DOCKER-01`, `MDL-DATA-01`, `MDL-SEC-01`, `MDL-VALID-01` de [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md).
- La skill es contrato del repositorio: cambiar su encoder exige cambiar su cuerpo en el mismo commit, y la decisión queda registrada aquí en vez de en un comentario.
- El encoder no debe depender de binarios externos: una dependencia de medios vuelve el despliegue indecidible entre imágenes.
- Sin dithering hay una pérdida real y declarada: los degradados fotográficos hacen bandas. Una captura de UI no los tiene; una foto, sí.

## Implementación prevista

- `.agents/skills/record-browser-gif/scripts/encode_gif.py`: encoder Pillow con rescate de saturados, escalera de presupuesto y `--dump-frames`.
- `.agents/skills/record-browser-gif/SKILL.md`: requerimientos, invocación y verificación sin medios.
- `mdl/docker/Dockerfile`: `python3-pil` en el `apt` de la imagen.
- `mdl/docker/README.md`, `mdl/specs/032-navegador-headless.md` y `mdl/ROADMAP.md`: el bloqueo declarado pasa a resuelto.

## Validación ejecutada

Entorno: contenedor `mdl-harness`, 2026-11-12. Frames reales de la GUI en `/tmp/gifcmp/frames`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| El encoder corre bajo Pillow 9.4.0 | Cumplido | Venv con `pillow==9.4.0`: `encodedFrames 3`, `width 1200`, `height 750`, `durationSeconds 6.5`, `bytes 48 803`, `encoder pillow` |
| El acento sobrevive | Cumplido | Acento decodificado `#d71212`, distancia 25,6 a `#d40000`; el primer intento daba `#704e50`, distancia 149,9 |
| El archivo es menor que el de ffmpeg | Cumplido | 48 803 B contra 100 628 B del encoder de ffmpeg, misma línea de tiempo y mismos tres estados |
| Los tres estados y la línea de tiempo se conservan | Cumplido | 3 frames, 6,50 s, 3 estados distintos, `timelineMs [1500, 1500, 3500]` |
| El presupuesto de bytes manda | Cumplido | `--max-bytes 20000` → `bytes 19 262`, `colors 16`, `adjustments ['colors=64','colors=32','colors=16','max-width=960']`, `width 960` |
| Los frames del GIF se pueden revisar | Cumplido | `--dump-frames` escribió `encoded-000.png`, `encoded-001.png`, `encoded-002.png` |
| Los errores fallan fuerte | Cumplido | Salida existente, un solo frame, duraciones que no cuadran y dimensiones distintas: cuatro mensajes propios |
| Costo de las dos vías | Comprobado | `python3-pil` +6,1 MB (16 paquetes) contra `ffmpeg` +451 MB por `apt` y 552 MB extraídos |
| `GIF-01` Pillow en la imagen | No ejecutada | Pendiente de la build |
| Captura real con Playwright bajo este despliegue | Parcialmente ejecutada | La captura de los tres frames funcionó con `channel: 'chromium'`; el flujo completo con servidor y turno real no se ejerció |

## Resultado y pendientes

- Resultado: implementado y medido; el encoder funciona con la versión de Pillow que llevará la imagen y el artefacto es menor y con el acento preservado frente a la referencia de ffmpeg. Falta la build que instala `python3-pil` y la captura de un flujo completo.
- Pendientes o excepciones aceptadas: sin dithering los degradados fotográficos harán bandas — declarado y aceptado para capturas de UI; la publicación en rama de assets no se ejerció.
- Decisión de salida: pendiente de la validación sobre la imagen reconstruida.
