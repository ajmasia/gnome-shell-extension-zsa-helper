#!/usr/bin/env bash
# Runs a nested GNOME Shell (Wayland) to test the extension without logging out.
#
# Settings are isolated in a dedicated dconf database (~/.config/dconf/zsa_helper_nested),
# so enabling the extension here never touches the real session. The extension is loaded from
# dist/ through a private data directory, whatever is installed for the user.
#
# Usage:
#   pnpm nested            interactive nested shell with the extension enabled
#   pnpm nested --smoke    start, check the extension is ACTIVE, disable it, check it is
#                          INACTIVE and print its log lines and any JS errors
#   pnpm nested --shots [dir]
#                          capture the overlay for every layer to PNG files (default:
#                          ./screenshots), using the development hook in src/dev/screenshots.ts
set -euo pipefail

uuid="$(node -p "require('./metadata.json').uuid")"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
printf 'user-db:zsa_helper_nested\n' > "$workdir/profile"

export DCONF_PROFILE="$workdir/profile"

# Load the extension from dist/, never from the user's installed copy. ZSA_NESTED_DATA_HOME
# overrides this to test another installation, e.g. one made from the packed zip.
if [[ -n "${ZSA_NESTED_DATA_HOME:-}" ]]; then
    export XDG_DATA_HOME="$ZSA_NESTED_DATA_HOME"
else
    mkdir -p "$workdir/data/gnome-shell/extensions"
    ln -s "$(pwd)/dist" "$workdir/data/gnome-shell/extensions/$uuid"
    export XDG_DATA_HOME="$workdir/data"
fi
export MUTTER_DEBUG_DUMMY_MODE_SPECS="${RES:-1600x900}"
export UUID="$uuid" MODE="${1:-}" LOG="$workdir/shell.log"
if [[ "$MODE" == "--shots" ]]; then
    export ZSA_HELPER_SCREENSHOT_DIR="$(realpath -m "${2:-screenshots}")"
    rm -f "$ZSA_HELPER_SCREENSHOT_DIR"/*.png "$ZSA_HELPER_SCREENSHOT_DIR/done"
fi

run() {
    dbus-run-session -- bash -c '
        state() {
            gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
                --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" 2>/dev/null \
                | grep -oP "'"'"'state'"'"': <\K[0-9.]+" || echo "?"
        }

        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell enabled-extensions "[\"$UUID\"]"

        gnome-shell --nested --wayland >"$LOG" 2>&1 &
        shell=$!

        for _ in $(seq 1 100); do
            [[ "$(state)" != "?" ]] && break
            sleep 0.2
        done

        if [[ "$MODE" == "--shots" ]]; then
            for _ in $(seq 1 150); do
                [[ -f "$ZSA_HELPER_SCREENSHOT_DIR/done" ]] && break
                sleep 0.2
            done
            kill "$shell"; wait "$shell" 2>/dev/null || true
            echo "--- zsa-helper log ---"; grep -i "zsa-helper" "$LOG" || echo "(none)"
            echo "--- JS errors ---"; grep -iE "JS ERROR|TypeError|SyntaxError|ReferenceError" "$LOG" || echo "(none)"
            ls "$ZSA_HELPER_SCREENSHOT_DIR"
            [[ -f "$ZSA_HELPER_SCREENSHOT_DIR/done" ]]
            exit $?
        fi

        if [[ "$MODE" != "--smoke" ]]; then
            tail -f "$LOG" | grep --line-buffered -iE "zsa-helper|JS ERROR" &
            wait "$shell"
            exit 0
        fi

        hidraw_fds() { find /proc/"$shell"/fd -lname "/dev/hidraw*" 2>/dev/null | wc -l; }

        # ExtensionState (GNOME 48): 1 = ACTIVE, 2 = INACTIVE, 3 = ERROR
        sleep 2; enabled="$(state)"; fds_enabled="$(hidraw_fds)"
        gsettings set org.gnome.shell enabled-extensions "[]"
        sleep 1; disabled="$(state)"; fds_disabled="$(hidraw_fds)"
        kill "$shell"; wait "$shell" 2>/dev/null || true

        echo "--- zsa-helper log ---"; grep -i "zsa-helper" "$LOG" || echo "(none)"
        echo "--- JS errors ---"; grep -iE "JS ERROR|TypeError|SyntaxError|ReferenceError" "$LOG" || echo "(none)"
        echo "state after enable:  $enabled (expected 1 = ACTIVE)"
        echo "state after disable: $disabled (expected 2 = INACTIVE)"
        echo "hidraw fds: $fds_enabled enabled (expected 1 with a keyboard), $fds_disabled disabled (expected 0)"
        [[ "$enabled" == 1* && "$disabled" == 2* && "$fds_disabled" == 0 ]]
    '
}

if [[ "$MODE" == "--smoke" || "$MODE" == "--shots" ]]; then
    run 2>"$workdir/dbus.log"
else
    run
fi
