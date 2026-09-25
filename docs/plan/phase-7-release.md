# Phase 7: Empaquetado, documentación y validación final

**Goal:** la extensión se instala de forma reproducible en la sesión real y cumple los 11 criterios
de éxito del PRD. Esta fase publica la versión **0.1.0** (MVP).
**Verification:** `pnpm test && pnpm typecheck && pnpm zip && pnpm run install:local --zip`,
cerrar sesión, volver a entrar, `gnome-extensions enable zsa-helper@ajmasia` y repasar
`docs/plan/acceptance.md` hasta tener todos los criterios en ✅.
**Dependencies:** Phases 1–6.

## Contexto

- Distribución solo personal; el zip debe ser válido para EGO aunque no se publique.
- `gnome-extensions pack` necesita `extension.js`, `metadata.json`, `prefs.js`, `stylesheet.css`
  y `schemas/` en la raíz del directorio fuente, con el resto como `--extra-source`.
- Hay que excluir `dist/dev/` (sondas) del paquete.

## Notas de implementación

- El script se llama `pnpm zip`, no `pack`: `pnpm pack` es un comando integrado de pnpm (genera un
  tarball de npm).
- `gnome-extensions install` extrae en `~/.cache` y mueve a `XDG_DATA_HOME`. Si están en sistemas
  de ficheros distintos falla con *"Can't recursively copy directory"*. En la instalación real
  ambos están en `/`; para probar con un `XDG_DATA_HOME` temporal hay que apuntar también
  `XDG_CACHE_HOME` al mismo sistema de ficheros.
- `install:local --zip` borra antes el enlace simbólico de desarrollo, para que el instalador nunca
  borre a través de él el contenido de `dist/`.
- La latencia se mide con `ZSA_HELPER_DEBUG`: desde el evento de capa hasta el siguiente
  `after-paint` del stage.

## Tasks

### Empaquetado
- [ ] Crear el script de empaquetado → `scripts/pack.sh`. Pasos:
  1. Ejecutar `pnpm build`.
  2. `gnome-extensions pack dist --force --out-dir dist --extra-source=core --extra-source=device --extra-source=layout --extra-source=ui --extra-source=prefs`
     (ajustar a los directorios reales de `dist/`).
  3. Comprobar que el zip no contiene `dev/`.
- [ ] Añadir el script `"pack": "bash scripts/pack.sh"` → `package.json`
- [ ] Revisar que `scripts/install.sh` ofrece dos modos: enlace simbólico (desarrollo) e
  instalación del zip (`--zip`) → `scripts/install.sh`

### Documentación
- [ ] Completar el README → `README.md`
  - Qué hace, con una captura.
  - Requisitos: GNOME 48, regla udev de ZSA y `sqlite3` opcional.
  - Instalación, uso (atajo y HUD), preferencias, problemas frecuentes ("Voyager no detectada",
    "sin permisos", "layout no disponible") y desarrollo (`pnpm nested`, sondas).
- [ ] Crear la tabla de aceptación con los 11 criterios del PRD, cada uno con su columna de
  estado, fecha y notas → `docs/plan/acceptance.md`

### Validación final (sesión real)
- [ ] Repasar los 11 criterios de `docs/prd.md` y marcarlos en `docs/plan/acceptance.md`
- [ ] Medir la latencia de cambio de capa (criterio 1). Registrar los timestamps del evento
  `layer` y del `showLayer` terminado con `GLib.get_monotonic_time()` en modo debug; debe quedar
  por debajo de 100 ms → `src/extension.ts` (el log de debug se controla con la variable de
  entorno `ZSA_HELPER_DEBUG`)
- [ ] Probar sobre una ventana a pantalla completa y con dos monitores → anotar en
  `docs/plan/acceptance.md`
