# Phase 2: Lógica pura (protocolo, layout, etiquetas, geometría, HUD)

**Goal:** todos los módulos de dominio sin dependencias de GNOME funcionan y están cubiertos por
tests con el layout real como fixture.
**Verification:** `pnpm test && pnpm typecheck`
**Dependencies:** Phase 1.

## Contexto

Todo lo de `src/core/` debe ser TypeScript puro: **sin imports `gi://` ni `resource://`**. Así se
prueba con Vitest en Node y lo reutilizan la extensión (GJS) y las preferencias.

### Protocolo Oryx

Fuente: `zsa/qmk_firmware`, `keyboards/zsa/common/oryx.{c,h}`. El firmware reporta el protocolo v5.

- Los paquetes son de 32 bytes: `[código, ...params, 0xFE (stop), 0…]`.
- **Comandos** (host → teclado):

  | Comando | Código |
  |---|---|
  | `GET_FW_VERSION` | `0x00` |
  | `PAIRING_INIT` | `0x01` |
  | `GET_PROTOCOL_VERSION` | `0xFE` |

- **Eventos** (teclado → host):

  | Evento | Código | Payload |
  |---|---|---|
  | `FW_VERSION` | `0x00` | ASCII `layoutId/revisionId` hasta `0xFE`, p. ej. `aOa9o/nlzDl9` |
  | `PAIRING_SUCCESS` | `0x04` | — |
  | `LAYER` | `0x05` | `[layer]` |
  | `KEYDOWN` | `0x06` | `[col, row]` (ojo: **primero col, luego row**) |
  | `KEYUP` | `0x07` | `[col, row]` |
  | `PROTOCOL_VERSION` | `0xFE` | `[version]` |
  | `ERROR` | `0xFF` | `[código]` |

- En hidraw la escritura lleva delante un byte de report-id `0x00`, así que ocupa 33 bytes. La
  lectura devuelve los 32 bytes sin report-id.

### Layout de Oryx

Es el JSON de la API GraphQL o de la caché de Keymapp:
`layout.revision.layers[] = { title, position, color?, keys[52] }`.

Cada tecla tiene esta forma:

```
{ customLabel, tap, hold, doubleTap, tapHold,
  glowColor, ... }
```

Cada acción (`tap`, `hold`, …) es `null` o
`{ code, layer, modifiers, macro, description }`:

- `code` es un keycode QMK: `KC_A`, `KC_LABK`, `KC_TRANSPARENT`, `MO`, `OSM`, `CW_TOGG`, `QK_BOOT`,
  `RGB_*`, `TOGGLE_LAYER_COLOR`…
- `layer` indica la capa destino en `MO` y en `hold` de capa.
- `modifiers` es un objeto con los booleanos `leftCtrl`, `leftShift`, `leftAlt`, `leftGui`, más
  sus equivalentes `right*`.

### Orden de las 52 teclas de Oryx (verificado con el layout real)

| Índices | Zona |
|---|---|
| 0–23 | Mitad izquierda, 4 filas × 6, de izquierda a derecha |
| 24–25 | Pulgares izquierdos |
| 26–49 | Mitad derecha, 4 filas × 6 |
| 50–51 | Pulgares derechos |

Ejemplos de la capa Main: 0=ESC, 7=Q, 13=A, 24=SPACE, 26=6, 32=Y, 50=BSPC, 51=ENTER.

### Tabla Oryx índice → matriz `[row, col]` → posición `x,y`

Derivada de `keyboards/zsa/voyager/keyboard.json`. Formato `idx:(row,col)@x,y`:

```
0:(0,1)@0,0.5 1:(0,2)@1,0.5 2:(0,3)@2,0.25 3:(0,4)@3,0 4:(0,5)@4,0.25 5:(0,6)@5,0.5
6:(1,1)@0,1.5 7:(1,2)@1,1.5 8:(1,3)@2,1.25 9:(1,4)@3,1 10:(1,5)@4,1.25 11:(1,6)@5,1.5
12:(2,1)@0,2.5 13:(2,2)@1,2.5 14:(2,3)@2,2.25 15:(2,4)@3,2 16:(2,5)@4,2.25 17:(2,6)@5,2.5
18:(3,1)@0,3.5 19:(3,2)@1,3.5 20:(3,3)@2,3.25 21:(3,4)@3,3 22:(3,5)@4,3.25 23:(4,4)@5,3.5
24:(5,0)@5,4.5 25:(5,1)@6,4.75
26:(6,0)@10,0.5 27:(6,1)@11,0.25 28:(6,2)@12,0 29:(6,3)@13,0.25 30:(6,4)@14,0.5 31:(6,5)@15,0.5
32:(7,0)@10,1.5 33:(7,1)@11,1.25 34:(7,2)@12,1 35:(7,3)@13,1.25 36:(7,4)@14,1.5 37:(7,5)@15,1.5
38:(8,0)@10,2.5 39:(8,1)@11,2.25 40:(8,2)@12,2 41:(8,3)@13,2.25 42:(8,4)@14,2.5 43:(8,5)@15,2.5
44:(10,2)@10,3.5 45:(9,1)@11,3.25 46:(9,2)@12,3 47:(9,3)@13,3.25 48:(9,4)@14,3.5 49:(9,5)@15,3.5
50:(11,5)@9,4.75 51:(11,6)@10,4.5
```

## Tasks

### Fixtures
- [ ] Exportar la revisión real `aOa9o/nlzDl9` desde la caché de Keymapp:
  `sqlite3 ~/.config/.keymapp/keymapp.sqlite3 "select data from revision where revisionId='nlzDl9'" > tests/fixtures/layout-aOa9o-nlzDl9.json`
  Después, quitar del JSON los campos personales que no hagan falta (`user.pictureUrl`, etc.).
  → `tests/fixtures/layout-aOa9o-nlzDl9.json`
- [ ] Guardar la respuesta GraphQL equivalente, para probar el parser de la API:
  `curl -s https://oryx.zsa.io/graphql -H 'Content-Type: application/json' -d '{"query":"query($h:String!,$r:String!,$g:String){layout(hashId:$h,revisionId:$r,geometry:$g){title revision{hashId title layers{title position color keys}}}}","variables":{"h":"aOa9o","r":"nlzDl9","g":"voyager"}}' > tests/fixtures/oryx-graphql-aOa9o-nlzDl9.json`
  → `tests/fixtures/oryx-graphql-aOa9o-nlzDl9.json`

### Protocolo Oryx
- [ ] Definir los tipos de evento como una unión discriminada: `FwVersion{layoutId, revisionId}`,
  `PairingSuccess`, `Layer{layer}`, `KeyDown{row, col}`, `KeyUp{row, col}`,
  `ProtocolVersion{version}`, `OryxError{code}` y `Unknown{code}` → `src/core/oryx/types.ts`
- [ ] Implementar `parseOryxPacket(bytes: Uint8Array): OryxEvent` (convierte `[col, row]` en
  `{row, col}`) → `src/core/oryx/parse.ts`
- [ ] Implementar `buildCommand(cmd, ...params): Uint8Array` de 33 bytes (report-id 0 más 32) y
  exportar las constantes `CMD_GET_FW_VERSION`, `CMD_PAIRING_INIT` y `CMD_GET_PROTOCOL_VERSION`
  (no exportar `SET_LAYER` ni RGB) → `src/core/oryx/commands.ts`
- [ ] Declarar `SUPPORTED_PROTOCOL_VERSIONS = [4, 5]` →
  `src/core/oryx/commands.ts`
- [ ] Tests: paquetes reales del spike (`fe 05 fe`, `00 'aOa9o/nlzDl9' fe`, `05 02 fe`,
  `06 04 08 fe` → `KeyDown{row:8, col:4}`), un código desconocido y un buffer corto →
  `tests/oryx.test.ts`

### Modelo de layout
- [ ] Definir el modelo normalizado: `Layout{layoutId, revisionId, title, layers: Layer[]}`,
  `Layer{index, title, color?, keys: KeyAction[52]}` y
  `KeyAction{tap?, hold?, doubleTap?, tapHold?, customLabel?}` → `src/core/layout/model.ts`
- [ ] Implementar `layoutFromOryxJson(json)`, que acepta tanto la forma de la API
  (`data.layout`) como la de la caché de Keymapp (`layout`), y lanza un error descriptivo si
  faltan capas o no hay exactamente 52 teclas → `src/core/layout/from-oryx.ts`
- [ ] Tests con los dos fixtures: 5 capas (Main, Nav, Sym, Brd+Sys, Sym+Num) de 52 teclas; Main[7]
  es `KC_Q` y Sym[32] es `KC_LABK` → `tests/layout.test.ts`

### Etiquetas
- [ ] Crear la tabla estática `KC_* → etiqueta` para distribución US que cubra **todos** los
  keycodes del fixture:
  - Letras, números y `KC_F1`–`KC_F12`.
  - Símbolos US (`KC_LABK` `<`, `KC_LBRC` `[`, `KC_GRAVE` `` ` ``, `KC_TILD` `~`,
    `KC_PIPE` `|`, …).
  - Navegación con flechas o texto corto (`←`, `PgUp`, `Home`…).
  - Modificadores (`⇧`, `Ctrl`, `Alt`, `Super`).
  - Multimedia (`🔇`, `🔉`, `🔊`, `⏯`, `⏭`, `⏮`, `⏹`).
  - `KC_ENTER` `⏎`, `KC_BSPC` `⌫`, `KC_TAB` `⇥`, `KC_SPACE` `␣`, `KC_ESCAPE` `Esc`,
    `KC_DELETE` `Del`, `KC_CAPS` `Caps`, `KC_WWW_BACK`/`KC_WWW_FORWARD`.
  - → `src/core/labels/us-keycodes.ts`
- [ ] Implementar `resolveKeyLabel(layout, layerIdx, keyIdx): KeyLabel`, con
  `{main, sub?, inherited, kind: 'char'|'action'|'layer'|'modifier'|'empty'}` →
  `src/core/labels/resolve.ts`. Reglas en este orden:
  1. `customLabel` tiene prioridad.
  2. `KC_TRANSPARENT` o una tecla sin acciones (`null`, que Oryx compila como `KC_TRANSPARENT`)
     hereda de la capa base (0) y marca `inherited: true` (decisión revisada: ver el PRD).
  3. `MO` y `hold` con `layer` muestran el título de la capa destino (p. ej. `▸Sym`).
  4. `OSM` usa el símbolo de su modificador; `CW_TOGG` → `CapsW`, `QK_BOOT` → `Boot`,
     `RGB_*` / `TOGGLE_LAYER_COLOR` → `RGB…`.
  5. Si hay `modifiers`, se antepone el prefijo (`C-⇧ Tab` para Ctrl+Shift+Tab).
  6. `hold`/`tapHold` distinto del tap va a `sub`.
  7. `null` → `kind: 'empty'`.
  8. Keycode desconocido: se muestra el code sin `KC_` y se registra un aviso.
- [ ] Tests: todas las teclas de las 5 capas resuelven sin lanzar errores; aparecen las etiquetas
  personalizadas "Prev Tab", "Next Tab", "Back", "Fwd" y "€"; las transparentes de Brd+Sys salen
  con `inherited`; las `MO` muestran el nombre de capa → `tests/labels.test.ts`

### Geometría
- [ ] Crear la tabla de la sección de contexto como `VOYAGER_KEYS: {row, col, x, y}[52]`, indexada
  por el índice de Oryx, más `matrixToOryxIndex(row, col): number | undefined` →
  `src/core/geometry/voyager.ts`
- [ ] Tests: 52 entradas únicas; `matrixToOryxIndex(1,2) === 7` (Q) y
  `matrixToOryxIndex(11,6) === 51`; una posición inexistente devuelve `undefined` →
  `tests/geometry.test.ts`

### Máquina de estados de visibilidad (HUD + toggle)
- [ ] Implementar `VisibilityController`, con reloj y timers inyectables →
  `src/core/visibility.ts`
  - **Entradas:** `onLayer(n)`, `onToggle()` y `setConfig({hudEnabled, showDelay, hideDelay})`.
  - **Salida:** callback `onVisibleChange(boolean)`.
  - **Reglas:**
    - El toggle fija o quita un estado `pinned`.
    - Con el HUD activo y la capa ≠ 0, se muestra tras `showDelay`; si la capa vuelve a 0 antes,
      se cancela.
    - Al volver a 0 se oculta tras `hideDelay`, salvo si está `pinned`.
    - Con `hudEnabled = false`, solo cuenta el toggle.
- [ ] Tests con timers falsos de Vitest (`vi.useFakeTimers`) → `tests/visibility.test.ts`. Casos:
  - Cambio rápido 0→2→0 en menos de 150 ms: no se muestra.
  - Mantener la capa 2 más de 150 ms: se muestra; al volver a 0 se oculta a los 300 ms.
  - Fijado y luego capa 0: no se oculta.
  - HUD desactivado.
