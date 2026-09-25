# Validaciones por fase

Registro de las pruebas hechas al cerrar cada fase, antes de etiquetar la versión.

## v0.0.1: Phase 1 (setup y esqueleto)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm build` desde un `dist/` limpio | ✅ genera `extension.js`, `prefs.js`, `metadata.json` y `schemas/gschemas.compiled` |
| `pnpm test` | ✅ 1/1 |
| `pnpm typecheck` | ✅ los tipos de GNOME 48 son efectivos (un código erróneo a propósito produce errores de tipo) |
| `pnpm smoke` (Shell anidada) | ✅ `enabled` → ACTIVE (1), `disabled` → INACTIVE (2), sin errores de JS |
| Aislamiento de dconf | ✅ `enabled-extensions` de la sesión real no contiene `zsa-helper@ajmasia` |
| Commits firmados | ✅ firma SSH válida con `ajmasia.dev@ysnp.link` |

## v0.0.2: Phase 2 (lógica pura)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` | ✅ 42 tests en 5 ficheros (protocolo, layout, etiquetas, geometría, visibilidad) |
| `pnpm typecheck` | ✅ incluye los tests, compilados sin tipos de GNOME: `src/core/` no depende de GNOME |
| Mapeo Oryx → QMK | ✅ 260/260 teclas coinciden con el `keymap.c` compilado del layout real (test automático) |
| Etiquetas | ✅ las 260 teclas del layout real resuelven sin keycodes desconocidos |
| `pnpm smoke` | ✅ la extensión sigue activándose y desactivándose sin errores |

**Decisión revisada:** las teclas transparentes heredan de la capa base (ver el PRD).
**Pendiente para la fase 3:** validar con pulsaciones reales la traducción del evento (fila, columna)
a la tecla.

## v0.0.3: Phase 3 (conexión con el teclado)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` / `pnpm typecheck` | ✅ 50 tests; tipos `@girs` fijados a GNOME 48 |
| Descubrimiento | ✅ localiza `/dev/hidraw4` por VID y descriptor raw HID |
| Handshake | ✅ protocolo 5 y firmware `aOa9o/nlzDl9`, sin errores `0xFF` tras corregir las escrituras |
| Emparejamiento sin Keymapp | ✅ validado por el usuario: los eventos de capa llegan con Keymapp cerrado |
| Mapeo evento → tecla | ✅ validado por el usuario: Q, A, ESC, SPACE, Y y ENTER dan 7, 13, 0, 24, 32 y 51 |
| Reconexión USB | ✅ validado por el usuario: `searching` → `connected` sin reiniciar |
| Suspensión y reanudación | ✅ validado por el usuario |
| Convivencia con Keymapp | ✅ validado por el usuario |
| `pnpm smoke` | ✅ sin regresiones |

## v0.0.4: Phase 4 (obtención del layout)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `probe:layout --clear` | ✅ `source=oryx-api` (387 ms), 5 capas × 52 teclas (ejecutado por el usuario) |
| `probe:layout` | ✅ `source=cache` (2 ms) (ejecutado por el usuario) |
| `probe:layout --clear --offline` | ✅ `source=keymapp` (12 ms) (ejecutado por el usuario) |
| Revisión inexistente, con y sin red | ✅ `LayoutUnavailableError` con el motivo de cada fuente |
| IDs inválidos | ✅ rechazados antes de tocar disco, red o SQL |
| `pnpm test` / `typecheck` / `smoke` | ✅ 57 tests, sin regresiones |

## v0.0.5: Phase 5 (overlay, atajo, HUD y resaltado)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` / `typecheck` | ✅ 62 tests |
| Capturas en la Shell anidada (`pnpm nested --shots`) | ✅ las 5 capas y el resaltado se renderizan sin errores de JS |
| `pnpm smoke` | ✅ ACTIVE con 1 fd de hidraw → INACTIVE con 0 fds (sin restos al desactivar) |
| HUD al mantener una capa | ✅ validado por el usuario |
| Atajo `Super+Alt+K` sin robar el foco | ✅ validado por el usuario |
| Resaltado en la posición física | ✅ validado por el usuario |
| Reconexión con el overlay visible | ✅ validado por el usuario |
| Sin barra de título, fuera de Alt+Tab | ✅ actor de chrome de la Shell, no una ventana |

**Ajuste tras la revisión:** el overlay mantiene la capa consultada mientras se oculta, en lugar de
mostrar la base antes de desaparecer.

## v0.0.6: Phase 6 (preferencias)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` / `typecheck` | ✅ 62 tests |
| `pnpm probe:prefs` | ✅ los cambios en los ajustes se reflejan en la interfaz (atajo, HUD, posición, tamaño) |
| `prefs.js` en la app Extensiones (Shell anidada) | ✅ carga sin errores |
| Captura y restauración del atajo | ✅ validado por el usuario |
| Controles → ajustes aplicados en caliente | ✅ validado por el usuario |
| Refrescar layout | ✅ validado por el usuario |
