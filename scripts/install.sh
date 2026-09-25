#!/usr/bin/env bash
# Installs the built extension for the current user by symlinking dist/ into the
# GNOME Shell extensions directory, so later builds are picked up without reinstalling.
set -euo pipefail

uuid="$(node -p "require('./metadata.json').uuid")"
src="$(pwd)/dist"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

if [[ ! -f "$src/extension.js" ]]; then
    echo "dist/ is not built; run 'pnpm build' first" >&2
    exit 1
fi

mkdir -p "$(dirname "$dest")"

if [[ -L "$dest" ]]; then
    echo "Already linked: $dest -> $(readlink "$dest")"
elif [[ -e "$dest" ]]; then
    echo "$dest exists and is not a symlink; remove it first" >&2
    exit 1
else
    ln -s "$src" "$dest"
    echo "Linked $dest -> $src"
fi

echo "Wayland sessions only load new extensions after logging out; use 'pnpm nested' to test now."
