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
