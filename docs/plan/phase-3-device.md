# Phase 3: Conexión con la Voyager por hidraw (GJS)

**Goal:** un servicio GJS localiza la Voyager, empareja, emite eventos tipados (capa, teclas,
versión de firmware) y se recupera solo de desconexiones.
**Verification:** `pnpm build && gjs -m dist/dev/probe-device.js`. Imprime
`FW aOa9o/<revision>`, `PROTOCOL 5` y un `LAYER n` en cada cambio de capa. Desconectar y
reconectar el USB muestra `disconnected` → `connected` sin reiniciar el script.
**Dependencies:** Phase 2 (`src/core/oryx/*`).

## Contexto

- El spike validó en GJS: `Gio.File.new_for_path('/dev/hidraw4').open_readwrite(null)`, escritura
  con `write_all` de 33 bytes y lectura con `read_bytes_async(32, …)` encadenada. Los eventos
  llegan en tiempo real sin bloquear.
- **No hay que fijar `hidraw4`.** El dispositivo correcto es el de VID `3297` cuyo
  `report_descriptor` empieza por `06 60 ff 09 61` (usage page `0xFF60`, usage `0x61`).
  - Rutas en sysfs: `/sys/class/hidraw/hidrawN/device/uevent`, con líneas `HID_ID=0003:00003297:00001977`
    y `HID_NAME=ZSA Technology Labs Voyager`.
  - El descriptor está en `/sys/class/hidraw/hidrawN/device/report_descriptor`.
- **Permisos:** `0666` gracias a `/etc/udev/rules.d/50-zsa.rules`. Si se recibe `EACCES`, hay
  que emitir un error claro que mencione la regla udev.
- **Keymapp** puede tener el mismo hidraw abierto: los dos reciben todos los informes. Solo se
  envían `GET_PROTOCOL_VERSION`, `GET_FW_VERSION` y `PAIRING_INIT`.
- **Emparejamiento volátil:** el firmware lo pierde cuando falla un envío (desconexión o
  suspensión). Siempre hay que reemparejar al reabrir.
- Todo debe ser asíncrono y cancelable (`Gio.Cancellable`), porque correrá en el hilo de la Shell.

## Notas de implementación

- **Escrituras:** hay que usar `write_bytes_async(new GLib.Bytes(report))`, no `write_all_async(Uint8Array)`.
  Con la segunda, GJS puede liberar el buffer antes de que termine la escritura asíncrona y el
  teclado recibe basura: responde `ERROR 0xFF` (comando desconocido) a todo. En las primeras
  pruebas los eventos llegaban igualmente porque Keymapp emparejaba por su cuenta, lo que
  ocultaba el fallo.
- **Keymapp** reacciona a nuestro `FW_VERSION` con su propio emparejamiento y consulta de
  versión; por eso algunos eventos llegan duplicados. Es inocuo.
- **Tipos `@girs`:** están fijados al conjunto `*-4.0.0-beta.36` (GLib 2.84 / Mutter 16) con
  `pnpm.overrides`. Sin eso, `gi://GLib` se resolvía a GLib 2.89 y faltaban APIs.
- **Suspensión:** además del monitor de `/dev`, se escucha `PrepareForSleep` de logind y al
  reanudar se repite el handshake.

## Tasks

### Descubrimiento
- [ ] Implementar `findVoyagerRawHid(): Promise<string | null>`, que recorre `/sys/class/hidraw/`
  con `Gio.File.enumerate_children_async`, filtra por VID `3297` en `uevent` y por el prefijo de
  descriptor `06 60 ff 09 61`, y devuelve `/dev/hidrawN` → `src/device/discovery.ts`

### Conexión
- [ ] Implementar la clase `VoyagerDevice` (con eventos al estilo `Signals` de GJS o callbacks
  tipados) → `src/device/voyager-device.ts`. Métodos y comportamiento:
  - **`start()`:** busca el dispositivo, lo abre en lectura y escritura, lanza el bucle de lectura
    y envía en secuencia `GET_PROTOCOL_VERSION`, `GET_FW_VERSION` y `PAIRING_INIT`, usando
    `buildCommand`.
  - **Parseo:** cada lectura pasa por `parseOryxPacket` y se reemite como `layer`, `keydown`,
    `keyup`, `firmware({layoutId, revisionId})` o `protocol(version)`.
  - **Protocolo no soportado:** si la versión no está en `SUPPORTED_PROTOCOL_VERSIONS`, emite
    `warning`, pero continúa.
  - **Estado:** `state`: `searching | connected | error`; emite `state-changed`.
  - **`stop()`:** cancela el `Gio.Cancellable`, cierra los streams y limpia timers y monitores.
    Debe ser idempotente.
- [ ] Reconexión: si la lectura falla (error de E/S o 0 bytes), cerrar, pasar a `searching` y
  reintentar con un `Gio.FileMonitor` sobre `/dev` (eventos `CREATED` de `hidraw*`) más un
  reintento con backoff (1 s, 2 s, 5 s, máximo 10 s), usando `GLib.timeout_add` y guardando el id
  para limpiarlo → `src/device/voyager-device.ts`
- [ ] Errores de permisos: si `open_readwrite` lanza `Gio.IOErrorEnum.PERMISSION_DENIED`, pasar a
  `error` con un mensaje que mencione `50-zsa.rules`, sin reintentos agresivos →
  `src/device/voyager-device.ts`

### Sonda de desarrollo
- [ ] Crear un script GJS independiente que instancia `VoyagerDevice`, imprime cada evento y
  termina con Ctrl+C (`GLib.MainLoop`, llamando a `stop()` al salir) → `src/dev/probe-device.ts`
  (se compila a `dist/dev/probe-device.js`; excluir `dist/dev/` del zip de la extensión)
- [ ] Añadir el script `"probe:device": "pnpm build && gjs -m dist/dev/probe-device.js"` →
  `package.json`

### Validación del mapeo (bloquea el criterio 5 del PRD)
- [ ] Con la sonda en marcha, pulsar Q, A, ESC, SPACE (pulgar izquierdo), Y y ENTER, y comprobar
  que `matrixToOryxIndex(row, col)` da 7, 13, 0, 24, 32 y 51. Anotar el resultado en el PR o en
  `docs/plan/CURRENT.md`. Si falla, corregir `src/core/geometry/voyager.ts` y sus tests.
