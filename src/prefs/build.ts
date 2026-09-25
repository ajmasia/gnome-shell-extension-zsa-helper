import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import type { OverlayPosition } from '../core/positioning.js';
import { createShortcutRow } from './shortcut-row.js';

const POSITIONS: [OverlayPosition, string][] = [
    ['bottom-center', 'Bottom center'],
    ['top-center', 'Top center'],
    ['bottom-left', 'Bottom left'],
    ['bottom-right', 'Bottom right'],
    ['top-left', 'Top left'],
    ['top-right', 'Top right'],
    ['custom', 'Custom (dragged)'],
];

/**
 * Fills the preferences window. Kept apart from `ExtensionPreferences` so a development script
 * can open it with in-memory settings.
 */
export function buildPreferences(window: Adw.PreferencesWindow, settings: Gio.Settings, version: string): void {
    const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'input-keyboard-symbolic' });
    page.add(shortcutGroup(settings));
    page.add(hudGroup(settings));
    page.add(appearanceGroup(settings));
    page.add(layoutGroup(settings, version));
    window.add(page);
    window.set_default_size(620, 1000);
}

function shortcutGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Shortcut' });
    group.add(createShortcutRow(settings, 'toggle-overlay', 'Toggle overlay', 'Pins or unpins the overlay from any app'));
    return group;
}

function hudGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Show Automatically',
        description: 'Show the overlay while you hold a layer other than the base layer',
    });

    const enabled = new Adw.SwitchRow({ title: 'Show while a layer is held' });
    settings.bind('hud-enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(enabled);

    for (const [key, title, subtitle] of [
        ['hud-show-delay', 'Show delay', 'Milliseconds a layer must be held before the overlay appears'],
        ['hud-hide-delay', 'Hide delay', 'Milliseconds before the overlay hides after returning to the base layer'],
    ] as const) {
        const row = uintSpinRow(settings, key, title, subtitle, 0, 1000, 50);
        settings.bind('hud-enabled', row, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(row);
    }
    return group;
}

function appearanceGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Appearance' });

    const position = new Adw.ComboRow({
        title: 'Position',
        model: Gtk.StringList.new(POSITIONS.map(([, label]) => label)),
    });
    const syncPosition = () => {
        const index = POSITIONS.findIndex(([nick]) => nick === settings.get_string('position'));
        position.selected = Math.max(0, index);
    };
    syncPosition();
    position.connect('notify::selected', () => {
        const nick = POSITIONS[position.selected]?.[0];
        if (nick && nick !== settings.get_string('position')) {
            settings.set_string('position', nick);
        }
    });
    track(position, settings, 'position', syncPosition);
    group.add(position);

    const dragging = new Adw.SwitchRow({
        title: 'Move by dragging',
        subtitle: 'Drag the overlay with the mouse while it is shown. It then takes clicks instead of passing them through',
    });
    settings.bind('allow-dragging', dragging, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(dragging);

    const reset = new Adw.ActionRow({ title: 'Reset position', subtitle: 'Go back to the default place' });
    const resetButton = new Gtk.Button({ label: 'Reset', valign: Gtk.Align.CENTER });
    resetButton.connect('clicked', () => {
        settings.reset('position');
        settings.reset('custom-position');
    });
    const syncReset = () => {
        resetButton.sensitive = settings.get_user_value('position') !== null || settings.get_user_value('custom-position') !== null;
    };
    syncReset();
    track(resetButton, settings, 'position', syncReset);
    track(resetButton, settings, 'custom-position', syncReset);
    reset.add_suffix(resetButton);
    reset.activatable_widget = resetButton;
    group.add(reset);

    group.add(doubleSpinRow(settings, 'opacity', 'Opacity', 0.3, 1, 0.05, 2));
    group.add(doubleSpinRow(settings, 'scale', 'Size', 0.5, 2, 0.1, 1));

    const highlight = new Adw.SwitchRow({ title: 'Highlight pressed keys' });
    settings.bind('highlight-enabled', highlight, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(highlight);
    return group;
}

function layoutGroup(settings: Gio.Settings, version: string): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Layout',
        description: 'The layout is read from the keyboard and downloaded from Oryx automatically',
    });

    const refresh = new Adw.ActionRow({
        title: 'Refresh layout',
        subtitle: 'Download the flashed layout again, ignoring the local cache',
    });
    const button = new Gtk.Button({ label: 'Refresh', valign: Gtk.Align.CENTER });
    button.connect('clicked', () => settings.set_uint('refresh-requested', settings.get_uint('refresh-requested') + 1));
    refresh.add_suffix(button);
    refresh.activatable_widget = button;
    group.add(refresh);

    group.add(new Adw.ActionRow({ title: 'Version', subtitle: version, css_classes: ['property'] }));
    return group;
}

function doubleSpinRow(
    settings: Gio.Settings,
    key: string,
    title: string,
    min: number,
    max: number,
    step: number,
    digits: number,
): Adw.SpinRow {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.title = title;
    row.digits = digits;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** `settings.bind` cannot map a `u` key to the double `value` property, so sync it by hand. */
function uintSpinRow(
    settings: Gio.Settings,
    key: string,
    title: string,
    subtitle: string,
    min: number,
    max: number,
    step: number,
): Adw.SpinRow {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.title = title;
    row.subtitle = subtitle;
    const sync = () => {
        row.value = settings.get_uint(key);
    };
    sync();
    row.connect('notify::value', () => {
        const value = Math.round(row.value);
        if (value !== settings.get_uint(key)) {
            settings.set_uint(key, value);
        }
    });
    track(row, settings, key, sync);
    return row;
}

/** Runs `sync` when `key` changes, until `widget` is destroyed. */
function track(widget: Gtk.Widget, settings: Gio.Settings, key: string, sync: () => void): void {
    const handler = settings.connect(`changed::${key}`, sync);
    widget.connect('destroy', () => settings.disconnect(handler));
}
