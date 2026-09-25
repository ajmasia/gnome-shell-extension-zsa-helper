# Phase 4: Obtención del layout (API de Oryx, caché propia, caché de Keymapp)

**Goal:** dado un `layoutId/revisionId`, el servicio devuelve un `Layout` normalizado y aplica la
cadena de respaldo: caché propia → API de Oryx → caché de Keymapp → error.
**Verification:** `pnpm build && gjs -m dist/dev/probe-layout.js aOa9o nlzDl9`, en tres pasadas:
1. Primera: `source=oryx-api`, 5 capas.
2. Segunda: `source=cache`.
3. Con la caché borrada y sin red (`--offline`, que simula el fallo de red): `source=keymapp`.
**Dependencies:** Phase 2 (`src/core/layout/*`). Es independiente de la Phase 3: los IDs se pasan
a mano.

## Contexto

- **API de Oryx** (pública, sin autenticación, verificada en el spike):
  - `POST https://oryx.zsa.io/graphql` con `Content-Type: application/json`.
  - Query:
    `query($h:String!,$r:String!,$g:String){layout(hashId:$h,revisionId:$r,geometry:$g){title revision{hashId title layers{title position color keys}}}}`
  - Variables `{h: layoutId, r: revisionId, g: "voyager"}`.
  - Si la respuesta trae `errors` o `data.layout` es null, se trata como fallo.
- **Caché de Keymapp:** `~/.config/.keymapp/keymapp.sqlite3`, tabla `revision(revisionId, data)`,
  donde `data` es el JSON completo con la forma `{layout: {...}}`.
  - Se lee **solo si `sqlite3` está en el `PATH`** (`GLib.find_program_in_path('sqlite3')`),
    con `Gio.Subprocess`:
    `sqlite3 -readonly <db> "select data from revision where revisionId = ?"`.
  - El revisionId se valida con `^[A-Za-z0-9]+$` antes de interpolarlo, porque el CLI no admite
    parámetros enlazados de forma cómoda.
  - Si no existe `sqlite3` o el fichero, se omite sin error.
- **Caché propia:** `~/.cache/zsa-helper/layouts/<layoutId>-<revisionId>.json`
  (`GLib.get_user_cache_dir()`). Se guarda el JSON crudo de Oryx y se normaliza al leer.
- Todo es asíncrono: `Soup.Session.send_and_read_async` y `Gio.File.load_contents_async` /
  `replace_contents_async`.

## Notas de implementación

- La sonda admite además `--clear` (borra la caché propia antes de cargar). Las pasadas de la
  verificación quedan así:
  1. `--clear` → `source=oryx-api`.
  2. Sin flags → `source=cache`.
  3. `--clear --offline` → `source=keymapp`.
- `--offline` apunta el cliente a `http://127.0.0.1:9/graphql` (conexión rechazada).
- Una revisión inexistente hace que Oryx responda
  `Cannot return null for non-nullable field Layout.revision`, que se trata como "no disponible".
- La única E/S síncrona es `make_directory_with_parents`, una vez por escritura en caché; Gio no
  tiene una variante asíncrona "with parents".

## Tasks

### Fuentes
- [ ] Implementar `fetchFromOryx(layoutId, revisionId, cancellable): Promise<unknown>` con
  `Soup.Session` (timeout 10 s y un User-Agent `zsa-helper/<version>`) →
  `src/layout/oryx-api.ts`
- [ ] Implementar `readCache` y `writeCache(layoutId, revisionId, json)`, creando directorios con
  `make_directory_with_parents` → `src/layout/cache.ts`
- [ ] Implementar `readFromKeymapp(revisionId): Promise<unknown | null>` con la detección de
  `sqlite3` y la validación del id → `src/layout/keymapp-cache.ts`

### Servicio
- [ ] Implementar `LayoutService.get(layoutId, revisionId, {forceRefresh?}): Promise<{layout, source}>`
  → `src/layout/layout-service.ts`
  - Orden: caché propia → API de Oryx (si va bien, guarda en caché) → Keymapp → lanza
    `LayoutUnavailableError`.
  - `forceRefresh` se salta la caché propia.
  - Normaliza con `layoutFromOryxJson` de `src/core/layout/from-oryx.ts`.
- [ ] Implementar `LayoutService.invalidate()`, que borra `~/.cache/zsa-helper/layouts/*` (lo usa
  el botón "refrescar layout" de las preferencias) → `src/layout/layout-service.ts`
- [ ] Implementar `destroy()`, que cancela peticiones en curso y aborta la sesión Soup →
  `src/layout/layout-service.ts`

### Sonda de desarrollo
- [ ] Crear el script GJS `probe-layout <layoutId> <revisionId> [--offline] [--refresh]`, que
  imprime `source`, título y número de capas y teclas → `src/dev/probe-layout.ts`
- [ ] Añadir el script `"probe:layout": "pnpm build && gjs -m dist/dev/probe-layout.js"` →
  `package.json`
