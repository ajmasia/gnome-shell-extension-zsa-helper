# Spike: overlay flotante de la capa activa de la ZSA Voyager en GNOME 48 (Wayland)

**Date:** 2026-09-25
**Result:** VIABLE WITH CHANGES

## Question

¿Es viable un overlay flotante en GNOME 48 (Wayland) que, con un atajo configurable (o al cambiar
de capa), muestre los caracteres de la capa activa de la Voyager? El planteamiento inicial tenía
cuatro piezas:

1. Leer el layout desde la caché SQLite de Keymapp.
2. Detectar la capa activa en tiempo real, vía la API gRPC de Keymapp o vía `hidraw` (protocolo Oryx).
3. Traducir los keycodes QMK según la distribución XKB activa.
4. Overlay y atajo configurable como extensión de GNOME Shell.

## What was done

Entorno: GNOME Shell 48.7, gjs 1.82.3, Voyager `3297:1977` por USB, Keymapp en ejecución (con la API
gRPC desactivada), distribución `us+altgr-intl`, layout Oryx "Personal Settings" (`aOa9o`).

El código del spike fue temporal y no forma parte del repositorio.

### 1. Protocolo Oryx del firmware

Descargué `keyboards/zsa/common/oryx.{c,h}` de `zsa/qmk_firmware` (rama `firmware24`). El protocolo
funciona así:

- Paquetes de 32 bytes. El primer byte es el comando o el evento y el resto son parámetros, que
  terminan en `0xFE` (`ORYX_STOP_BIT`).
- El emparejamiento es trivial: basta con enviar `ORYX_CMD_PAIRING_INIT` (`0x01`) y el firmware
  responde `PAIRING_SUCCESS`. Ya no hay código de emparejamiento.
- Mientras está emparejado, el firmware emite:
  - `ORYX_EVT_LAYER` (`0x05`, capa más alta activa) en cada cambio de capa.
  - `KEYDOWN`/`KEYUP` (`0x06`/`0x07`, con col y row) en cada pulsación.
- `ORYX_CMD_GET_FW_VERSION` devuelve `SERIAL_NUMBER`, que en Oryx es `layoutId/revisionId`.

### 2. Identificar la interfaz

```
hidraw3: 05 01 09 06 ...   -> teclado estándar
hidraw4: 06 60 ff 09 61    -> usage page 0xFF60 / usage 0x61 = raw HID de Oryx
hidraw5: 05 01 09 80 ...   -> system/consumer control
```

Keymapp tiene abierto `/dev/hidraw4` (fd 34). Los permisos son `0666`, grupo `plugdev`, gracias a
`/etc/udev/rules.d/50-zsa.rules`, que instala ZSA.

### 3. Sonda en Python (`oryx_probe.py`, sin dependencias)

El script abre `/dev/hidraw4` y escribe informes con el formato `[0x00 report-id] + 32 bytes`:

```
PROTOCOL_VERSION  [5]                  <- protocolo v5
FW_VERSION        aOa9o/nlzDl9         <- layoutId/revisionId
PAIRING_SUCCESS
LAYER             [0]
LAYER             [1]                  <- tras SET_LAYER(move, 1)
LAYER             [0]                  <- tras SET_LAYER(move, 0)
KEYDOWN           [col 4, row 8]       <- pulsaciones reales del usuario
KEYDOWN / KEYUP   [2, 0] ...
```

### 4. Sonda en GJS (`gjs_probe.js`), el runtime de las extensiones de GNOME Shell

Usa `Gio.File.open_readwrite('/dev/hidraw4')`, escribe el emparejamiento y lee con
`read_bytes_async` en el main loop de GLib. Recibe `LAYER 0 → 2 → 0` sin bloquear el hilo.

### 5. Traducción XKB (`xkb_probe.py`, libxkbcommon vía ctypes)

Resuelve `(keycode evdev, Shift, AltGr)` al carácter que produce cada distribución:

```
us+altgr-intl  KC_LBRC '['  KC_LABK '<'  KC_QUOTE "'"  KC_SCLN ';'  KC_GRAVE '`'  RALT(KC_5) '€'
es             KC_LBRC ''   KC_LABK ';'  KC_QUOTE ''   KC_SCLN 'ñ'  KC_GRAVE 'º'  RALT(KC_5) '½'
```

(`''` = tecla muerta)

### 6. Origen del layout

- **Caché de Keymapp:** `~/.config/.keymapp/keymapp.sqlite3`, tabla `revision`, con el JSON completo
  por `revisionId`. Contiene 5 capas (Main, Nav, Sym, Brd+Sys, Sym+Num) de 52 teclas, cada una con
  `tap`, `hold`, `doubleTap`, `tapHold`, `modifiers` y `customLabel`.
- **API pública de Oryx:** `POST https://oryx.zsa.io/graphql` con
  `layout(hashId:"aOa9o", revisionId:"nlzDl9", geometry:"voyager")` devuelve las mismas 5 capas y
  52 teclas, sin autenticación.

## Findings

| Pieza | Resultado | Evidencia |
|---|---|---|
| Detectar la capa en tiempo real | ✅ **Vía hidraw**, sin Keymapp ni root | Eventos `LAYER` recibidos en Python y en GJS en tiempo real |
| API gRPC de Keymapp | ⏭️ Innecesaria | hidraw resuelve lo mismo, sin dependencia y sin activar nada |
| Convivencia con Keymapp | ✅ | hidraw entrega cada informe a todos los que tienen abierto el dispositivo; Keymapp siguió funcionando durante todas las pruebas |
| Saber qué layout está flasheado | ✅ | `GET_FW_VERSION` devuelve `aOa9o/nlzDl9`, que es la clave exacta del layout |
| Leer el layout | ✅ En dos fuentes | Caché SQLite de Keymapp (offline) y API GraphQL de Oryx (online) |
| Traducir según la distribución | ✅ | libxkbcommon resuelve correctamente `us+altgr-intl` y `es` |
| Resaltar la tecla pulsada | ✅ Datos disponibles | `KEYDOWN`/`KEYUP` con (col, row); falta la tabla matriz → índice de las 52 teclas |
| Overlay y atajo en GNOME Shell | ✅ Por API conocida (no prototipado) | `Main.wm.addKeybinding` y un widget `St` en `Main.layoutManager` son el patrón estándar de extensiones con overlay; no se probó por no poder recargar la Shell en Wayland sin cerrar sesión |

### Cambios respecto al planteamiento inicial

1. **Descarto la API gRPC de Keymapp.** hidraw es más directo, no exige que Keymapp esté abierto ni
   tocar sus ajustes, y además da las pulsaciones.
2. **La fuente principal del layout es la API de Oryx, usando el ID que da el firmware**, con la
   caché SQLite como respaldo offline. Así el overlay siempre refleja el layout realmente
   flasheado, no el último que Keymapp tenga en caché.
3. **La traducción XKB no puede hacerse en GJS** (no hay binding de libxkbcommon). Con
   `us+altgr-intl` y un layout que solo usa keycodes US estándar basta una tabla estática
   `KC_* → etiqueta`. El soporte genérico de otras distribuciones se hace al generar las etiquetas,
   no en tiempo real.

### Detalles que la implementación debe cubrir

- **`KC_TRANSPARENT`:** hay que heredar la etiqueta de la capa inferior (Brd+Sys la usa mucho) y
  mostrarla atenuada.
- **Teclas de acción:** `MO`, `OSM`, `CW_TOGG`, `QK_BOOT`, `RGB_*`, multimedia y `hold` de capa
  necesitan iconos o etiquetas propias. `customLabel` tiene prioridad (por ejemplo "Prev Tab" o
  "€").
- **Emparejamiento volátil:** el firmware lo pierde si falla un envío (USB desconectado o
  suspensión). Hay que reabrir el dispositivo y reemparejar cuando se reconecte (vigilando
  `/dev/hidraw*` con `Gio.FileMonitor` o reintentando tras un error de lectura).
- **Localizar el dispositivo:** no se puede fijar `hidraw4` en el código. Hay que buscarlo por el
  descriptor (`06 60 ff 09 61`) o por el VID/PID `3297` en `/sys/class/hidraw/*/device`.
- **Mensajes que ve Keymapp:** las respuestas a nuestros comandos también le llegan. Es inocuo en
  las pruebas, pero conviene enviar solo `PAIRING_INIT` y nunca `SET_LAYER` en producción.
- **Evento de capa:** `ORYX_EVT_LAYER` informa solo de la capa más alta activa, que es justo lo que
  hay que mostrar.

## Recommendation

**Continuar, con esta arquitectura:**

- **Una sola extensión de GNOME Shell (GJS), sin daemon**, que se encarga de:
  - Abrir el raw HID de la Voyager, emparejar y escuchar `LAYER`/`KEYDOWN`/`KEYUP` de forma
    asíncrona.
  - Obtener el layout con `GET_FW_VERSION` → API de Oryx (con `Soup`, disponible en la Shell) y
    guardarlo en caché en `~/.cache/`.
  - Dibujar un overlay `St` no interactivo con la rejilla 2×(3×6 + 2) de la Voyager y las etiquetas
    de la capa activa.
  - Registrar el atajo configurable (esquema GSettings y página de preferencias con Adw), con dos
    modos: *toggle* por atajo y *HUD automático* mientras la capa activa no sea la base.
- **Etiquetas:** tabla estática `KC_* → texto/icono` para distribuciones US. El soporte de otras
  distribuciones (xkbcommon) queda para una segunda fase, como script opcional de exportación.

**Siguiente paso sugerido:** un PRD corto con el alcance del MVP (capa activa + atajo + HUD
automático) y una segunda fase (resaltado de teclas pulsadas, otras distribuciones, temas).

## Impact on stack

- El stack de referencia de la skill (Node/Prisma/Postgres/Docker) **no aplica**: es un proyecto
  personal de escritorio.
- **Stack real:** extensión de GNOME Shell 48 en JavaScript ESM (GJS 1.82), con St/Clutter para el
  overlay, Gio para el HID, Soup 3 para la API y Adw para las preferencias. Opcionalmente TypeScript
  con `@girs/*` para tipado.
- **Dependencias del sistema:** ninguna nueva. La regla udev de ZSA (`50-zsa.rules`) ya da acceso a
  hidraw sin root; hay que documentarla como requisito.
- **Sin dependencia de Keymapp:** puede convivir con él o no estar instalado. Solo hace falta red la
  primera vez para descargar cada revisión del layout.
