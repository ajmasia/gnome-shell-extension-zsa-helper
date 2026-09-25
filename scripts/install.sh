#!/usr/bin/env bash
# Installs the extension for the current user.
#
#   pnpm run install:local          symlink dist/ into the extensions directory (development:
#                                   later builds are picked up without reinstalling)
#   pnpm run install:local --zip    install the packed zip from `pnpm zip` (a regular install)
set -euo pipefail

uuid="$(node -p "require('./metadata.json').uuid")"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

if [[ "${1:-}" == "--zip" ]]; then
    zip="build/$uuid.shell-extension.zip"
    if [[ ! -f "$zip" ]]; then
        echo "$zip not found; run 'pnpm zip' first" >&2
        exit 1
    fi
    # Remove a development symlink first: never let the installer delete through it into dist/.
    if [[ -L "$dest" ]]; then
        rm "$dest"
        echo "Removed development symlink $dest"
    fi
    gnome-extensions install --force "$zip"
    echo "Installed $zip"
else
    src="$(pwd)/dist"
    if [[ ! -f "$src/extension.js" ]]; then
        echo "dist/ is not built; run 'pnpm build' first" >&2
        exit 1
    fi
    mkdir -p "$(dirname "$dest")"
    if [[ -L "$dest" ]]; then
        echo "Already linked: $dest -> $(readlink "$dest")"
    elif [[ -e "$dest" ]]; then
        echo "$dest exists and is not a symlink (installed from a zip?); remove it first" >&2
        exit 1
    else
        ln -s "$src" "$dest"
        echo "Linked $dest -> $src"
    fi
fi

echo "Wayland sessions only load new extensions after logging out; use 'pnpm nested' to test now."
