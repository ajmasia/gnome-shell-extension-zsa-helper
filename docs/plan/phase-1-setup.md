# Phase 1: Setup del proyecto y esqueleto de la extensión

**Goal:** una extensión TypeScript vacía compila, se instala y se activa y desactiva sin errores en
una Shell anidada de GNOME 48. Los tests (todavía vacíos) corren con Vitest.
**Verification:** `pnpm build && pnpm test && pnpm run install:local && gnome-extensions info zsa-helper@ajmasia`
(y a mano: `pnpm nested`, activar con `gnome-extensions enable zsa-helper@ajmasia` dentro de la
Shell anidada, sin errores en el log).
**Dependencies:** ninguna.

## Contexto

- Proyecto: `zsa-helper`, extensión de GNOME Shell 48.7 (Wayland) que muestra un overlay con la
  capa activa de la ZSA Voyager. PRD en `docs/prd.md` y spike en
  `docs/spikes/spike-voyager-layer-overlay.md`.
- Decisiones cerradas:
  - Paquete único, sin workspaces de pnpm.
  - TypeScript + `@girs/*` (versiones 48.x), compilado con `tsc` a JavaScript ESM legible, sin
    empaquetar.
  - Tests con Vitest solo para `src/core/` (lógica pura, sin `gi://`).
  - Uso personal, pero con código compatible con las guidelines de EGO.
- Herramientas disponibles: node + pnpm (vía fnm), `glib-compile-schemas`, `gnome-extensions`, gjs
  1.82.3.
- Shell anidada verificada en el spike:
  `MUTTER_DEBUG_DUMMY_MODE_SPECS=1280x720 dbus-run-session -- gnome-shell --nested --wayland`.

## Tasks

### Tooling
- [ ] Crear `package.json`:
  - Nombre `zsa-helper`, `"type": "module"`, `"private": true`.
  - Scripts `build` (`tsc && node scripts/copy-assets.mjs`), `test` (`vitest run`),
    `test:watch`, `typecheck` (`tsc --noEmit`), `install:local` (`bash scripts/install.sh`) y
    `nested` (`bash scripts/nested.sh`).
  - → `package.json`
- [ ] Instalar dependencias de desarrollo: `pnpm add -D typescript vitest @girs/gjs @girs/gnome-shell@^48 @girs/adw-1 @girs/soup-3.0`
- [ ] Configurar TypeScript → `tsconfig.json`
  - `target: ES2022`, `module: ES2022`, `moduleResolution: bundler`, `strict: true`,
    `outDir: dist`, `rootDir: src`, `lib: ["ES2022"]`.
  - `types: ["@girs/gjs", "@girs/gnome-shell/ambient", "@girs/gnome-shell/extensions/global"]`
    (ajustar a los paths reales que exporte `@girs/gnome-shell@48`).
  - Excluir `tests/`.
- [ ] Configurar Vitest para `tests/**/*.test.ts` → `vitest.config.ts`
- [ ] Añadir `.gitignore` con `node_modules/`, `dist/` y `*.zip` → `.gitignore`

### Metadatos y esquema
- [ ] Crear `metadata.json` → `metadata.json`
  - `uuid: "zsa-helper@ajmasia"`, `name: "ZSA Helper"`, `shell-version: ["48"]`,
    `settings-schema: "org.gnome.shell.extensions.zsa-helper"`, `url` vacío.
- [ ] Crear el esquema GSettings con todas las claves del PRD →
  `schemas/org.gnome.shell.extensions.zsa-helper.gschema.xml`

  | Clave | Tipo | Valor por defecto |
  |---|---|---|
  | `toggle-overlay` | `as` | `['<Super><Alt>k']` |
  | `hud-enabled` | `b` | `true` |
  | `hud-show-delay` | `u` | `150` |
  | `hud-hide-delay` | `u` | `300` |
  | `highlight-enabled` | `b` | `true` |
  | `position` | `s`, choices `bottom-center`/`top-center`/`bottom-left`/`bottom-right`/`top-left`/`top-right` | `'bottom-center'` |
  | `opacity` | `d`, rango 0.3–1.0 | `0.92` |
  | `scale` | `d`, rango 0.5–2.0 | `1.0` |
  | `refresh-requested` | `u` (técnica: las preferencias la incrementan para forzar un refresco del layout) | `0` |

### Esqueleto de la extensión
- [ ] Crear la clase `ZsaHelperExtension extends Extension` con `enable()` y `disable()` que solo
  registran un log (`console.log('[zsa-helper] enabled')`) → `src/extension.ts`
- [ ] Crear la clase `ZsaHelperPrefs extends ExtensionPreferences` con
  `fillPreferencesWindow()`, que de momento añade una `Adw.PreferencesPage` vacía →
  `src/prefs.ts`
- [ ] Añadir un placeholder para que Vitest tenga algo que ejecutar → `src/core/index.ts`
- [ ] Añadir un test mínimo de humo → `tests/smoke.test.ts`

### Scripts
- [ ] Copiar `metadata.json` y `schemas/` a `dist/` y ejecutar `glib-compile-schemas dist/schemas`
  → `scripts/copy-assets.mjs`
- [ ] Crear el script de instalación: enlace simbólico de `dist/` a
  `~/.local/share/gnome-shell/extensions/zsa-helper@ajmasia` (si no existe), con aviso de que la
  sesión real necesita cerrar sesión para cargar cambios → `scripts/install.sh`
- [ ] Crear el lanzador de la Shell anidada:
  `MUTTER_DEBUG_DUMMY_MODE_SPECS=${RES:-1600x900} dbus-run-session -- gnome-shell --nested --wayland`,
  con la salida filtrada por `zsa-helper` si se pasa `--grep` → `scripts/nested.sh`

### Documentación y licencia
- [ ] Añadir el texto completo de la GPL-3.0 → `LICENSE`
- [ ] Crear el changelog en formato Keep a Changelog, con la sección `Unreleased` → `CHANGELOG.md`
- [ ] Crear un README mínimo:
  - Requisitos: GNOME 48 y la regla udev de ZSA en `/etc/udev/rules.d/50-zsa.rules`.
  - Comandos `pnpm build`, `pnpm test`, `pnpm run install:local` y `pnpm nested`.
  - → `README.md`
