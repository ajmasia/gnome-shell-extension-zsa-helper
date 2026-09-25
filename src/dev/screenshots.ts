// Development only: captures the overlay for every layer to PNG files, so the UI can be checked
// from a nested shell without a screenshot tool. Enabled by ZSA_HELPER_SCREENSHOT_DIR; this
// module is not part of the packaged extension.
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Gio from '../lib/gio.js';
import type { Layout } from '../core/layout/model.js';
import type { KeyboardOverlay } from '../ui/keyboard-overlay.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area', 'screenshot_area_finish');

const wait = (ms: number) =>
    new Promise<void>(resolve =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }),
    );

async function capture(overlay: KeyboardOverlay, path: string): Promise<void> {
    const [x, y] = overlay.actor.get_transformed_position();
    const [width, height] = overlay.actor.get_transformed_size();
    const pad = 24;
    const file = Gio.File.new_for_path(path);
    const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await new Shell.Screenshot().screenshot_area(x - pad, y - pad, width + 2 * pad, height + 2 * pad, stream);
    stream.close(null);
}

/**
 * Shows each layer, then the base layer with pressed keys and Caps Lock on, and writes `done` when
 * finished.
 */
export async function captureLayers(overlay: KeyboardOverlay, layout: Layout, dir: string): Promise<void> {
    GLib.mkdir_with_parents(dir, 0o755);
    overlay.setVisible(true);
    for (const layer of layout.layers) {
        overlay.showLayer(layer.index);
        await wait(400);
        await capture(overlay, `${dir}/layer-${layer.index}-${layer.title.replace(/[^A-Za-z0-9]+/g, '_')}.png`);
    }

    overlay.showLayer(0);
    const pressed = [7, 13, 24, 51];
    pressed.forEach(i => overlay.pressKey(i));
    overlay.setLockState({ caps: true, num: false });
    await wait(400);
    await capture(overlay, `${dir}/pressed.png`);
    pressed.forEach(i => overlay.releaseKey(i));
    overlay.setVisible(false);

    GLib.file_set_contents(`${dir}/done`, 'ok');
}
