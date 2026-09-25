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
