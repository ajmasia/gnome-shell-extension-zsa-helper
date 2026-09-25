# Phase 6: Ventana de preferencias (Adw)

**Goal:** todas las opciones del PRD se configuran desde `gnome-extensions prefs zsa-helper@ajmasia`
y se aplican en caliente a la extensión.
**Verification:** `pnpm build && pnpm run install:local && gnome-extensions prefs zsa-helper@ajmasia`.
Cada control cambia su clave, lo que se comprueba con
`gsettings --schemadir dist/schemas monitor org.gnome.shell.extensions.zsa-helper`.
**Dependencies:** Phase 1 (esquema). Para verlo aplicado en caliente hace falta la Phase 5.

## Contexto

- `src/prefs.ts` corre en un proceso aparte (GTK4/Adw), **no en la Shell**: no puede importar
  `resource:///org/gnome/shell/ui/*`. Solo puede usar `src/core/` y los settings.
- Claves (ver el esquema): `toggle-overlay` (`as`), `hud-enabled` (`b`), `hud-show-delay` (`u`),
  `hud-hide-delay` (`u`), `highlight-enabled` (`b`), `position` (`s`), `opacity` (`d`),
  `scale` (`d`) y `refresh-requested` (`u`).
- Esta ventana sí es una ventana normal con su barra de título Adw (decisión del PRD).

## Notas de implementación

- La construcción de la ventana vive en `src/prefs/build.ts` (`buildPreferences(window, settings,
  version)`), separada de `ExtensionPreferences`.
- `pnpm probe:prefs [dir]` abre la ventana con `Gio.memory_settings_backend_new()` (la
  configuración real no se toca). Captura `prefs-default.png`, cambia varias claves por código y
  captura `prefs-changed.png`, lo que verifica el sentido ajustes → interfaz.
- `settings.bind` no puede enlazar una clave `u` con la propiedad `value` (double) de
  `Adw.SpinRow`; los retardos se sincronizan a mano.
- La captura del atajo usa un `Adw.Dialog` con `Gtk.EventControllerKey`: Esc cancela,
  Retroceso desactiva y se exige al menos un modificador.

## Tasks

### Páginas y grupos
- [ ] Grupo "Atajo" con una fila que muestra el acelerador actual y un botón "Cambiar" →
  `src/prefs/shortcut-row.ts`
  - El botón abre un diálogo que captura la siguiente combinación con
    `Gtk.EventControllerKey`: Escape cancela y Retroceso borra el atajo.
  - La combinación se valida con `Gtk.accelerator_valid` y se guarda con `Gtk.accelerator_name`.
- [ ] Grupo "Mostrar automáticamente (HUD)" → `src/prefs.ts`
  - `Adw.SwitchRow` para `hud-enabled`.
  - Dos `Adw.SpinRow` (0–1000 ms, paso 50) para `hud-show-delay` y `hud-hide-delay`, desactivadas
    si el HUD está apagado.
- [ ] Grupo "Apariencia" → `src/prefs.ts`
  - `Adw.ComboRow` para `position`, con las 6 opciones traducidas a texto legible.
  - `Adw.SpinRow` o slider para `opacity` (0.3–1.0) y `scale` (0.5–2.0).
  - `Adw.SwitchRow` para `highlight-enabled`.
- [ ] Grupo "Layout" → `src/prefs.ts`
  - Botón "Refrescar layout", que incrementa `refresh-requested`.
  - Texto de ayuda: el layout se obtiene del teclado y de Oryx automáticamente.
- [ ] Enlazar los controles con `settings.bind(...)` siempre que sea posible, en vez de handlers
  manuales → `src/prefs.ts`
