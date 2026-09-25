# Phase 5: Overlay, atajo, HUD y resaltado integrados en la extensión

**Goal:** con la extensión activada, `Super+Alt+K` muestra y oculta el overlay con la capa activa.
El overlay aparece solo al mantener una capa, resalta las teclas pulsadas y no deja restos al
desactivar la extensión.
**Verification:** `pnpm build && pnpm test && pnpm nested`. Dentro de la Shell anidada, tras
`gnome-extensions enable zsa-helper@ajmasia`, recorrer el checklist manual del final.
**Dependencies:** Phases 2, 3 y 4.

## Contexto

- **El overlay NO es una ventana:** es un actor `St` añadido con
  `Main.layoutManager.addTopChrome(actor, {affectsInputRegion: false, trackFullscreen: false})`
  o equivalente.
  - No tiene barra de título ni decoraciones, y no aparece en Alt+Tab, actividades ni el dock.
  - Es `reactive: false`: no recibe clics ni roba el foco.
  - Se ve sobre ventanas a pantalla completa (a validar).
- **Atajo:** `Main.wm.addKeybinding('toggle-overlay', this.getSettings(),
  Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.ALL, cb)` al activar y
  `Main.wm.removeKeybinding('toggle-overlay')` al desactivar.
- **Geometría:** `VOYAGER_KEYS[i].x/y` en unidades de tecla (x de 0 a 15, y de 0 a 4.75). Cada
  tecla se posiciona en absoluto dentro de un contenedor con `Clutter.FixedLayout`:
  `x * (keySize + gap) * scale`.
- **Etiquetas:** `resolveKeyLabel(layout, layer, idx)` devuelve `{main, sub?, inherited, kind}`
  (`src/core/labels/resolve.ts`).
- **Visibilidad:** `VisibilityController` (`src/core/visibility.ts`) decide cuándo mostrar. La UI
  solo reacciona a `onVisibleChange`.
- **Resaltado:** `keydown{row, col}` → `matrixToOryxIndex` → la tecla recibe la clase
  `zsa-key-pressed`; `keyup` se la quita.
- **Guidelines de EGO:** todo lo creado en `enable()` se destruye en `disable()`: actores,
  keybinding, handlers de `settings.connect`, `VoyagerDevice.stop()`,
  `LayoutService.destroy()`, timers y fuentes de `GLib`.

## Notas de implementación

- **Capturas automáticas:** `pnpm nested --shots [dir]` arranca la Shell anidada con
  `ZSA_HELPER_SCREENSHOT_DIR`. Un gancho de desarrollo (`src/dev/screenshots.ts`, cargado con
  `import()` dinámico solo si existe la variable) captura el overlay de cada capa y un estado con
  teclas pulsadas. Hace falta porque el D-Bus de capturas de GNOME está restringido.
- **El smoke test comprueba descriptores:** con la extensión activa la Shell tiene 1 fd abierto
  a `/dev/hidraw*`; al desactivarla, 0.
- **`actor.ease()`:** la ampliación de tipos de `@girs/gnome-shell` no surte efecto (amplía el
  índice del paquete, no el módulo con el namespace). Hay una propia en
  `src/types/clutter-ease.d.ts`.
- **Teclas `RGB`:** muestran el color que fijan como un punto bajo la etiqueta; el texto
  coloreado no se leía con colores oscuros.
- **Etiquetas largas** ("Layer Color") parten en dos líneas en vez de truncarse.

## Tasks

### Widgets
- [ ] Crear el widget `KeyCap` (`St.Widget` con dos `St.Label`, `main` y `sub`), con las clases
  CSS `zsa-key`, `zsa-key--inherited`, `zsa-key--empty`, `zsa-key--action`, `zsa-key--layer` y
  `zsa-key-pressed` → `src/ui/key-cap.ts`
- [ ] Crear `KeyboardOverlay`, un `St.BoxLayout` vertical con:
  - Cabecera con el nombre de la capa y un punto con el color de capa de Oryx, si existe.
  - Contenedor `FixedLayout` con 52 `KeyCap` según `VOYAGER_KEYS`.
  - Métodos `setLayout(layout)`, `showLayer(n)`, `pressKey(idx)`, `releaseKey(idx)`,
    `setScale(s)` y `setOpacity(o)`.
  - → `src/ui/keyboard-overlay.ts`
- [ ] Posicionamiento según la clave `position`, relativo a `Main.layoutManager.primaryMonitor`,
  con un margen de 48 px; recolocar con la señal `monitors-changed` → `src/ui/positioning.ts`
- [ ] Animación de mostrar y ocultar: `ease()` de opacidad en 120 ms, con
  `Clutter.AnimationMode.EASE_OUT_QUAD` → `src/ui/keyboard-overlay.ts`
- [ ] Estilos:
  - Panel con fondo oscuro semitransparente, `border-radius: 16px` y `box-shadow`.
  - Teclas con `border-radius: 8px` y fuente monoespaciada.
  - Teclas heredadas con `opacity: 0.45`.
  - Teclas pulsadas con fondo de acento.
  - → `stylesheet.css` (y copiarlo a `dist/` en `scripts/copy-assets.mjs`)

### Integración
- [ ] Completar `ZsaHelperExtension.enable()` → `src/extension.ts`:
  1. Crear settings y `VoyagerDevice`.
  2. Crear `LayoutService` y `VisibilityController`.
  3. Crear el overlay oculto.
  4. Registrar el keybinding.
  5. Conectar los eventos:
     - `firmware` → `LayoutService.get` → `overlay.setLayout`.
     - `layer` → `overlay.showLayer` + `visibility.onLayer`.
     - `keydown`/`keyup` → resaltado (si `highlight-enabled`).
     - `state-changed` de error → overlay con un mensaje ("Voyager no detectada" o "Sin permisos:
       instala 50-zsa.rules").
- [ ] Reaccionar en caliente a los cambios de settings (`hud-*`, `highlight-enabled`, `position`,
  `opacity`, `scale`), guardando los ids de los handlers → `src/extension.ts`
- [ ] Layout no disponible (`LayoutUnavailableError`): el overlay muestra "Layout no disponible
  (sin red ni caché)" y registra el error; la extensión no se rompe → `src/extension.ts`
- [ ] Completar `disable()`, con limpieza total en orden inverso y todas las referencias a `null`
  → `src/extension.ts`
- [ ] Escuchar `changed::refresh-requested` (clave definida en la Phase 1) → `LayoutService.get(..., {forceRefresh: true})` → `overlay.setLayout` → `src/extension.ts`

### Checklist manual (en la Shell anidada y luego en la sesión real)
- [ ] `Super+Alt+K` muestra y oculta el overlay desde cualquier app; el foco no cambia (el texto
  sigue escribiéndose en el editor).
- [ ] Sin barra de título; no aparece en Alt+Tab ni en actividades.
- [ ] Mantener `MO` de Sym más de 150 ms muestra Sym; al soltar se oculta a los 300 ms. Un toque
  rápido de `MO` no provoca parpadeo.
- [ ] Brd+Sys muestra atenuadas las teclas heredadas; aparecen las etiquetas "Prev Tab", "Next
  Tab", "Back", "Fwd" y "€".
- [ ] El resaltado de teclas coincide con la posición física en las 5 capas.
- [ ] Desconectar y reconectar el USB recupera la detección de capa.
- [ ] Con Keymapp abierto, su live training sigue funcionando.
- [ ] Tras `gnome-extensions disable`, no queda el actor (Looking Glass: `Main.layoutManager.uiGroup`),
  no queda el keybinding y `ls -l /proc/$(pgrep -f 'gnome-shell --nested')/fd | grep hidraw` no
  devuelve nada.
