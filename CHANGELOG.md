# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
