#!/usr/bin/env bash
# Builds the extension and packs it into build/<uuid>.shell-extension.zip, ready for
# `gnome-extensions install`. Development-only code (dist/dev/) is left out.
set -euo pipefail

uuid="$(node -p "require('./metadata.json').uuid")"
out="build"

rm -rf dist
pnpm build >/dev/null

extra=()
for dir in dist/*/; do
    name="$(basename "$dir")"
    [[ "$name" == "dev" || "$name" == "schemas" ]] && continue
    extra+=("--extra-source=$name")
done

mkdir -p "$out"
gnome-extensions pack dist --force --out-dir="$out" "${extra[@]}"

zip="$out/$uuid.shell-extension.zip"
if unzip -l "$zip" | grep -q ' dev/'; then
    echo "error: $zip contains development files" >&2
    exit 1
fi
unzip -l "$zip" | tail -n +4 | head -n -2 | awk '{print $4}'
echo "Packed $zip"
