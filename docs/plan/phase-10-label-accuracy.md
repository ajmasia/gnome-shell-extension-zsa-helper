# Phase 10: Precisión de las etiquetas

**Goal:** las etiquetas muestran lo que realmente escribe cada tecla, también con distribuciones de
GNOME que no son US y con capas encadenadas (tri-layer).
**Verification:** `pnpm test && pnpm test:gjs && pnpm typecheck`, más capturas de
`pnpm nested --shots` con la distribución `es` y con un layout de prueba con tri-layer.
**Dependencies:** conviene tener antes la Phase 8 (runner de tests GJS). La parte de xkbcommon
requiere un spike previo.

## Contexto

- **Etiquetas actuales:** `src/core/labels/us-keycodes.ts` es una tabla estática que asume una
  distribución US en GNOME. Desde la v0.4.0, *Status* avisa si la distribución no es US, pero las
  etiquetas siguen saliendo como si lo fuera: con `es`, `KC_SCLN` se muestra `;` y escribe `ñ`.
- **El spike original** (`docs/spikes/spike-voyager-layer-overlay.md`) comprobó con libxkbcommon
  vía ctypes (Python) que la traducción funciona para `us+altgr-intl` y `es`. Pero **GJS no tiene
  binding de libxkbcommon**, y la Shell no expone una consulta de keysym para una distribución
  arbitraria.
- **Opciones que hay que evaluar en un spike:**
  1. Lanzar `xkbcli compile-keymap --layout <l> --variant <v>` (paquete `libxkbcommon-tools`)
     con `Gio.Subprocess`, analizar el texto del keymap (`key <AC10> { [ ntilde, Ntilde, … ] };`)
     y convertir keysyms a Unicode con una tabla pura en `src/core/`. La dependencia sería
     opcional, con la tabla US como respaldo.
  2. Analizar directamente `/usr/share/X11/xkb/symbols/<layout>`. Sin dependencias, pero con
     `include` y variantes que hay que resolver.
- **Herencia de teclas transparentes:** hoy heredan siempre de la capa base
  (`resolveKeyLabel` en `src/core/labels/resolve.ts`). Es correcto con `LT`/`MO` desde la base,
  pero no con capas encadenadas: si la capa 4 se activa manteniendo la 1 y la 2, sus teclas
  transparentes deberían caer en la 2 o la 1, no en la 0. El firmware solo informa de la capa más
  alta (`ORYX_EVT_LAYER`), así que la pila de capas activas tiene que deducirse.

## Tasks

### Spike de xkbcommon
- [ ] Ejecutar `/new-generate-spike` con la pregunta: "¿Cómo obtener desde GJS el carácter que
  produce cada keycode con la distribución XKB activa: xkbcli, analizar los símbolos XKB u otra
  vía?" → `docs/spikes/spike-xkb-labels.md`

### Traducción según la distribución (tras el spike, suponiendo la opción 1)
- [ ] Analizador puro del texto de un keymap XKB, keycode → keysyms por nivel →
  `src/core/labels/xkb-keymap.ts`
- [ ] Tabla keysym → Unicode para los keysyms habituales, y teclas muertas → marca de tecla muerta
  (por ejemplo `´` en tenue) → `src/core/labels/keysyms.ts`
- [ ] Tabla keycode QMK → keycode evdev, más modificadores implícitos (`KC_LABK` = Shift+`KC_COMMA`)
  → `src/core/labels/qmk-evdev.ts`
- [ ] `resolveKeyLabel` acepta un traductor opcional; sin traductor usa la tabla US →
  `src/core/labels/resolve.ts`
- [ ] Tests con fixtures de keymaps `us`, `us+altgr-intl` y `es` → `tests/xkb-labels.test.ts`,
  `tests/fixtures/xkb-*.txt`
- [ ] Servicio GJS que obtiene el keymap de la distribución activa
  (`org.gnome.desktop.input-sources`), lo guarda en caché y lo recalcula al cambiarla →
  `src/layout/xkb-service.ts`
- [ ] *Status*: mostrar qué distribución se usa para las etiquetas, o avisar si falta
  `libxkbcommon-tools` y se usa la tabla US → `src/core/status.ts`

### Herencia en cadena de las capas
- [ ] Modelo puro de pila de capas: a partir de la secuencia de eventos `LAYER`, deducir qué capas
  siguen activas (pasar de 1 a 4 sin volver a 0 implica que la 1 sigue activa debajo) →
  `src/core/layer-stack.ts`
- [ ] Tests con secuencias reales: `LT` simple, tri-layer y cambios rápidos →
  `tests/layer-stack.test.ts`
- [ ] `resolveKeyLabel(layout, stack, key)` recorre la pila de arriba abajo hasta encontrar una
  tecla no transparente → `src/core/labels/resolve.ts`, `tests/labels.test.ts`
- [ ] La extensión mantiene la pila y la pasa al overlay → `src/extension.ts`,
  `src/ui/keyboard-overlay.ts`
- [ ] Question: la deducción puede equivocarse, por ejemplo con `TG` y `TO`. ¿Se aplica siempre, o
  se añade una opción "Inherit transparent keys from: base layer / active layers"?
