import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const MODIFIER_KEYVALS = new Set([
    Gdk.KEY_Shift_L, Gdk.KEY_Shift_R, Gdk.KEY_Control_L, Gdk.KEY_Control_R,
    Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Super_L, Gdk.KEY_Super_R,
    Gdk.KEY_Meta_L, Gdk.KEY_Meta_R, Gdk.KEY_ISO_Level3_Shift, Gdk.KEY_Caps_Lock,
]);

/** A row that shows a keyboard shortcut stored in `key` (type `as`) and lets the user change it. */
export function createShortcutRow(settings: Gio.Settings, key: string, title: string, subtitle: string): Adw.ActionRow {
    const row = new Adw.ActionRow({ title, subtitle });
    const label = new Gtk.ShortcutLabel({ disabled_text: 'Disabled', valign: Gtk.Align.CENTER });
    const edit = new Gtk.Button({
        icon_name: 'document-edit-symbolic',
        tooltip_text: 'Change shortcut',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    const reset = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: 'Reset to default',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });

    const sync = () => {
        label.accelerator = settings.get_strv(key)[0] ?? '';
        reset.sensitive = settings.get_user_value(key) !== null;
    };
    sync();
    const handler = settings.connect(`changed::${key}`, sync);
    row.connect('destroy', () => settings.disconnect(handler));

    edit.connect('clicked', () =>
        captureShortcut(row, accelerator => settings.set_strv(key, accelerator ? [accelerator] : [])),
    );
    reset.connect('clicked', () => settings.reset(key));

    row.add_suffix(label);
    row.add_suffix(edit);
    row.add_suffix(reset);
    row.activatable_widget = edit;
    return row;
}

/** Opens a dialog that records the next key combination. `null` means "disable". */
function captureShortcut(parent: Gtk.Widget, done: (accelerator: string | null) => void): void {
    const status = new Adw.StatusPage({
        icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        title: 'Press the new shortcut',
        description: 'Esc to cancel · Backspace to disable',
    });
    const toolbar = new Adw.ToolbarView({ content: status });
    toolbar.add_top_bar(new Adw.HeaderBar());
    const dialog = new Adw.Dialog({ title: 'Set Shortcut', content_width: 420, child: toolbar });

    const controller = new Gtk.EventControllerKey();
    controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
        const mods = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;

        if (mods === 0 && keyval === Gdk.KEY_Escape) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (mods === 0 && keyval === Gdk.KEY_BackSpace) {
            done(null);
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (MODIFIER_KEYVALS.has(keyval)) {
            return Gdk.EVENT_STOP;
        }

        const lower = Gdk.keyval_to_lower(keyval);
        if (mods === 0 || !Gtk.accelerator_valid(lower, mods)) {
            status.description = 'Use at least one modifier, for example Super+Alt+K';
            return Gdk.EVENT_STOP;
        }
        done(Gtk.accelerator_name(lower, mods));
        dialog.close();
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(controller);
    dialog.present(parent);
}
