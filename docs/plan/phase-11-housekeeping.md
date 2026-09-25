# Phase 11: Mantenimiento

**Goal:** la caché no crece sin límite, se puede elegir teclado si hay varios ZSA conectados y no
queda E/S síncrona en el hilo de la Shell.
**Verification:** `pnpm test && pnpm test:gjs && pnpm typecheck && pnpm smoke`.
**Dependencies:** conviene tener antes la Phase 8 (runner de tests GJS).

## Contexto

- **Caché de layouts:** `~/.cache/zsa-helper/layouts/<layoutId>-<revisionId>.json`, unos 100 KB
  por revisión y nunca se limpia (`src/layout/cache.ts`). Si la Phase 8 añade el "último layout
  conocido", hay que conservar al menos la revisión anterior de cada layout.
- **Varios teclados ZSA:** `findZsaRawHid()` (`src/device/discovery.ts`) devuelve el primer
  `hidraw` que cumple (orden alfabético). Con dos Voyager, o una Voyager y otro ZSA, no se puede
  elegir.
- **E/S síncrona:** `LayoutCache.write` crea el directorio con `make_directory_with_parents`, que es
  síncrono. Gio no tiene variante asíncrona "with parents", así que habría que crear los niveles
  con `make_directory_async` o hacerlo una sola vez al iniciar.

## Tasks

### Limpieza de la caché
- [ ] `LayoutCache.prune({keepPerLayout: 3})`: por cada `layoutId`, conserva las N revisiones más
  recientes por fecha de modificación y borra el resto, de forma asíncrona →
  `src/layout/cache.ts`
- [ ] Llamar a `prune()` después de cada escritura que añade una revisión nueva →
  `src/layout/layout-service.ts`
- [ ] Tests con un directorio temporal → `tests-gjs/layout-cache.test.ts`

### Varios teclados ZSA
- [ ] `findZsaRawHid()` pasa a devolver todos los candidatos (ruta, nombre, producto, número de
  serie si el `uevent` lo trae) → `src/device/discovery.ts`
- [ ] Clave `keyboard` (s, vacía = el primero) con el identificador estable elegido →
  `schemas/org.gnome.shell.extensions.zsa-helper.gschema.xml`
- [ ] `VoyagerDevice` elige el teclado según el ajuste, con el primero como respaldo →
  `src/device/voyager-device.ts`
- [ ] Desplegable *Keyboard* en la pestaña *Status*, visible solo si hay más de uno. Las
  preferencias no ven `hidraw`, así que la lista la publica la extensión en el estado D-Bus →
  `src/prefs/status-group.ts`, `src/core/status.ts`, `src/lib/status-service.ts`
- [ ] Question: ¿qué identificador es estable entre reconexiones? El `hidrawN` cambia; comprobar
  si el `uevent` o sysfs exponen el número de serie USB (`HID_UNIQ`) en la Voyager.

### E/S síncrona
- [ ] Crear el directorio de caché de forma asíncrona, nivel a nivel con `make_directory_async` e
  ignorando `EXISTS` → `src/layout/cache.ts`
- [ ] Confirmar con `grep` que no queda ninguna llamada síncrona de Gio en el código de la Shell
  (`load_contents(`, `replace_contents(`, `make_directory`, `enumerate_children(`) → `src/`
