// Development probe: opens the preferences window with in-memory settings (the real ones are
// never touched), captures it to PNG and exits. Usage: pnpm probe:prefs [dir]
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';
import { buildPreferences } from '../prefs/build.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.zsa-helper';
const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const dir = System.programArgs[0] ?? 'screenshots';

const source = Gio.SettingsSchemaSource.new_from_directory(
    GLib.build_filenamev([here, '..', 'schemas']),
    Gio.SettingsSchemaSource.get_default(),
    false,
);
const schema = source.lookup(SCHEMA_ID, false);
if (!schema) {
    printerr(`Schema ${SCHEMA_ID} not found; run pnpm build first`);
    System.exit(1);
}
const settings = new Gio.Settings({ settings_schema: schema!, backend: Gio.memory_settings_backend_new() });

/** version-name from the built metadata.json, so captures show the real version. */
function extensionVersion(): string {
    try {
        const [, contents] = GLib.file_get_contents(GLib.build_filenamev([here, '..', 'metadata.json']));
        return JSON.parse(new TextDecoder().decode(contents))['version-name'] ?? 'dev';
    } catch {
        return 'dev';
    }
}

function capture(window: Gtk.Widget, path: string): void {
    const width = window.get_width();
    const height = window.get_height();
    const paintable = new Gtk.WidgetPaintable({ widget: window });
    const snapshot = new Gtk.Snapshot();
    paintable.snapshot(snapshot, width, height);
    const node = snapshot.to_node();
    const renderer = window.get_native()?.get_renderer();
    if (!node || !renderer) {
        throw new Error('nothing to render');
    }
    renderer.render_texture(node, null).save_to_png(path);
    print(`wrote ${path}`);
}

const app = new Adw.Application({ application_id: 'dev.zsahelper.PrefsProbe', flags: Gio.ApplicationFlags.NON_UNIQUE });
app.connect('activate', () => {
    const window = new Adw.PreferencesWindow({ application: app });
    buildPreferences(window, settings, extensionVersion());
    window.present();

    GLib.mkdir_with_parents(dir, 0o755);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
        capture(window, `${dir}/prefs-default.png`);
        settings.set_boolean('hud-enabled', false);
        settings.set_string('position', 'custom');
        settings.set_boolean('allow-dragging', true);
        settings.set_string('monitor', 'HDMI-9');
        settings.set_double('scale', 1.4);
        settings.set_strv('toggle-overlay', ['<Control><Shift>F12']);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            capture(window, `${dir}/prefs-changed.png`);
            app.quit();
            return GLib.SOURCE_REMOVE;
        });
        return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
