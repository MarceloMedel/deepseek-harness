# MDL-HARNESS — contrato de producto y desarrollo

## Propósito

MDL-HARNESS es una variante personal de DeepSeek Harness mantenida por un desarrollador con apoyo de agentes. El producto conserva la compatibilidad práctica con upstream, permite una identidad visual propia y debe poder ejecutarse localmente y en Docker sin depender de una instalación global de DSH.

Este documento contiene las reglas permanentes y el flujo de desarrollo. El orden de las fases pertenece a [ROADMAP.md](ROADMAP.md); el alcance y la evidencia de cada cambio pertenecen a su archivo en [specs/](specs/).

## Reglas permanentes

| ID | Regla |
|---|---|
| `MDL-IDENT-01` | El nombre visible del producto es `MDL-HARNESS`. |
| `MDL-IDENT-02` | Los paquetes `@deepseek-ai/*`, el comando `dsh`, las variables `DSH_*`, las API y las claves internas conservan compatibilidad con upstream. |
| `MDL-THEME-01` | El rojo `#D40000` es el color principal de marca; cualquier variante de contraste debe quedar documentada. |
| `MDL-THEME-02` | Los temas claro, oscuro y sistema deben permanecer utilizables y legibles. |
| `MDL-ENV-01` | El desarrollo del fork no debe modificar la instalación global original ni sustituir su GUI en `127.0.0.1:3080`. |
| `MDL-LOCALE-01` | Sin preferencia explícita, un navegador no soportado inicia la interfaz en inglés; chino sigue disponible como idioma del navegador o selección manual. |
| `MDL-SEC-01` | Ninguna credencial puede incorporarse a Git, imágenes Docker, capturas o registros de validación. |
| `MDL-SEC-02` | La exposición pública y la relajación de controles de red o sandbox requieren una especificación específica y una validación de seguridad. |
| `MDL-DOCKER-01` | El contenedor ejecuta DSH con un usuario no root y sin privilegios innecesarios. |
| `MDL-DOCKER-02` | El socket Docker del host no se monta por defecto; instalar Docker CLI no otorga control del host. |
| `MDL-DATA-01` | La configuración, los proyectos y el estado persistente deben sobrevivir al reinicio y a la recreación del contenedor. |
| `MDL-UPSTREAM-01` | Upstream se integra en una rama separada; solo llega a la línea personal estable después de validar los cambios y las personalizaciones. |
| `MDL-VALID-01` | Una comprobación no ejecutada se reporta como pendiente y nunca como exitosa. |

Una modificación intencional de estas reglas requiere una especificación aprobada. El código no debe dictar retroactivamente el contrato para ocultar una regresión.

## Flujo Spec-Driven Development

### Una fuente de verdad por tema

- Este archivo define las reglas permanentes y el proceso.
- `ROADMAP.md` define orden, dependencias y estado de las fases.
- Cada `specs/NNN-*.md` define el alcance y la validación de un cambio.
- El código, sus pruebas y la documentación técnica propietaria describen la implementación real.
- Los logs completos, capturas y artefactos generados no se incorporan al repositorio salvo que aporten evidencia revisable y no contengan datos sensibles.

### Cuándo crear una especificación

Requieren especificación las funcionalidades nuevas, los cambios visibles de comportamiento, las integraciones, el despliegue, la persistencia, la seguridad, los cambios de arquitectura y las modificaciones que afectan varios paquetes.

No la requieren las correcciones ortográficas, el formato, los cambios mecánicos sin comportamiento nuevo o un bug pequeño con una prueba de regresión acotada. Estas excepciones no permiten omitir pruebas ni revisión del diff.

### Estados

- **Borrador:** todavía se puede discutir; no autoriza implementación.
- **Aprobada:** alcance y validación acordados; autoriza implementación.
- **En implementación:** desarrollo iniciado, todavía sin validar.
- **Validada:** todas las comprobaciones obligatorias y aprobaciones necesarias están registradas.
- **Rechazada:** no se implementará en esa forma; se conserva solo cuando aporta una decisión útil.

### Secuencia de trabajo

1. Crear una especificación desde [specs/TEMPLATE.md](specs/TEMPLATE.md).
2. Resolver las ambigüedades que afecten alcance, compatibilidad o validación.
3. Marcar la especificación como aprobada antes de escribir código.
4. Implementar en una rama acotada y conservar las reglas permanentes aplicables.
5. Ejecutar las comprobaciones específicas y las manuales definidas por la especificación.
6. Revisar el diff, los secretos y los archivos involuntarios.
7. Registrar resultados reales, pendientes y decisiones en la especificación.
8. Actualizar el roadmap y solo entonces iniciar el siguiente cambio.

Se trabaja con una especificación activa por defecto. El trabajo paralelo requiere ramas y especificaciones independientes para evitar cambios concurrentes sobre el mismo alcance.

### Instrucciones comunes para agentes

Antes de implementar, cada agente debe leer este contrato, la especificación activa y las instrucciones del repositorio. Debe conservar el alcance y las exclusiones aprobadas, no debilitar criterios para obtener un resultado exitoso y detenerse ante una ambigüedad que cambie el comportamiento esperado.

Después de implementar, debe ejecutar la validación correspondiente, informar únicamente lo ejecutado y actualizar la especificación y el roadmap. Si usa otro agente como revisor, la revisión debe comparar el diff con los requisitos y exclusiones, no reescribir la especificación.

### Validación proporcional

- Documentación: formato, enlaces y revisión de contenido.
- Interfaz: pruebas acotadas, build y revisión visual cuando haya cambios visibles.
- Componentes: tests del paquete, snapshots existentes y smoke de la aplicación afectada.
- Docker: build limpio, arranque, API, WebSocket, herramientas y persistencia.
- Seguridad y sandbox: pruebas positivas y negativas obligatorias.
- Integración de upstream: build, pruebas afectadas y smoke de la aplicación personalizada.
- Candidato de release: reproducción desde un clon limpio.

La cobertura exhaustiva y la matriz de plataformas pertenecen a CI. La validación local debe cubrir la superficie modificada sin convertir cada cambio pequeño en una ejecución indiscriminada de toda la suite upstream.
