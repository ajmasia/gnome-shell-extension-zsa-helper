# PRD: zsa-helper — overlay de capas para la ZSA Voyager en GNOME

## Summary

zsa-helper es una extensión de GNOME Shell 48 que muestra, flotando sobre el escritorio, un mapa
de la ZSA Voyager con los caracteres de la capa activa en ese momento. Está pensada para usuarios
de la Voyager que aún no han memorizado sus capas y ahora tienen que abrir Keymapp o Oryx para
consultarlas.

## Context and motivation

Adaptarse a un teclado de 52 teclas con varias capas (en el layout actual: Main, Nav, Sym,
Brd+Sys y Sym+Num) obliga a memorizar dónde está cada símbolo. Las herramientas existentes no
resuelven la consulta rápida:

- **Keymapp** y **Oryx Live Training** muestran la capa activa, pero en una ventana o pestaña
  normal que hay que traer al frente.
- **keymap-drawer** genera una chuleta estática.
- **Show Me The Key** y **key-mon** muestran pulsaciones, pero no conocen el layout.

El spike `docs/spikes/spike-voyager-layer-overlay.md` (25-09-2026, VIABLE WITH CHANGES) confirmó
que:

- El firmware Oryx informa de la capa activa y de las pulsaciones por raw HID (`/dev/hidraw*`),
  legible desde GJS sin root y sin depender de Keymapp.
- El firmware devuelve el identificador del layout flasheado (`layoutId/revisionId`) y la API
  GraphQL pública de Oryx devuelve su contenido completo.

## Target users

- **Usuario principal (el autor):** usuario de la Voyager en GNOME 48/Wayland con distribución
  `us+altgr-intl`. Necesita ver de un vistazo qué hay en cada tecla de la capa en la que está,
  sin cambiar de ventana y sin interrumpir lo que escribe.
- **Otros usuarios de la Voyager en GNOME (futuro):** mismas necesidades. Publicar la extensión
  queda fuera del MVP, pero el diseño no debe impedirlo.

## Features (in scope)

1. **Detección del teclado y de la capa activa**
   - Localiza la interfaz raw HID de la Voyager por VID `0x3297` y usage page `0xFF60`, nunca por
     un `hidrawN` fijo.
   - Empareja enviando `PAIRING_INIT` (`0x01`) y escucha de forma asíncrona los eventos `LAYER`
     (`0x05`), `KEYDOWN` (`0x06`) y `KEYUP` (`0x07`).
   - Se recupera de desconexiones y suspensiones: detecta el error de lectura o la desaparición
     del dispositivo, reabre y vuelve a emparejar cuando el teclado reaparece.
   - Solo envía `GET_FW_VERSION`, `GET_PROTOCOL_VERSION` y `PAIRING_INIT`; nunca comandos que
     alteren el teclado (`SET_LAYER`, RGB, LEDs).

2. **Obtención del layout**
   - Lee `layoutId/revisionId` del firmware (`GET_FW_VERSION`).
   - Descarga esa revisión de la API GraphQL de Oryx (`https://oryx.zsa.io/graphql`) y la guarda
     en caché local en `~/.cache/zsa-helper/`, indexada por revisión.
   - Orden de respaldo: caché propia → caché SQLite de Keymapp
     (`~/.config/.keymapp/keymapp.sqlite3`, tabla `revision`) → mensaje de "layout no disponible".
     La caché de Keymapp se lee lanzando `sqlite3 -json` con `Gio.Subprocess` solo si `sqlite3`
     está en el `PATH`; si no está, ese respaldo se omite sin error.
   - Al flashear una revisión nueva, el identificador cambia y el layout se descarga solo.

3. **Etiquetas de las teclas**
   - Tabla estática `KC_* → etiqueta` para una distribución US, que cubre al menos todos los
     keycodes del layout actual (letras, números, símbolos US, F1–F12, navegación, modificadores,
     multimedia).
   - `customLabel` de Oryx tiene prioridad sobre la tabla.
   - `KC_TRANSPARENT`, y también las teclas `null` (Oryx las compila como `KC_TRANSPARENT`),
     heredan la etiqueta de la **capa base (0)** y se muestran atenuadas.
     - El firmware solo informa de la capa más alta y, con `LT`/`MO` desde la base, las capas
       activas son {0, n}.
     - La herencia en cadena (tri-layer, capas encadenadas) queda fuera del MVP.
   - Las teclas de acción tienen etiqueta o icono propio: `MO(n)` y `hold` de capa con el nombre
     de la capa destino, `OSM`, `CW_TOGG`, `QK_BOOT`, `RGB_*` y `TOGGLE_LAYER_COLOR`.
   - Las teclas con `hold` o `tapHold` muestran la acción secundaria como subetiqueta.
   - Las teclas sin acción (`null`) aparecen vacías.

4. **Overlay**
   - Panel flotante no interactivo (no roba foco ni recibe clics), semitransparente, con la
     geometría de la Voyager: dos mitades de 4 filas × 6 columnas y 2 teclas de pulgar por lado
     (coordenadas x/y de `keyboards/zsa/voyager/keyboard.json`, con el escalonado de columnas).
   - **No es una ventana, sino un actor St** dibujado por la propia Shell en la capa de chrome
     (`Main.layoutManager`). Por eso no tiene barra de título, bordes ni botones, no aparece en
     Alt+Tab, en la vista de actividades ni en el dock, y no se puede mover ni redimensionar con el
     ratón. Solo se ve el panel con las teclas, con esquinas redondeadas y sombra.
   - Muestra el nombre de la capa activa y usa el color de capa de Oryx cuando exista.
   - Se actualiza al instante con cada evento `LAYER`, esté visible por atajo o por HUD.

5. **Modo toggle por atajo**
   - Un atajo global configurable (GSettings y `Main.wm.addKeybinding`) muestra u oculta el
     overlay. Por defecto es **`Super+Alt+K`**, que no choca con ningún atajo de la configuración
     actual.

6. **Modo HUD automático**
   - Activable o desactivable en preferencias.
   - El overlay aparece cuando la capa activa deja de ser la base (capa 0) y desaparece al volver
     a ella, con retardos configurables para evitar parpadeos en cambios de capa rápidos. Por
     defecto: **150 ms para mostrar** (si la capa cambia antes, no se muestra) y **300 ms para
     ocultar**.
   - Convive con el toggle: si el overlay está fijado por atajo, el HUD no lo oculta.

7. **Resaltado de la tecla pulsada**
   - Mientras el overlay está visible, cada `KEYDOWN` resalta la tecla correspondiente y `KEYUP`
     quita el resaltado.
   - La posición se traduce de (col, row) de la matriz al índice 0–51 del layout de Oryx, con la
     tabla `LAYOUT` de `keyboards/zsa/voyager/keyboard.json` de QMK.

8. **Preferencias** (ventana Adw)
   - Atajo del toggle.
   - HUD activado/desactivado y retardo de ocultación.
   - Resaltado activado/desactivado.
   - Posición del overlay (abajo-centro por defecto, arriba-centro, esquinas).
   - Opacidad y escala.
   - Botón "refrescar layout", que invalida la caché y vuelve a descargar.

9. **Instalación local**
   - Script de build e instalación (`pnpm build` y un script de instalación en
     `~/.local/share/gnome-shell/extensions/`).
   - README con requisitos, entre ellos la regla udev de ZSA.

## Out of scope

- Publicar en extensions.gnome.org (el código seguirá sus guidelines para no cerrar la puerta).
- Traducción genérica según la distribución XKB activa (xkbcommon). En el MVP solo hay tabla US.
- Otros teclados ZSA (Moonlander, Ergodox EZ, Planck) y teclados QMK/VIA no ZSA.
- Editar el layout, cambiar de capa o controlar RGB y LEDs desde la extensión.
- Integración con la API gRPC de Keymapp.
- Combos, macros detalladas y tap dance más allá de mostrar su etiqueta.
- Otras versiones de GNOME Shell distintas de la 48, y sesiones X11 (no se prueban).
- Estadísticas o heatmap de uso.

## Stack and technical constraints

### Existing stack in use

El repositorio está vacío salvo el spike: no hay `package.json`, Docker ni base de
datos. El inventario refleja el entorno verificado en el spike:

- **GNOME Shell 48.7 (Wayland):** plataforma anfitriona de la extensión.
- **GJS 1.82.3:** runtime de la extensión. El spike validó el acceso asíncrono a hidraw con
  `Gio.File.open_readwrite` y `read_bytes_async`.
- **Gio / GLib:** lectura y escritura de hidraw, monitorización de `/dev` para reconexiones y
  timers.
- **St / Clutter:** widgets y animaciones del overlay.
- **Soup 3:** llamadas a la API GraphQL de Oryx (incluido en GNOME Shell).
- **Adw / Gtk 4:** ventana de preferencias.
- **Node.js y pnpm:** disponibles en el sistema; se usan solo como herramientas de build.
- **Regla udev de ZSA** (`/etc/udev/rules.d/50-zsa.rules`): da acceso `0666` a hidraw de la
  Voyager sin root.

### New technologies proposed

- **TypeScript + `@girs/*` (tipos de las APIs GNOME):**
  - **Por qué no basta el stack existente:** GJS es JavaScript sin tipos. Con APIs extensas y poco
    documentadas (Clutter, St, Meta, Gio), los tipos evitan errores que solo aparecerían al
    recargar la Shell, que en Wayland exige cerrar sesión.
  - **Alternativa propuesta:** compilar TypeScript a JavaScript ESM legible con `tsc`, sin
    empaquetar, para que el resultado se parezca al código escrito a mano y siga siendo compatible
    con las guidelines de EGO.
  - **Riesgo / coste:** paso de build y dependencia de la calidad de `@girs` para GNOME 48. El
    riesgo es bajo porque es la vía que recomienda gjs.guide.
- **SQLite para el respaldo desde la caché de Keymapp:** GJS no tiene binding de SQLite y no se
  quiere añadir una dependencia del sistema (GDA). **Decidido:** se lanza el CLI `sqlite3` con
  `Gio.Subprocess` solo si está disponible (ya está instalado en `/usr/bin/sqlite3`); si no, se
  omite este respaldo. Es una dependencia opcional, no un requisito.

### Constraints and conventions

- **Código apto para EGO desde el principio:** todo lo creado en `enable()` se destruye en
  `disable()` (widgets, keybindings, señales, streams, timers); nada se ejecuta al importar el
  módulo.
- **Nada de E/S bloqueante en el hilo de la Shell:** hidraw, red y ficheros siempre asíncronos.
- **Solo lectura hacia el teclado,** salvo el emparejamiento (ver feature 1).
- **Tests:** la lógica pura (parseo de paquetes Oryx, resolución de etiquetas, herencia de
  `KC_TRANSPARENT`, mapeo matriz → índice, parseo de la respuesta de Oryx) se separa en módulos sin
  dependencias de `gi://` y se prueba con Vitest sobre fixtures del layout real. La UI se prueba a
  mano en una Shell anidada:
  `dbus-run-session -- gnome-shell --nested --wayland`, con `MUTTER_DEBUG_DUMMY_MODE_SPECS`
  para fijar la resolución (verificado en GNOME 48.7: arranca sin errores bloqueantes;
  `--devkit` no existe en esta versión). El atajo solo llega a la Shell anidada cuando su ventana
  tiene el foco; los eventos hidraw llegan igual.
- **Estructura del repositorio:** paquete único, sin workspaces de pnpm:
  - `src/extension.ts`, `src/prefs.ts`
  - `src/core/`: lógica pura sin `gi://`, testeable con Vitest
  - `src/ui/`: overlay y widgets St
  - `schemas/`: esquema GSettings
  - `scripts/`: build, instalación y lanzador de la Shell anidada
  - `tests/fixtures/`: layout real exportado

## Success criteria

1. Con la extensión activada y la Voyager conectada, el overlay está visible por atajo o HUD y se
   cambia de capa, el overlay muestra la nueva capa en menos de 100 ms, sin tirones perceptibles.
2. El atajo configurado en preferencias muestra y oculta el overlay desde cualquier aplicación, y
   el overlay nunca roba el foco del teclado.
3. El overlay se muestra sin barra de título ni decoraciones y no aparece en Alt+Tab, en la vista
   de actividades ni en el dock.
4. Con el HUD activado, mantener una tecla `MO` muestra la capa correspondiente y soltarla la
   oculta tras el retardo configurado.
5. Con el resaltado activado, pulsar una tecla resalta en el overlay la posición física correcta
   en todas las teclas de las 5 capas del layout actual.
6. Las teclas `KC_TRANSPARENT` de Brd+Sys muestran atenuada la etiqueta heredada; las etiquetas
   personalizadas ("Prev Tab", "Next Tab", "Back", "Fwd", "€") se ven tal cual.
7. Desconectar y reconectar el teclado, o suspender y reanudar, restaura la detección de capa sin
   recargar la extensión.
8. Flashear una revisión nueva del layout hace que el overlay la muestre sin intervención manual
   (con red), y sin red se usa la última revisión en caché.
9. Keymapp, abierto a la vez, sigue funcionando con normalidad (live training, smart layers).
10. Desactivar la extensión no deja restos: sin widgets, sin keybinding, sin descriptores abiertos
   a hidraw.
11. Los tests de Vitest de la lógica pura pasan.

## Risks and dependencies

- **Protocolo Oryx no documentado públicamente:** el firmware reporta la versión 5 y el código
  fuente consultado es de la versión 4. ZSA podría cambiarlo. Mitigación: comprobar
  `GET_PROTOCOL_VERSION` y avisar si es desconocida, y aislar el parser en un módulo.
- **API GraphQL de Oryx no oficial para terceros:** podría cambiar o limitarse. Mitigación: caché
  local persistente y respaldo en la caché de Keymapp.
- **El emparejamiento compartido con Keymapp:** ambos envían `PAIRING_INIT` y reciben las
  respuestas del otro. En el spike no hubo efectos negativos, pero no se ha probado en uso
  prolongado.
- **Mapeo matriz → índice de Oryx:** el orden de Oryx **no** es el `LAYOUT` de QMK:
  - **Oryx:** mitad izquierda por filas (0–23), pulgares izquierdos (24–25), mitad derecha por
    filas (26–49) y pulgares derechos (50–51). Verificado con el layout real: 0=ESC … 7=Q …
    26=6 … 32=Y … 51=ENTER.
  - **QMK:** intercala las filas izquierda y derecha.
  - El mapeo Oryx → QMK → matriz se deriva por tabla. Falta validarlo con pulsaciones reales; lo
    cubre el criterio 5.
- **Desarrollo en Wayland:** los cambios en la Shell principal exigen cerrar sesión. Se mitiga
  iterando en la Shell anidada; solo la validación final necesita la sesión real.
- **Dependencia de la regla udev de ZSA** para acceder sin root. Si falta, la extensión debe
  mostrar un error claro y no fallar en silencio.
- **Cambios de API entre versiones de GNOME Shell:** el MVP fija `shell-version: ["48"]`.

## Architecture decisions (closed 2026-09-25)

| # | Decisión | Resolución |
|---|---|---|
| 1 | Respaldo desde la caché de Keymapp | Sí, con el CLI `sqlite3` vía `Gio.Subprocess` solo si está en el `PATH`; si no, se omite sin error |
| 2 | Atajo por defecto | `Super+Alt+K` (libre en la configuración actual); se puede cambiar en preferencias |
| 3 | Retardos del HUD | 150 ms para mostrar y 300 ms para ocultar, configurables en preferencias |
| 4 | Sesión de desarrollo | `dbus-run-session -- gnome-shell --nested --wayland` (verificado en GNOME 48.7) |
| 5 | Estructura del repositorio | Paquete único con `src/core/` para la lógica pura (ver *Constraints and conventions*) |
| — | Distribución | Uso personal con instalación local; código compatible con las guidelines de EGO |
| — | Lenguaje | TypeScript + `@girs/*`, compilado a JavaScript ESM con `tsc`, sin empaquetar |

No quedan decisiones abiertas que bloqueen la implementación.
