# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
