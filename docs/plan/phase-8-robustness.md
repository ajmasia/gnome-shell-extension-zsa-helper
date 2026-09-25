# Phase 8: Robustez (tests de la capa GJS y último layout conocido)

**Goal:** la capa GJS (dispositivo y servicio de layout) tiene tests automáticos. Si la revisión
flasheada no se puede cargar, el overlay sigue funcionando con el último layout conocido, con un
aviso. Las dos validaciones pendientes del MVP quedan cerradas.
**Verification:** `pnpm test && pnpm test:gjs && pnpm typecheck && pnpm smoke`, y la tabla de
`docs/plan/acceptance.md` con el criterio 8 y la latencia en ✅.
**Dependencies:** ninguna (parte de la v0.4.1).

## Contexto

- **Tests actuales:** `src/core/` está cubierto con Vitest en Node (91 tests). La capa GJS
  (`src/device/`, `src/layout/`, `src/lib/`, `src/ui/`) solo se prueba con los scripts de prueba
  (`pnpm probe:*`), `pnpm smoke`, las capturas de la Shell anidada y validación manual. Ahí han
  aparecido los fallos serios: escrituras corruptas con `write_all_async`, emparejamiento que
  dependía de Keymapp, y errores de listeners que se tomaban por desconexiones.
- **Dependencias directas de `VoyagerDevice` (`src/device/voyager-device.ts`):** abre
  `Gio.File(path).open_readwrite_async`, lee con `read_bytes_async`, escribe con
  `write_bytes_async`, descubre con `findZsaRawHid()` (`src/device/discovery.ts`) y vigila `/dev`
  con `Gio.FileMonitor` y logind con `PrepareForSleep`. Para poder probarlo hay que inyectar esas
  dependencias.
- **`LayoutService` (`src/layout/layout-service.ts`)** ya acepta `api`, `cache` y `keymappDb` por
  constructor, así que es fácil de probar con dobles.
- **GJS no corre en Node:** los tests de esta capa se ejecutan con `gjs -m`. Se propone un runner
  mínimo propio, sin dependencias, para no añadir Jasmine ni similares.
- **Último layout conocido:** hoy, si la revisión nueva no está en caché y Oryx no responde,
  `LayoutUnavailableError` deja el overlay en *Layout not available*. La caché propia
  (`~/.cache/zsa-helper/layouts/<layoutId>-<revisionId>.json`) guarda revisiones anteriores que
  podrían servir como respaldo.
- **Validaciones pendientes de la v0.1.0:** criterio 8 (flasheo real) y la latencia en ms
  (`ZSA_HELPER_DEBUG=1`, log `layer N painted in X ms`).

## Notas de implementación

- **Runner GJS:** `tests-gjs/harness.ts` (`describe`/`it`/`expect`/`waitFor`) y `tests-gjs/main.ts`,
  que descubre los `*.test.js` compilados. `pnpm test:gjs` compila con `tsconfig.gjs-tests.json`
  a `dist-tests/` y los ejecuta. `pnpm typecheck` también comprueba los tests GJS.
- **`VoyagerDevice`** recibe `{environment, timings, onListenerError}`. `DeviceEnvironment`
  (`src/device/transport.ts`) agrupa `find`/`open`/`watchHotplug`/`watchResume`, y
  `systemEnvironment` es la implementación real. `PermissionDeniedError` sustituye a la
  comprobación de `GLib.Error`.
- **Los tests se han validado con mutaciones:** invertir el orden del handshake y quitar el
  aislamiento de listeners hacen fallar 3 tests.
- **Último layout conocido:** `LayoutCache.latestFor()` elige la revisión más reciente por fecha de
  modificación y `LayoutService` la devuelve como `source: 'stale-cache'`. Comprobado con el sistema
  real: `probe:layout aOa9o newRev2 --offline` → `stale-cache`, revisión `nlzDl9`.
- **La extensión reintenta la revisión correcta** al reconectar (evento de firmware), al pulsar
  *Refresh* y cuando `Gio.NetworkMonitor` informa de que vuelve la red.
- **Latencia:** medida en la Shell anidada desde `showLayer()` hasta el siguiente `after-paint`, con
  30 cambios: mediana 14,7 ms y máximo 22,3 ms. No incluye el informe USB (~1 ms).

## Tasks

### Runner de tests GJS
- [ ] Crear un runner mínimo: carga los ficheros `*.test.js` compilados, expone `describe`, `it` y
  `expect` básicos (`toBe`, `toEqual`, `toThrow`, `rejects`), ejecuta el main loop de GLib para
  los tests asíncronos y termina con código ≠ 0 si algo falla → `tests-gjs/runner.ts`
- [ ] Añadir `tsconfig.gjs-tests.json`, que compila `tests-gjs/**/*.ts` a `dist-tests/` con los
  tipos de GJS → `tsconfig.gjs-tests.json`
- [ ] Añadir el script `"test:gjs": "tsc -p tsconfig.gjs-tests.json && gjs -m dist-tests/runner.js"`
  → `package.json`
- [ ] Añadir `dist-tests/` a `.gitignore` → `.gitignore`

### Dispositivo testeable
- [ ] Definir la interfaz `HidTransport` (`open(path)`, `read(size)`, `write(bytes)`, `close()`)
  y `HidDiscovery` (`find()`), con implementaciones reales sobre Gio → `src/device/transport.ts`
- [ ] Hacer que `VoyagerDevice` acepte `{transport, discovery, hotplug, sleep}` por constructor,
  con las implementaciones reales por defecto; sin cambio de comportamiento →
  `src/device/voyager-device.ts`
- [ ] Tests con un transporte falso → `tests-gjs/voyager-device.test.ts`
  - El handshake envía `GET_PROTOCOL_VERSION`, `GET_FW_VERSION` y `PAIRING_INIT`, en ese orden y
    con 33 bytes cada uno.
  - Los paquetes de capa, tecla y firmware se reemiten como eventos.
  - Un fallo de lectura provoca `searching`, reintento y `connected` de nuevo.
  - `PERMISSION_DENIED` provoca el estado `error` sin reintentos agresivos.
  - Un listener que lanza no provoca reconexión (regresión de la v0.4.1).
  - `stop()` durante `connect()` no deja el estado en `connected` ni el stream abierto.
  - La reanudación tras suspender repite el handshake.

### Servicio de layout testeable
- [ ] Tests con API, caché y Keymapp falsos → `tests-gjs/layout-service.test.ts`
  - Orden caché → Oryx → Keymapp.
  - Lo descargado de Oryx se guarda en caché y un fallo al escribir no oculta el layout.
  - `forceRefresh` se salta la caché.
  - La cancelación no se convierte en `LayoutUnavailableError`.

### Último layout conocido
- [ ] En `LayoutCache`, añadir `latestFor(layoutId)`, que devuelve la revisión más reciente en
  caché de ese layout por fecha de modificación → `src/layout/cache.ts`
- [ ] En `LayoutService.get`, si todas las fuentes fallan, devolver `latestFor(layoutId)` con
  `source: 'stale-cache'` y la revisión que realmente se muestra → `src/layout/layout-service.ts`
- [ ] Añadir `source: 'stale-cache'` al modelo de estado, y que *Status* lo muestre como aviso:
  *"Showing revision X; revision Y could not be loaded"* → `src/core/status.ts`,
  `tests/status.test.ts`
- [ ] En la extensión, mostrar el layout desfasado y reintentar la revisión correcta al
  refrescar o al reconectar → `src/extension.ts`
- [ ] Tests del respaldo → `tests-gjs/layout-service.test.ts`

### Validaciones pendientes
- [ ] Criterio 8: flashear un cambio mínimo desde Oryx y comprobar en *Status* que *Layout* pasa a
  la revisión nueva con origen *Oryx*, sin intervención → `docs/plan/acceptance.md`
- [ ] Latencia: `ZSA_HELPER_DEBUG=1 pnpm nested`, fijar el overlay, cambiar de capa unas 20 veces y
  anotar la mediana y el máximo de `painted in X ms` → `docs/plan/acceptance.md`

### Documentación
- [ ] Mencionar `pnpm test:gjs` en la tabla de desarrollo del README → `README.md` (en el commit
  de release)
