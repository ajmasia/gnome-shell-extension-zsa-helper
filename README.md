# ZSA Helper

A GNOME Shell extension that shows a floating overlay with the characters of the **active layer**
of your [ZSA Voyager](https://www.zsa.io/voyager). It is meant to help while you learn your
layers: press a shortcut, or just hold a layer key, and see what every key does right now.

> **Status:** early development (`0.0.x`). The core logic and the keyboard connection work
> (`pnpm probe:device` prints live layer changes), but the extension does not show an overlay yet. See [the plan](docs/plan/) for the roadmap.

## Requirements

- GNOME Shell 48 (Wayland).
- A ZSA Voyager flashed with an [Oryx](https://configure.zsa.io) layout.
- ZSA's udev rule (`/etc/udev/rules.d/50-zsa.rules`), installed with
  [Keymapp](https://www.zsa.io/flash) or by hand. It grants user access to the keyboard's raw HID
  interface.
- Node.js and pnpm, to build from source.

## Build and install

```bash
pnpm install
pnpm build
pnpm run install:local   # symlinks dist/ into ~/.local/share/gnome-shell/extensions/
```

On Wayland, GNOME Shell only discovers new extensions after you log out and back in. After that,
enable it:

```bash
gnome-extensions enable zsa-helper@ajmasia
```

## Development

| Command | What it does |
|---|---|
| `pnpm build` | Compile TypeScript to `dist/` and compile the GSettings schema |
| `pnpm test` | Run the unit tests (Vitest) for the pure logic in `src/core/` |
| `pnpm typecheck` | Type-check against the GNOME Shell 48 typings |
| `pnpm nested` | Run a nested GNOME Shell with the extension enabled, without logging out |
| `pnpm smoke` | Headless check that the extension enables and disables cleanly in a nested shell |
| `pnpm probe:device` | Print live events from the keyboard (layers, key presses, firmware) |

The nested shell uses its own dconf database (`~/.config/dconf/zsa_helper_nested`), so enabling the
extension there never changes your real session.

## License

[GPL-3.0-or-later](LICENSE)
