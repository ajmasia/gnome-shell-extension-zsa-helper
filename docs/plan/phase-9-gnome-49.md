# Phase 9: Port a GNOME 49

**Goal:** la extensión carga y funciona en GNOME Shell 49 sin perder GNOME 48, y los tipos `@girs`
corresponden a las versiones reales.
**Verification:** `pnpm typecheck && pnpm test && pnpm smoke` en un sistema con GNOME 49 (y otra
vez en GNOME 48), más las capturas de `pnpm nested --shots` sin errores.
**Dependencies:** ninguna. Abordarla cuando el sistema (Debian) pase a GNOME 49, o antes si se
quiere probar en una máquina virtual.

## Contexto

- `metadata.json` declara `"shell-version": ["48"]`. En GNOME 49 la Shell marcará la extensión
  como *OUT OF DATE* y no la cargará.
- Los tipos están fijados con `pnpm.overrides` al conjunto `*-4.0.0-beta.36` (GLib 2.84, Mutter
  16). En GNOME 49 cambian Mutter (17), GLib (2.86) y los nombres de los paquetes `@girs/*-17`.
- **APIs de la Shell y de Mutter que usa la extensión y conviene revisar en el port:**
  - Chrome: `Main.layoutManager.addTopChrome` y `removeChrome`.
  - Posición: `getWorkAreaForMonitor`, `primaryIndex`, `monitors`.
  - Atajo: `Main.wm.addKeybinding` y `removeKeybinding`.
  - Arrastre y cursor: `global.stage.grab()`, `global.display.set_cursor()`, `Meta.Cursor`.
  - Monitores: `global.display.get_monitor_index_for_rect()`,
    `global.backend.get_monitor_manager().get_monitor_for_connector()` y el D-Bus
    `org.gnome.Mutter.DisplayConfig`.
  - Bloqueos: `Clutter.get_default_backend().get_default_seat().get_keymap()`.
  - Animación: `actor.ease()`; la ampliación de tipos propia está en `src/types/clutter-ease.d.ts`.
  - Opacidad de grupo: `set_offscreen_redirect()`.
  - Capturas de desarrollo: `Shell.Screenshot`.
- La Shell anidada se lanza con `gnome-shell --nested`. En GNOME 49 podría haberse sustituido por
  `--devkit` (mutter-devkit); hay que revisar `scripts/nested.sh`.
- No se ha medido si GNOME 49 elimina la sesión X11 ni si eso afecta a algo: la extensión solo se
  prueba en Wayland.

## Tasks

### Tipos y metadatos
- [ ] Revisar las notas de migración de extensiones para GNOME 49 en gjs.guide y anotar aquí los
  cambios que afecten a las APIs de la lista → `docs/plan/phase-9-gnome-49.md`
- [ ] Actualizar `@girs/gnome-shell` a la versión 49 y regenerar `pnpm.overrides` con el conjunto
  de tipos correspondiente, siguiendo el mismo procedimiento que en la fase 3 (todos los paquetes
  en una única versión beta) → `package.json`, `pnpm-lock.yaml`
- [ ] Ampliar `shell-version` a `["48", "49"]` → `metadata.json`
- [ ] `pnpm typecheck` y corregir los errores de tipos → `src/**/*.ts`

### Comportamiento
- [ ] Revisar `scripts/nested.sh`: si `--nested` ya no existe, usar la alternativa y mantener
  intactos `--smoke` y `--shots` → `scripts/nested.sh`
- [ ] Comprobar la ampliación de tipos de `ease()`: si `@girs` ya la resuelve bien, borrarla →
  `src/types/clutter-ease.d.ts`
- [ ] Repetir en GNOME 49 las validaciones de las versiones anteriores:
  - Overlay y modo automático.
  - Atajo.
  - Resaltado de teclas y LED de bloqueo.
  - Arrastre y multimonitor (`MUTTER_DEBUG_NUM_DUMMY_MONITORS=2`).
  - Fundido.
  - Preferencias y pestaña *Status*.
  - Registrar el resultado en `docs/plan/acceptance.md`.
- [ ] Volver a validar en GNOME 48 que nada se ha roto → `docs/plan/acceptance.md`

### Decisión abierta
- [ ] ¿Mantener GNOME 48 o soltarlo? Si alguna API cambia de forma incompatible, decidir con el
  usuario entre compatibilidad condicional (comprobar la versión con `Config.PACKAGE_VERSION`) o
  exigir solo 49 → question: ¿sigue haciendo falta GNOME 48?
