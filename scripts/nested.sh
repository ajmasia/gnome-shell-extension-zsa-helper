#!/usr/bin/env bash
# Runs a nested GNOME Shell (Wayland) to test the extension without logging out.
#
# Settings are isolated in a dedicated dconf database (~/.config/dconf/zsa_helper_nested),
# so enabling the extension here never touches the real session.
#
# Usage:
#   pnpm nested            interactive nested shell with the extension enabled
#   pnpm nested --smoke    start, check the extension is ACTIVE, disable it, check it is
#                          INACTIVE and print its log lines and any JS errors
set -euo pipefail

uuid="$(node -p "require('./metadata.json').uuid")"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
printf 'user-db:zsa_helper_nested\n' > "$workdir/profile"

export DCONF_PROFILE="$workdir/profile"
export MUTTER_DEBUG_DUMMY_MODE_SPECS="${RES:-1600x900}"
export UUID="$uuid" MODE="${1:-}" LOG="$workdir/shell.log"

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

        if [[ "$MODE" != "--smoke" ]]; then
            tail -f "$LOG" | grep --line-buffered -iE "zsa-helper|JS ERROR" &
            wait "$shell"
            exit 0
        fi

        # ExtensionState (GNOME 48): 1 = ACTIVE, 2 = INACTIVE, 3 = ERROR
        sleep 1; enabled="$(state)"
        gsettings set org.gnome.shell enabled-extensions "[]"
        sleep 1; disabled="$(state)"
        kill "$shell"; wait "$shell" 2>/dev/null || true

        echo "--- zsa-helper log ---"; grep -i "zsa-helper" "$LOG" || echo "(none)"
        echo "--- JS errors ---"; grep -iE "JS ERROR|TypeError|SyntaxError|ReferenceError" "$LOG" || echo "(none)"
        echo "state after enable:  $enabled (expected 1 = ACTIVE)"
        echo "state after disable: $disabled (expected 2 = INACTIVE)"
        [[ "$enabled" == 1* && "$disabled" == 2* ]]
    '
}

if [[ "$MODE" == "--smoke" ]]; then
    run 2>"$workdir/dbus.log"
else
    run
fi
