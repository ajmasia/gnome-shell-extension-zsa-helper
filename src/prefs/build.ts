import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import type { OverlayPosition } from '../core/positioning.js';
import { createShortcutRow } from './shortcut-row.js';
import { createStatusGroup } from './status-group.js';

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
    // With more than one page, Adwaita shows them as tabs in the header bar.
    window.add(page('General', 'input-keyboard-symbolic', [shortcutGroup(settings), hudGroup(settings), keysGroup(settings)]));
    window.add(page('Appearance', 'applications-graphics-symbolic', [positionGroup(settings), styleGroup(settings)]));
    window.add(page('Status', 'utilities-system-monitor-symbolic', [createStatusGroup(), layoutGroup(settings, version)]));
    window.set_default_size(620, 720);
}

function page(title: string, iconName: string, groups: Adw.PreferencesGroup[]): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({ name: title.toLowerCase(), title, icon_name: iconName });
    for (const group of groups) {
        page.add(group);
    }
    return page;
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

function keysGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Keys' });
    const highlight = new Adw.SwitchRow({ title: 'Highlight pressed keys' });
    settings.bind('highlight-enabled', highlight, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(highlight);
    return group;
}

function positionGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Position' });

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

    group.add(monitorRow(settings));

    const dragging = new Adw.SwitchRow({
        title: 'Move by dragging',
        subtitle: 'Drag the overlay with the mouse while it is shown. It then takes clicks instead of passing them through',
    });
    settings.bind('allow-dragging', dragging, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(dragging);

    const reset = new Adw.ActionRow({ title: 'Reset position', subtitle: 'Go back to the default place' });
    const resetButton = new Gtk.Button({ label: 'Reset', valign: Gtk.Align.CENTER });
    resetButton.connect('clicked', () => {
        for (const key of POSITION_KEYS) {
            settings.reset(key);
        }
    });
    const syncReset = () => {
        resetButton.sensitive = POSITION_KEYS.some(key => settings.get_user_value(key) !== null);
    };
    syncReset();
    for (const key of POSITION_KEYS) {
        track(resetButton, settings, key, syncReset);
    }
    reset.add_suffix(resetButton);
    reset.activatable_widget = resetButton;
    group.add(reset);
    return group;
}

function styleGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Style' });
    group.add(doubleSpinRow(settings, 'opacity', 'Opacity', 0.3, 1, 0.05, 2));
    group.add(doubleSpinRow(settings, 'scale', 'Size', 0.5, 2, 0.1, 1));
    return group;
}

/** Settings that *Reset position* restores. */
const POSITION_KEYS = ['position', 'custom-position', 'monitor'];

/**
 * Chooses the monitor by connector. Lists the primary monitor, the connected monitors and, if
 * the stored one is unplugged, that one too, so the choice is never lost silently.
 */
function monitorRow(settings: Gio.Settings): Adw.ComboRow {
    const row = new Adw.ComboRow({ title: 'Monitor', subtitle: 'Dragging the overlay to another screen also changes it' });
    const display = Gdk.Display.get_default();
    let connectors: string[] = [];
    let syncing = false;

    const rebuild = () => {
        const stored = settings.get_string('monitor');
        const labels = ['Primary'];
        connectors = [''];
        const monitors = display?.get_monitors();
        for (let i = 0; i < (monitors?.get_n_items() ?? 0); i++) {
            const monitor = monitors!.get_item(i) as Gdk.Monitor;
            const connector = monitor.get_connector();
            if (!connector) {
                continue;
            }
            connectors.push(connector);
            labels.push(`${monitor.get_description() ?? connector} (${connector})`);
        }
        if (stored !== '' && !connectors.includes(stored)) {
            connectors.push(stored);
            labels.push(`${stored} (not connected)`);
        }

        syncing = true;
        row.model = Gtk.StringList.new(labels);
        row.selected = Math.max(0, connectors.indexOf(stored));
        syncing = false;
    };
    rebuild();

    row.connect('notify::selected', () => {
        const connector = connectors[row.selected];
        if (!syncing && connector !== undefined && connector !== settings.get_string('monitor')) {
            settings.set_string('monitor', connector);
        }
    });
    track(row, settings, 'monitor', rebuild);
    const monitors = display?.get_monitors();
    if (monitors) {
        const handler = monitors.connect('items-changed', rebuild);
        row.connect('destroy', () => monitors.disconnect(handler));
    }
    return row;
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
