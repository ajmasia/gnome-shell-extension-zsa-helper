# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.1] - 2026-09-25

### Fixed

- An error in an event listener no longer drops the keyboard connection. Listeners are isolated:
  the error is logged and shown in *Status*, and the other listeners still run. Before, the error
  reached the device read loop, which took it for a disconnection and could loop reconnecting.
- If Mutter cannot list the monitors, the extension retries (after 1, 3 and 10 seconds) and shows
  the problem in *Status* until it works again.

## [0.4.0] - 2026-09-25

### Added

- *Status* tab in the preferences with a live diagnosis:
  - Keyboard connection, raw HID permissions (with a hint about ZSA's udev rule), Oryx protocol
    version, firmware and loaded layout with its source.
  - A warning when the GNOME keyboard layout is not US.
  - The last unexpected error.
- The extension publishes its status on the session bus
  (`org.gnome.Shell.Extensions.ZsaHelper`), which is what the preferences read.
- ZSA keyboards other than the Voyager are recognised and reported as not supported, instead of
  failing with a misleading *Layout not available*.
- README section explaining how the extension works and what it depends on.

### Changed

- The third preferences tab is now called *Status*. It holds the diagnosis, the layout refresh and
  the version.

### Fixed

- Highlighted keys are cleared when the keyboard disconnects while a key is held.
- The overlay follows work area changes, for example when a dock or panel resizes.
- Development-only code is removed from the packaged extension.

## [0.3.0] - 2026-09-25

### Added

- Multi-monitor support:
  - Choose the monitor for the overlay in the preferences.
  - Dragging the overlay onto another screen switches to that monitor and remembers the position
    within it.
  - Monitors are stored by connector (`DP-1`, `HDMI-1`…). While the chosen one is unplugged, the
    overlay uses the primary monitor, and the choice is kept for when it comes back.
- *Reset position* also restores the primary monitor.

### Changed

- The preferences are organised in three tabs: General, Appearance and Layout.

## [0.2.1] - 2026-09-25

### Fixed

- The overlay fades out as a single image. Before, the panel background vanished first and the
  keys lingered on their own for a moment.

## [0.2.0] - 2026-09-25

### Added

- Lock keys show an LED in the corner while Caps Lock or Num Lock is on. The state comes from the
  system, so it is reliable and also follows locks toggled from another keyboard.
- The overlay can be dragged with the mouse. Enable *Move by dragging* in the preferences; only
  then does the overlay take clicks.
- The dragged place is kept as *Custom* position. It is stored relative to the work area, so it
  survives resolution and scale changes, and *Reset position* restores the default.

## [0.1.0] - 2026-09-25

First complete version.

### Added

- `pnpm zip` packs the extension, without development files, into
  `build/zsa-helper@ajmasia.shell-extension.zip`.
- `pnpm run install:local --zip` installs the packed extension. It removes a development symlink
  first, so the installer never deletes through it into `dist/`.
- `ZSA_HELPER_DEBUG=1` logs how long each layer change takes to reach the screen.
- Full README with features, installation, usage, troubleshooting and screenshots.

### Changed

- The overlay looks like a libadwaita window: window background, 15px radius, a subtle outline and
  a barely visible shadow instead of a dark halo.
- Keys are flat, without the inset shadow.

### Fixed

- The nested shell (`pnpm nested`, `pnpm smoke`) always loads the extension from `dist/`, never
  from the copy installed for the user.

## [0.0.6] - 2026-09-25

### Added

- Preferences window:
  - Toggle shortcut with key capture and reset.
  - Automatic HUD switch and its show and hide delays.
  - Overlay position, opacity, size and key highlighting.
  - A button to download the layout again, ignoring the cache.
- `pnpm probe:prefs` opens the preferences with in-memory settings and captures them to PNG.

## [0.0.5] - 2026-09-25

### Added

- Floating keyboard overlay that shows the active layer with the Voyager's real geometry. It is
  drawn by the Shell, not as a window: no title bar, not in Alt+Tab or the overview, and it never
  takes focus or input.
- Key labels:
  - Hold actions shown as secondary labels.
  - Keys inherited from the base layer dimmed.
  - Distinct styles for layer, modifier and action keys.
  - A colour swatch on keys that set an RGB colour.
- `Super+Alt+K` toggles the overlay.
- Automatic HUD: the overlay appears while a non-base layer is held and hides after returning to
  the base layer, with show and hide delays.
- Pressed keys are highlighted in their physical position.
- Status messages when the keyboard is missing, the udev rule is not installed or the layout
  cannot be loaded.
- `pnpm nested --shots` captures the overlay for every layer. The smoke test also checks that
  disabling the extension releases the keyboard.

## [0.0.4] - 2026-09-25

### Added

- Layout service that loads the revision flashed on the keyboard from, in order:
  - Its own disk cache (`~/.cache/zsa-helper/layouts/`).
  - The Oryx GraphQL API, whose result is cached.
  - Keymapp's local cache, read through `sqlite3` when it is installed.
- Oryx and Keymapp ids are validated before they reach the disk, the network or SQL.
- `pnpm probe:layout` script to load a revision and report its source.

## [0.0.3] - 2026-09-25

### Added

- Keyboard connection over the Oryx raw HID protocol:
  - Finds the device by ZSA vendor id and raw HID descriptor.
  - Pairs, then reports layer changes, key presses and the flashed layout and revision ids.
- Automatic reconnection after unplugging or reflashing, and a new handshake after resuming from
  suspend.
- Clear error state when the udev rule is missing and the device cannot be opened.
- `pnpm probe:device` script that prints live keyboard events.

### Fixed

- Pairing now works without Keymapp running: reports are written with `write_bytes_async`, so
  the keyboard no longer receives corrupted commands.

### Changed

- GNOME typings are pinned to the GNOME 48 set.

## [0.0.2] - 2026-09-25

### Added

- Oryx raw HID protocol parser and read-only command builder (firmware version, protocol
  version, pairing).
- Layout normaliser that accepts both the Oryx GraphQL API response and Keymapp's cached
  revisions.
- US keycode label table and key label resolution: hold actions as secondary labels, custom
  labels, one-shot modifiers, layer keys, RGB and system actions.
- Voyager key geometry and matrix-to-key mapping, verified against QMK's `keyboard.json` and a
  compiled Oryx keymap.
- Visibility controller that combines the toggle shortcut with the automatic HUD and its show and
  hide delays.

### Changed

- Transparent and empty keys inherit their label from the base layer.

## [0.0.1] - 2026-09-25

### Added

- Extension and preferences skeleton for GNOME Shell 48, written in TypeScript.
- GSettings schema with the toggle shortcut (`<Super><Alt>k`), HUD, highlighting, position,
  opacity and scale settings.
- Build pipeline: TypeScript compilation, asset copy and schema compilation into `dist/`.
- Local install script that symlinks `dist/` into the user's extensions directory.
- Nested GNOME Shell runner with an isolated dconf database, plus a headless smoke test.
- Vitest setup for the pure core logic.
- GPL-3.0-or-later license.
