import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {
    describeInputSource,
    describeStatus,
    parseStatus,
    STATUS_BUS_NAME,
    STATUS_INTERFACE,
    STATUS_OBJECT_PATH,
    type StatusLevel,
    type StatusRow,
} from '../core/status.js';

const ICONS: Record<StatusLevel, [string, string]> = {
    ok: ['emblem-ok-symbolic', 'success'],
    warning: ['dialog-warning-symbolic', 'warning'],
    error: ['dialog-error-symbolic', 'error'],
    pending: ['content-loading-symbolic', 'dim-label'],
};

/**
 * Live diagnosis: reads the status the extension publishes on D-Bus from inside the Shell, plus
 * the GNOME keyboard layout, which the labels depend on.
 */
export function createStatusGroup(): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Status',
        description: 'Updates live while this window is open',
    });
    const inputSources = new Gio.Settings({ schema_id: 'org.gnome.desktop.input-sources' });
    let proxy: Gio.DBusProxy | null = null;
    let rows: Adw.ActionRow[] = [];

    const render = () => {
        for (const row of rows) {
            group.remove(row);
        }
        const json = proxy?.get_cached_property('Status')?.deepUnpack() as string | undefined;
        const status: StatusRow[] =
            json === undefined
                ? [{ title: 'Extension', value: 'Not running. Enable it with the Extensions app', level: 'warning' }]
                : describeStatus(parseStatus(json));
        const sources = inputSources.get_value('sources').deepUnpack() as [string, string][];
        rows = [...status, describeInputSource(sources)].map(statusRow);
        for (const row of rows) {
            group.add(row);
        }
    };
    render();

    const sourcesHandler = inputSources.connect('changed::sources', render);
    group.connect('destroy', () => inputSources.disconnect(sourcesHandler));

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SESSION,
        Gio.DBusProxyFlags.DO_NOT_AUTO_START,
        null,
        STATUS_BUS_NAME,
        STATUS_OBJECT_PATH,
        STATUS_INTERFACE,
        null,
        (_source, result) => {
            try {
                proxy = Gio.DBusProxy.new_for_bus_finish(result);
            } catch (e) {
                console.warn(`[zsa-helper] cannot read the extension status: ${e}`);
                return;
            }
            const handlers = [
                proxy.connect('g-properties-changed', render),
                proxy.connect('g-signal', (_proxy, _sender, signal) => signal === 'StatusChanged' && render()),
            ];
            group.connect('destroy', () => handlers.forEach(id => proxy?.disconnect(id)));
            render();
        },
    );
    return group;
}

function statusRow({ title, value, level }: StatusRow): Adw.ActionRow {
    const row = new Adw.ActionRow({ title, subtitle: value, subtitle_selectable: true, css_classes: ['property'] });
    const [icon, style] = ICONS[level];
    row.add_prefix(new Gtk.Image({ icon_name: icon, css_classes: [style], valign: Gtk.Align.CENTER }));
    return row;
}
